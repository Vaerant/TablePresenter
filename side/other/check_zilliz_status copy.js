require('dotenv').config();
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

// Zilliz config
const DEFAULT_ZILLIZ_QUERY_ENDPOINT = "";
const ZILLIZ_QUERY_ENDPOINT = process.env.ZILLIZ_QUERY_ENDPOINT || DEFAULT_ZILLIZ_QUERY_ENDPOINT;
const ZILLIZ_API_KEY = process.env.ZILLIZ_API_KEY;
const ZILLIZ_COLLECTION_NAME = process.env.ZILLIZ_COLLECTION_NAME || "sermon_blocks";

// Helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postWithRetry(fetchFn, url, options, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetchFn(url, options);
    if (res.ok) return res;
    const body = await res.text().catch(() => "");
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new Error(`Zilliz request failed (${res.status}): ${body}`);
    }
    if (attempt === tries) {
      throw new Error(`Zilliz request failed (${res.status}): ${body}`);
    }
    await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
  }
}

// Fetch all block UIDs from SQLite (excluding b0)
async function fetchAllSqliteBlockUids(db) {
  const blockUids = new Set();
  let offset = 0;
  const batchSize = 10000;
  
  console.log("📊 Fetching all block UIDs from SQLite (excluding b0 blocks)...");
  
  while (true) {
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
    if (offset % 50000 === 0) {
      console.log(`  SQLite progress: ${blockUids.size} UIDs fetched...`);
    }
    
    if (rows.length < batchSize) break;
  }
  
  console.log(`✅ SQLite: Found ${blockUids.size} total block UIDs (excluding b0)`);
  return blockUids;
}

// Fetch all block UIDs from Zilliz
async function fetchAllZillizBlockUids(fetchFn) {
  const blockUids = new Set();
  let offset = 0;
  const batchSize = 16384; // Maximum Zilliz limit
  
  console.log("📊 Fetching all block UIDs from Zilliz...");
  
  while (true) {
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
    
    // Debug logging to understand response structure
    if (offset === 0) {
      console.log("  Debug: First response structure:", JSON.stringify(json, null, 2).slice(0, 500) + "...");
    }
    
    const data = json && json.data;
    let rows = [];
    if (Array.isArray(data)) rows = data;
    else if (data && Array.isArray(data.rows)) rows = data.rows;
    else if (data && Array.isArray(data.entities)) rows = data.entities;
    
    if (rows.length === 0) {
      console.log(`  Zilliz: No more records at offset ${offset}`);
      break;
    }
    
    let addedInThisBatch = 0;
    for (const row of rows) {
      const uid = row.block_uid || (row.fields && row.fields.block_uid);
      if (uid && !uid.endsWith('-b0')) { // Exclude b0 blocks from Zilliz too
        blockUids.add(uid);
        addedInThisBatch++;
      }
    }
    
    console.log(`  Zilliz batch: offset ${offset}, fetched ${rows.length} records, added ${addedInThisBatch} UIDs (total: ${blockUids.size})`);
    
    offset += batchSize;
    
    // If we got fewer rows than requested, we've reached the end
    if (rows.length < batchSize) {
      console.log(`  Zilliz: Reached end of collection (got ${rows.length} < ${batchSize})`);
      break;
    }
    
    // Safety check to prevent infinite loops
    if (offset > 2000000) {
      console.log(`  Zilliz: Safety limit reached at offset ${offset}`);
      break;
    }
  }
  
  console.log(`✅ Zilliz: Found ${blockUids.size} total block UIDs (excluding b0)`);
  return blockUids;
}

// Get sample block details from SQLite
async function getSampleBlockDetails(db, uids, sampleSize = 10) {
  const uidArray = Array.from(uids).slice(0, sampleSize);
  if (uidArray.length === 0) return [];
  
  const placeholders = uidArray.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT uid, LENGTH(text) as text_length, embedding IS NOT NULL as has_embedding 
     FROM blocks WHERE uid IN (${placeholders})`,
    ...uidArray
  );
  
  return rows;
}

// Main analysis function
async function analyzeZillizStatus() {
  if (!ZILLIZ_API_KEY) {
    throw new Error("ZILLIZ_API_KEY env var is required for Zilliz operations.");
  }
  
  const fetch = global.fetch || (await import("node-fetch")).default;
  const db = await open({ filename: "sermons.db", driver: sqlite3.Database });
  
  console.log("🔍 Starting Zilliz sync status analysis...\n");
  
  try {
    // Fetch data from both sources
    const [sqliteUids, zillizUids] = await Promise.all([
      fetchAllSqliteBlockUids(db),
      fetchAllZillizBlockUids(fetch)
    ]);
    
    // Calculate differences
    const missingInZilliz = new Set();
    const extraInZilliz = new Set();
    const synchronized = new Set();
    
    // Find what's missing in Zilliz
    for (const uid of sqliteUids) {
      if (zillizUids.has(uid)) {
        synchronized.add(uid);
      } else {
        missingInZilliz.add(uid);
      }
    }
    
    // Find what's extra in Zilliz (shouldn't happen but good to check)
    for (const uid of zillizUids) {
      if (!sqliteUids.has(uid)) {
        extraInZilliz.add(uid);
      }
    }
    
    // Generate report
    console.log("\n" + "=".repeat(60));
    console.log("📈 ZILLIZ SYNC STATUS REPORT");
    console.log("=".repeat(60));
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`  • SQLite blocks (non-b0):     ${sqliteUids.size.toLocaleString()}`);
    console.log(`  • Zilliz blocks (non-b0):     ${zillizUids.size.toLocaleString()}`);
    console.log(`  • Synchronized:               ${synchronized.size.toLocaleString()}`);
    console.log(`  • Missing in Zilliz:          ${missingInZilliz.size.toLocaleString()}`);
    console.log(`  • Extra in Zilliz:            ${extraInZilliz.size.toLocaleString()}`);
    
    const syncPercentage = sqliteUids.size > 0 ? (synchronized.size / sqliteUids.size * 100).toFixed(2) : 0;
    console.log(`  • Sync percentage:            ${syncPercentage}%`);
    
    if (missingInZilliz.size > 0) {
      console.log(`\n❌ MISSING IN ZILLIZ (${missingInZilliz.size} blocks):`);
      const missingArray = Array.from(missingInZilliz);
      console.log(`  Sample UIDs: ${missingArray.slice(0, 10).join(', ')}`);
      if (missingArray.length > 10) {
        console.log(`  ... and ${(missingArray.length - 10).toLocaleString()} more`);
      }
      
      // Get sample details from SQLite
      console.log(`\n  Sample block details:`);
      const sampleDetails = await getSampleBlockDetails(db, missingInZilliz, 5);
      sampleDetails.forEach(block => {
        console.log(`    ${block.uid}: ${block.text_length} chars, embedding: ${block.has_embedding ? 'yes' : 'no'}`);
      });
    }
    
    if (extraInZilliz.size > 0) {
      console.log(`\n⚠️  EXTRA IN ZILLIZ (${extraInZilliz.size} blocks):`);
      const extraArray = Array.from(extraInZilliz);
      console.log(`  Sample UIDs: ${extraArray.slice(0, 10).join(', ')}`);
      if (extraArray.length > 10) {
        console.log(`  ... and ${(extraArray.length - 10).toLocaleString()} more`);
      }
    }
    
    if (synchronized.size === sqliteUids.size && extraInZilliz.size === 0) {
      console.log(`\n✅ PERFECT SYNC: All SQLite blocks are synchronized with Zilliz!`);
    } else if (missingInZilliz.size === 0) {
      console.log(`\n✅ All SQLite blocks are in Zilliz (but there might be extras)`);
    } else {
      console.log(`\n⚠️  SYNC NEEDED: ${missingInZilliz.size.toLocaleString()} blocks need to be inserted into Zilliz`);
    }
    
    // Check for b0 blocks in Zilliz (these should be cleaned up)
    console.log(`\n🔍 Checking for b0 blocks in Zilliz...`);
    const b0Body = {
      collectionName: ZILLIZ_COLLECTION_NAME,
      filter: 'block_uid like "%-b0"',
      outputFields: ["block_uid"],
      limit: 100
    };
    
    const b0Res = await postWithRetry(fetch, ZILLIZ_QUERY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ZILLIZ_API_KEY}`,
      },
      body: JSON.stringify(b0Body),
    });
    
    const b0Json = await b0Res.json().catch(() => ({}));
    const b0Data = b0Json && b0Json.data;
    let b0Rows = [];
    if (Array.isArray(b0Data)) b0Rows = b0Data;
    else if (b0Data && Array.isArray(b0Data.rows)) b0Rows = b0Data.rows;
    else if (b0Data && Array.isArray(b0Data.entities)) b0Rows = b0Data.entities;
    
    if (b0Rows.length > 0) {
      console.log(`❌ Found ${b0Rows.length} b0 blocks in Zilliz (these should be cleaned up)`);
      console.log(`   Use: node index_blocks_zillis2.js delete-b0`);
    } else {
      console.log(`✅ No b0 blocks found in Zilliz`);
    }
    
    console.log("\n" + "=".repeat(60));
    
    // Output lists for further processing if needed
    if (process.argv.includes('--export-missing')) {
      console.log(`\nExporting missing UIDs to missing_uids.txt...`);
      const fs = require('fs');
      fs.writeFileSync('missing_uids.txt', Array.from(missingInZilliz).join('\n'));
      console.log(`✅ Exported ${missingInZilliz.size} missing UIDs`);
    }
    
  } finally {
    await db.close();
  }
}

// Run the analysis
if (require.main === module) {
  analyzeZillizStatus().catch(console.error);
}

module.exports = { analyzeZillizStatus };
