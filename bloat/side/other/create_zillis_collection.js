// scripts/index_blocks.js
require('dotenv').config();
const { MilvusClient } = require("@zilliz/milvus2-sdk-node");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const milvus = new MilvusClient({ address: 'url', token: 'token' });

const COLLECTION_NAME = "sermon_blocks";
const VECTOR_FIELD = "embedding";
const INDEX_NAME = "embedding_idx";

async function ensureIndexAndLoad() {
  try {
    // 1️⃣ Check if index exists by trying to get index info
    let indexExists = false;
    try {
      const indexInfo = await milvus.describeIndex({
        collection_name: COLLECTION_NAME,
        field_name: VECTOR_FIELD,
      });
      
      // Check if the response indicates a valid index
      if (indexInfo && indexInfo.index_descriptions && indexInfo.index_descriptions.length > 0) {
        indexExists = true;
        console.log("Index already exists");
      } else {
        console.log("Index not found. Creating index...");
        indexExists = false;
      }
    } catch (error) {
      // Index doesn't exist, we'll create it
      console.log("Index not found. Creating index...");
      indexExists = false;
    }

    if (!indexExists) {
      // 2️⃣ Create index
      await milvus.createIndex({
        collection_name: COLLECTION_NAME,
        field_name: VECTOR_FIELD,
        index_name: INDEX_NAME,
        index_type: "IVF_FLAT",   // or "HNSW" for approximate search
        metric_type: "IP",         // "IP" for inner product, "L2" for Euclidean
        params: { nlist: 1024 },
      });

      console.log("Index created.");
    }

    // 3️⃣ Load the collection
    try {
      await milvus.loadCollection({ collection_name: COLLECTION_NAME });
      console.log(`Collection '${COLLECTION_NAME}' loaded successfully.`);
    } catch (loadError) {
      if (loadError.message.includes("IndexNotExist")) {
        console.log("Load failed due to missing index. Force creating index...");
        
        // Force create index
        await milvus.createIndex({
          collection_name: COLLECTION_NAME,
          field_name: VECTOR_FIELD,
          index_name: INDEX_NAME,
          index_type: "IVF_FLAT",
          metric_type: "IP",
          params: { nlist: 1024 },
        });
        
        console.log("Index force created. Attempting to load again...");
        await milvus.loadCollection({ collection_name: COLLECTION_NAME });
        console.log(`Collection '${COLLECTION_NAME}' loaded successfully.`);
      } else {
        throw loadError;
      }
    }
    
  } catch (error) {
    console.error("Error ensuring index and loading collection:", error);
  }
}

// Run
ensureIndexAndLoad();