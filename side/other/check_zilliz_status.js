require('dotenv').config();
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
// const axios = require("axios"); // remove axios; not needed with SDK
const { MilvusClient, queryIterator } = require("@zilliz/milvus2-sdk-node");
const fs = require("fs");

// Zilliz config
const ZILLIZ_API_KEY = process.env.ZILLIZ_API_KEY;
const ZILLIZ_COLLECTION_NAME = "sermon_blocks";
const ZILLIZ_ENDPOINT = '';

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

// Fetch all block UIDs from Zilliz using SDK queryIterator
async function fetchAllZillizBlockUids() {
  if (!ZILLIZ_API_KEY || !ZILLIZ_ENDPOINT) {
    throw new Error("ZILLIZ_API_KEY or ZILLIZ_ENDPOINT is not set");
  }

  const client = new MilvusClient({
    address: ZILLIZ_ENDPOINT,
    token: ZILLIZ_API_KEY,
  });

  const blockUids = new Set();
  
  const queryData = {
    collection_name: ZILLIZ_COLLECTION_NAME,
    filter: "", // Empty filter to get all records
    output_fields: ["block_uid"],
    limit: 16384,
    batchSize: 1000 // Use batchSize instead of pageSize
  };

  console.log("📊 Fetching all block UIDs from Zilliz...");

  const iterator = await client.queryIterator(queryData);

  let pageCount = 0;
  for await (const batch of iterator) {
    pageCount += 1;
    for (const row of batch) {
      // Access the block_uid field directly
      const uid = row.block_uid;
      if (uid) blockUids.add(uid);
    }
    if (pageCount % 10 === 0) {
      console.log(`  Zilliz progress: ${blockUids.size} UIDs fetched...`);
    }
  }

  console.log(`✅ Zilliz: Found ${blockUids.size} total block UIDs`);
  fs.writeFileSync("zilliz_block_uids.json", JSON.stringify(Array.from(blockUids), null, 2));
  return blockUids;
}

fetchAllZillizBlockUids().catch(err => {
  console.error("❌ Error fetching Zilliz block UIDs:", err);
  process.exit(1);
});