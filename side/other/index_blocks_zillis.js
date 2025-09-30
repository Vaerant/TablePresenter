// scripts/index_blocks.js
require('dotenv').config();
const { MilvusClient } = require("@zilliz/milvus2-sdk-node");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const milvus = new MilvusClient({ 
  address: process.env.ZILLIZ_URL, 
  token: process.env.ZILLIZ_API_KEY 
});

const BATCH_SIZE = 1000; // Larger batch for inserts since no API calls

async function processInBatches(items, batchSize, processor) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
    console.log(`Processed ${Math.min(i + batchSize, items.length)}/${items.length}`);
  }
  return results;
}

// New function to process existing embeddings from database
async function processExistingEmbeddings(blocks) {
  return blocks.map(block => ({
    block_uid: block.uid,
    embedding: JSON.parse(block.embedding) // Parse the JSON string back to array
  }));
}

async function insertToBatch(embeddings) {
  if (embeddings.length === 0) return;
  
  await milvus.insert({
    collection_name: "sermon_blocks",
    fields_data: embeddings
  });
}

async function main() {
  // Open SQLite
  const db = await open({ filename: "sermons.db", driver: sqlite3.Database });

  // Ensure collection exists in Zilliz
  await milvus.createCollection({
    collection_name: "sermon_blocks",
    fields: [
      { name: "id", data_type: "Int64", is_primary_key: true, autoID: true },
      { name: "block_uid", data_type: "VarChar", max_length: 64 },
      { name: "embedding", data_type: "FloatVector", dim: 1536 }
    ]
  }).catch(() => console.log("Collection already exists"));

  // Load blocks with existing embeddings
  const blocks = await db.all("SELECT uid, embedding FROM blocks WHERE embedding IS NOT NULL");
  console.log(`Uploading ${blocks.length} existing embeddings to Zilliz...`);

  // Process existing embeddings in batches (much faster since no API calls)
  await processInBatches(blocks, BATCH_SIZE, async (batch) => {
    const embeddings = await processExistingEmbeddings(batch);
    await insertToBatch(embeddings);
    return embeddings;
  });

  await milvus.flush({ collection_names: ["sermon_blocks"] });
  console.log("✅ Done uploading embeddings to Zilliz.");
}

main().catch(console.error);
