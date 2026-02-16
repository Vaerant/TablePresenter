// scripts/index_blocks.js
require('dotenv').config();
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

// Keep system awake on Windows
let keepAwakeInterval;
if (process.platform === 'win32') {
  const { exec } = require('child_process');
  keepAwakeInterval = setInterval(() => {
    exec('powershell.exe -Command "[System.Windows.Forms.Cursor]::Position = [System.Windows.Forms.Cursor]::Position"', () => {});
  }, 30000); // Every 30 seconds
  
  // Clean up on exit
  process.on('exit', () => {
    if (keepAwakeInterval) clearInterval(keepAwakeInterval);
  });
  process.on('SIGINT', () => {
    if (keepAwakeInterval) clearInterval(keepAwakeInterval);
    process.exit();
  });
}

const DB_PAGE_LIMIT = 1000; // Page size for SQLite SELECTs

// Zilliz config
const DEFAULT_ZILLIZ_ENDPOINT = "url/v2/vectordb/entities/insert";
const ZILLIZ_ENDPOINT = process.env.ZILLIZ_ENDPOINT || DEFAULT_ZILLIZ_ENDPOINT;
const DEFAULT_ZILLIZ_QUERY_ENDPOINT = "url/v2/vectordb/entities/query";
const ZILLIZ_QUERY_ENDPOINT = process.env.ZILLIZ_QUERY_ENDPOINT || DEFAULT_ZILLIZ_QUERY_ENDPOINT;
const DEFAULT_ZILLIZ_DELETE_ENDPOINT = "url/v2/vectordb/entities/delete";
const ZILLIZ_DELETE_ENDPOINT = process.env.ZILLIZ_DELETE_ENDPOINT || DEFAULT_ZILLIZ_DELETE_ENDPOINT;
const ZILLIZ_API_KEY = process.env.ZILLIZ_API_KEY;
const ZILLIZ_COLLECTION_NAME = process.env.ZILLIZ_COLLECTION_NAME || "sermon_blocks";
// New: configurable batch sizes
const ZILLIZ_INSERT_BATCH = parseInt(process.env.ZILLIZ_INSERT_BATCH || "50", 10);
const ZILLIZ_QUERY_BATCH = parseInt(process.env.ZILLIZ_QUERY_BATCH || "500", 10);
const ZILLIZ_EXISTING_CHECK_BATCH = parseInt(process.env.ZILLIZ_EXISTING_CHECK_BATCH || "10000", 10);

// Helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}
async function postWithRetry(fetchFn, url, options, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetchFn(url, options);
    if (res.ok) return res;
    const body = await res.text().catch(() => "");
    // Don't retry non-rate-limit 4xx
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new Error(`Zilliz request failed (${res.status}): ${body}`);
    }
    if (attempt === tries) {
      throw new Error(`Zilliz request failed (${res.status}): ${body}`);
    }
    await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
  }
}

// New: fetch existing ids before insert (chunked)
async function fetchExistingIds(fetchFn, ids) {
  if (!ids.length) return new Set();
  const found = new Set();
  
  console.log(`Checking for existing IDs: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '...' : ''}`);
  
  for (const chunk of chunkArray(ids, ZILLIZ_EXISTING_CHECK_BATCH)) {
    const filter = `id in [${chunk.join(",")}]`;
    const body = {
      collectionName: ZILLIZ_COLLECTION_NAME,
      filter,
      outputFields: ["id"],
      limit: chunk.length
    };
    
    const res = await postWithRetry(fetchFn, ZILLIZ_QUERY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ZILLIZ_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    
    const json = await res.json().catch(() => ({}));
    console.log(`Query response sample:`, JSON.stringify(json, null, 2).slice(0, 500));
    
    const data = json && json.data;
    let rows = [];
    if (Array.isArray(data)) rows = data;
    else if (data && Array.isArray(data.rows)) rows = data.rows;
    else if (data && Array.isArray(data.entities)) rows = data.entities;
    
    console.log(`Found ${rows.length} existing records in this chunk`);
    
    rows.forEach(r => {
      const v = r && (r.id ?? (r.fields && r.fields.id));
      if (v !== undefined && v !== null) {
        found.add(v);
        console.log(`Existing ID found: ${v}`);
      }
    });
  }
  
  console.log(`Total existing IDs found: ${found.size}`);
  return found;
}

// Optimized: fetch existing block_uids instead of IDs (much faster)
async function fetchExistingBlockUids(fetchFn, blockUids) {
  if (!blockUids.length) return new Set();
  const found = new Set();
  
  console.log(`Checking for existing block UIDs: ${blockUids.slice(0, 3).join(', ')}${blockUids.length > 3 ? '...' : ''}`);
  
  for (const chunk of chunkArray(blockUids, ZILLIZ_EXISTING_CHECK_BATCH)) {
    // Use block_uid filter instead of ID - much more efficient
    const filter = `block_uid in [${chunk.map(uid => `"${uid}"`).join(",")}]`;
    const body = {
      collectionName: ZILLIZ_COLLECTION_NAME,
      filter,
      outputFields: ["block_uid"],
      limit: chunk.length
    };
    
    const res = await postWithRetry(fetchFn, ZILLIZ_QUERY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ZILLIZ_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    
    const json = await res.json().catch(() => ({}));
    const data = json && json.data;
    let rows = [];
    if (Array.isArray(data)) rows = data;
    else if (data && Array.isArray(data.rows)) rows = data.rows;
    else if (data && Array.isArray(data.entities)) rows = data.entities;
    
    rows.forEach(r => {
      const uid = r && (r.block_uid ?? (r.fields && r.fields.block_uid));
      if (uid) found.add(uid);
    });
  }
  
  console.log(`Found ${found.size} existing block UIDs out of ${blockUids.length} checked`);
  return found;
}

// New: find blocks ending in 'b0'
async function findBlocksEndingInB0(fetchFn) {
  const blocksToDelete = [];
  
  // Use a filter to find blocks ending in 'b0' directly
  const body = {
    collectionName: ZILLIZ_COLLECTION_NAME,
    filter: "block_uid like \"%-b0\"",
    outputFields: ["id", "block_uid"],
    limit: 16384 // Maximum limit for Zilliz
  };
  
  const res = await postWithRetry(fetchFn, ZILLIZ_QUERY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ZILLIZ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  
  const json = await res.json().catch(() => ({}));
  console.log("Query response:", JSON.stringify(json, null, 2));
  
  const data = json && json.data;
  let rows = [];
  if (Array.isArray(data)) rows = data;
  else if (data && Array.isArray(data.rows)) rows = data.rows;
  else if (data && Array.isArray(data.entities)) rows = data.entities;
  
  const b0Blocks = rows.filter(r => {
    const blockUid = r.block_uid || (r.fields && r.fields.block_uid);
    return blockUid && blockUid.endsWith('-b0');
  });
  
  console.log(`Found ${b0Blocks.length} blocks with UIDs ending in 'b0'`);
  if (b0Blocks.length > 0) {
    console.log("Sample block UIDs:", b0Blocks.slice(0, 5).map(r => r.block_uid || (r.fields && r.fields.block_uid)));
  }
  
  return b0Blocks.map(r => r.id || (r.fields && r.fields.id));
}

// New: delete blocks by IDs
async function deleteBlocksByIds(fetchFn, ids) {
  if (!ids.length) return 0;
  
  const batches = chunkArray(ids, ZILLIZ_QUERY_BATCH);
  let totalDeleted = 0;
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const filter = `id in [${batch.join(",")}]`;
    
    const body = {
      collectionName: ZILLIZ_COLLECTION_NAME,
      filter
    };
    
    console.log(`Deleting batch ${i + 1}/${batches.length} with filter: ${filter}`);
    
    const res = await postWithRetry(fetchFn, ZILLIZ_DELETE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ZILLIZ_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    
    const json = await res.json().catch(() => ({}));
    console.log(`Delete response for batch ${i + 1}:`, json);
    
    totalDeleted += batch.length;
    console.log(`Deleted batch ${i + 1}/${batches.length} (${batch.length} blocks). Total deleted: ${totalDeleted}`);
  }
  
  return totalDeleted;
}

// New: main function for deletion
async function deleteB0Blocks() {
  const fetch = global.fetch || (await import("node-fetch")).default;
  if (!ZILLIZ_API_KEY) {
    throw new Error("ZILLIZ_API_KEY env var is required for Zilliz operations.");
  }
  
  console.log("🔍 Finding blocks ending in 'b0'...");
  const blocksToDelete = await findBlocksEndingInB0(fetch);
  
  if (blocksToDelete.length === 0) {
    console.log("✅ No blocks ending in 'b0' found.");
    return;
  }
  
  console.log(`🗑️  Found ${blocksToDelete.length} blocks ending in 'b0'. Deleting...`);
  const deletedCount = await deleteBlocksByIds(fetch, blocksToDelete);
  console.log(`✅ Successfully deleted ${deletedCount} blocks ending in 'b0'.`);
}

// New: find duplicate blocks based on block_uid
async function findDuplicateBlocks(fetchFn) {
  const allBlocks = [];
  let offset = 0;
  const batchSize = 1000;
  
  // Fetch all blocks in batches
  while (true) {
    const body = {
      collectionName: ZILLIZ_COLLECTION_NAME,
      outputFields: ["id", "block_uid"],
      limit: batchSize,
      offset: offset
    };
    
    const res = await postWithRetry(fetchFn, ZILLIZ_QUERY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ZILLIZ_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    
    const json = await res.json().catch(() => ({}));
    const data = json && json.data;
    let rows = [];
    if (Array.isArray(data)) rows = data;
    else if (data && Array.isArray(data.rows)) rows = data.rows;
    else if (data && Array.isArray(data.entities)) rows = data.entities;
    
    if (rows.length === 0) break;
    
    allBlocks.push(...rows.map(r => ({
      id: r.id || (r.fields && r.fields.id),
      block_uid: r.block_uid || (r.fields && r.fields.block_uid)
    })));
    
    offset += batchSize;
    console.log(`Fetched ${allBlocks.length} blocks so far...`);
    
    if (rows.length < batchSize) break; // Last batch
  }
  
  console.log(`Total blocks fetched: ${allBlocks.length}`);
  
  // Find duplicates by block_uid
  const uidMap = new Map();
  const duplicateIds = [];
  
  for (const block of allBlocks) {
    if (!block.block_uid) continue;
    
    if (uidMap.has(block.block_uid)) {
      // Keep the first occurrence, mark others as duplicates
      duplicateIds.push(block.id);
      console.log(`Duplicate found: ${block.block_uid} (id: ${block.id})`);
    } else {
      uidMap.set(block.block_uid, block.id);
    }
  }
  
  console.log(`Found ${duplicateIds.length} duplicate blocks`);
  return duplicateIds;
}

// New: main function for duplicate removal
async function removeDuplicateBlocks() {
  const fetch = global.fetch || (await import("node-fetch")).default;
  if (!ZILLIZ_API_KEY) {
    throw new Error("ZILLIZ_API_KEY env var is required for Zilliz operations.");
  }
  
  console.log("🔍 Finding duplicate blocks...");
  const duplicateIds = await findDuplicateBlocks(fetch);
  
  if (duplicateIds.length === 0) {
    console.log("✅ No duplicate blocks found.");
    return;
  }
  
  console.log(`🗑️  Found ${duplicateIds.length} duplicate blocks. Deleting...`);
  const deletedCount = await deleteBlocksByIds(fetch, duplicateIds);
  console.log(`✅ Successfully deleted ${deletedCount} duplicate blocks.`);
}

// New: bulk fetch block_uids from SQLite (many pages at once)
async function fetchSqliteBlockUidsBulk(db, limit = 50000) {
  const blockUids = new Set();
  let offset = 0;
  const batchSize = 10000; // Fetch 10k at a time from SQLite
  
  console.log(`📊 Fetching block UIDs from SQLite in batches of ${batchSize}...`);
  
  while (blockUids.size < limit) {
    const rows = await db.all(
      "SELECT uid FROM blocks WHERE embedding IS NOT NULL AND uid NOT LIKE '%-b0' LIMIT ? OFFSET ?",
      batchSize,
      offset
    );
    
    if (rows.length === 0) break;
    
    for (const row of rows) {
      blockUids.add(row.uid);
    }
    
    offset += batchSize;
    console.log(`Fetched ${blockUids.size} block UIDs from SQLite so far...`);
    
    if (rows.length < batchSize) break; // Last batch
  }
  
  console.log(`📊 Total block UIDs fetched from SQLite: ${blockUids.size}`);
  return blockUids;
}

// New: bulk fetch block_uids from Zilliz (large chunks)
async function fetchZillizBlockUidsBulk(fetchFn, limit = 100000) {
  const blockUids = new Set();
  let offset = 0;
  let batchSize = 16384;
  
  console.log(`📊 Fetching block UIDs from Zilliz in batches of ${batchSize}...`);
  
  while (blockUids.size < limit) {
    const body = {
      collectionName: ZILLIZ_COLLECTION_NAME,
      outputFields: ["block_uid"],
      limit: batchSize,
      offset: offset
    };
    
    const res = await postWithRetry(fetchFn, ZILLIZ_QUERY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ZILLIZ_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    
    const json = await res.json().catch(() => ({}));
    const data = json && json.data;
    let rows = [];
    if (Array.isArray(data)) rows = data;
    else if (data && Array.isArray(data.rows)) rows = data.rows;
    else if (data && Array.isArray(data.entities)) rows = data.entities;
    
    if (rows.length === 0) break;
    
    for (const row of rows) {
      const uid = row.block_uid || (row.fields && row.fields.block_uid);
      if (uid) blockUids.add(uid);
    }
    
    offset += batchSize;
    console.log(`Fetched ${blockUids.size} block UIDs from Zilliz so far...`);
    
    if (rows.length < batchSize) break; // Last batch
  }
  
  console.log(`📊 Total block UIDs fetched from Zilliz: ${blockUids.size}`);
  return blockUids;
}

// Modified: optimized bulk existence check
async function performBulkExistenceCheck(db, fetchFn) {
  console.log(`🚀 Starting bulk existence check...`);
  
  // Fetch large batches from both sources
  const [sqliteUids, zillizUids] = await Promise.all([
    fetchSqliteBlockUidsBulk(db, 100000), // Fetch up to 100k from SQLite
    fetchZillizBlockUidsBulk(fetchFn, 100000) // Fetch up to 100k from Zilliz
  ]);
  
  // Calculate differences in memory
  const newUids = new Set();
  for (const uid of sqliteUids) {
    if (!zillizUids.has(uid)) {
      newUids.add(uid);
    }
  }
  
  console.log(`📊 Bulk check results:`);
  console.log(`  - SQLite UIDs: ${sqliteUids.size}`);
  console.log(`  - Zilliz UIDs: ${zillizUids.size}`);
  console.log(`  - New UIDs to insert: ${newUids.size}`);
  
  return newUids;
}

async function main() {
  // Open SQLite
  const db = await open({ filename: "sermons.db", driver: sqlite3.Database });

  // Get total count for progress tracking
  const totalCountResult = await db.get("SELECT COUNT(*) as total FROM blocks WHERE embedding IS NOT NULL AND uid NOT LIKE '%-b0'");
  const totalRows = totalCountResult.total;
  
  console.log(`📊 Total non-b0 rows to process: ${totalRows}`);

  // Prepare fetch and validate env
  const fetch = global.fetch || (await import("node-fetch")).default;
  if (!ZILLIZ_API_KEY) {
    throw new Error("ZILLIZ_API_KEY env var is required for Zilliz inserts.");
  }

  // Perform bulk existence check first
  const newUidsToInsert = await performBulkExistenceCheck(db, fetch);
  
  if (newUidsToInsert.size === 0) {
    console.log("✅ No new blocks to insert. All blocks already exist in Zilliz.");
    await db.close();
    return;
  }

  // Now process only the blocks that need to be inserted
  const DB_LARGE_PAGE_LIMIT = 5000; // Use larger pages since we're only processing new blocks
  let totalProcessed = 0;
  let offset = 0;

  while (true) {
    console.log(`\n📄 Processing batch starting at offset ${offset}...`);
    
    const rows = await db.all(
      "SELECT rowid AS id, uid, embedding FROM blocks WHERE embedding IS NOT NULL AND uid NOT LIKE '%-b0' LIMIT ? OFFSET ?",
      DB_LARGE_PAGE_LIMIT,
      offset
    );
    if (rows.length === 0) break;

    // Filter to only include blocks that need to be inserted
    const toInsert = rows
      .filter(r => newUidsToInsert.has(r.uid))
      .map((r) => ({
        id: r.id,
        block_uid: r.uid,
        embedding: typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding,
      }));

    if (toInsert.length === 0) {
      console.log(`No new blocks in this batch. Skipping.`);
      offset += DB_LARGE_PAGE_LIMIT;
      continue;
    }

    console.log(`💾 Inserting ${toInsert.length} new blocks from this batch...`);

    // Insert in batches to avoid request size limits
    const batches = chunkArray(toInsert, ZILLIZ_INSERT_BATCH);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const payload = { collectionName: ZILLIZ_COLLECTION_NAME, data: batch };
      await postWithRetry(fetch, ZILLIZ_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ZILLIZ_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      totalProcessed += batch.length;
      console.log(`✅ Inserted batch ${i + 1}/${batches.length} (${batch.length} rows). Total processed: ${totalProcessed}/${newUidsToInsert.size}`);
    }

    offset += DB_LARGE_PAGE_LIMIT;
  }

  await db.close();
  console.log(`🎉 Done inserting blocks into Zilliz. Total inserted: ${totalProcessed}`);
}

// Choose which operation to run
const operation = process.argv[2];
if (operation === 'delete-b0') {
  deleteB0Blocks().catch(console.error);
} else if (operation === 'remove-duplicates') {
  removeDuplicateBlocks().catch(console.error);
} else {
  main().catch(console.error);
}
