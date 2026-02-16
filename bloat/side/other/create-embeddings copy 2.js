const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const OpenAI = require("openai");
require('dotenv').config();

// Load multiple API keys from environment
const apiKeys = [];
for (let i = 1; i <= 5; i++) {
  const key = process.env[`API_IDX${i}`];
  if (key) {
    apiKeys.push(key);
  }
}

if (apiKeys.length === 0) {
  console.error('❌ No API keys found in environment variables (API_IDX1, API_IDX2, etc.)');
  process.exit(1);
}

console.log(`🔑 Loaded ${apiKeys.length} API key(s) for load balancing`);

// Initialize OpenAI clients for each API key
const openaiClients = apiKeys.map(key => new OpenAI({ apiKey: key }));
let globalRequestCounter = 0; // Global counter for proper round-robin

// Optimized settings for faster processing
const BATCH_SIZE = 500;
const DELAY_MS = 100;
const BLOCKS_PER_CLIENT = 100; // 500 / 5 = 100 blocks per client
const CONCURRENT_REQUESTS = 500;

async function initProgressTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS embedding_progress (
      id INTEGER PRIMARY KEY,
      block_uid TEXT UNIQUE,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'completed'
    )
  `);
}

async function getProcessedBlocks(db) {
  const rows = await db.all('SELECT block_uid FROM embedding_progress WHERE status = "completed"');
  return rows.map(row => row.block_uid);
}

async function markBlockProcessed(db, blockUid) {
  await db.run(
    'INSERT OR REPLACE INTO embedding_progress (block_uid, processed_at, status) VALUES (?, CURRENT_TIMESTAMP, "completed")',
    [blockUid]
  );
}

async function getProgressStats(db) {
  const [totalBlocks] = await db.all('SELECT COUNT(*) as count FROM blocks');
  const [processedBlocks] = await db.all('SELECT COUNT(*) as count FROM embedding_progress WHERE status = "completed"');
  const [blocksWithEmbeddings] = await db.all('SELECT COUNT(*) as count FROM blocks WHERE embedding IS NOT NULL');
  
  return {
    totalBlocks: totalBlocks.count,
    processedBlocks: processedBlocks.count,
    blocksWithEmbeddings: blocksWithEmbeddings.count
  };
}

async function clearProgress(db) {
  await db.run('DELETE FROM embedding_progress');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function embedBlocks() {
  console.log('🚀 Starting embedding process...');
  
  // Open SQLite DB
  const db = await open({
    filename: "sermons.db",
    driver: sqlite3.Database,
  });

  // Initialize progress table
  await initProgressTable(db);
  
  // Get processed block UIDs
  const processedBlocks = await getProcessedBlocks(db);
  
  // Get all blocks without embeddings, excluding already processed ones
  let query = `SELECT uid, text FROM blocks WHERE embedding IS NULL`;
  if (processedBlocks.length > 0) {
    const processedIds = processedBlocks.map(id => `'${id}'`).join(',');
    query += ` AND uid NOT IN (${processedIds})`;
  }
  
  const blocks = await db.all(query);
  
  // Get progress stats
  const stats = await getProgressStats(db);
  
  if (blocks.length === 0) {
    console.log('✅ All blocks are already embedded!');
    console.log(`📊 Total blocks: ${stats.totalBlocks}`);
    console.log(`📈 Blocks with embeddings: ${stats.blocksWithEmbeddings}`);
    console.log(`📋 Progress entries: ${stats.processedBlocks}`);
    await db.close();
    return;
  }

  console.log(`📊 Found ${blocks.length} blocks to embed...`);
  console.log(`📈 Previously processed: ${processedBlocks.length} blocks`);
  console.log(`📋 Total blocks in database: ${stats.totalBlocks}`);
  console.log(`⏱️  Estimated time: ${Math.ceil(blocks.length / (BATCH_SIZE * CONCURRENT_REQUESTS) * (DELAY_MS / 1000) / 60)} minutes`);

  let processedCount = 0;
  
  // Process in batches with full concurrency
  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    const batch = blocks.slice(i, i + BATCH_SIZE);
    
    console.log(`🔄 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(blocks.length/BATCH_SIZE)} (${batch.length} blocks)...`);
    
    // Distribute blocks evenly across clients (100 per client for full batch)
    const clientGroups = Array(openaiClients.length).fill().map(() => []);
    
    // Round-robin distribution
    batch.forEach((block, index) => {
      const clientIndex = index % openaiClients.length;
      clientGroups[clientIndex].push(block);
    });
    
    console.log(`📤 Making ${batch.length} simultaneous requests: ${clientGroups.map((group, i) => `API${i+1}:${group.length}`).join(', ')}`);
    
    // Process all client groups simultaneously with full concurrency
    const clientPromises = clientGroups.map(async (blocks, clientIndex) => {
      if (blocks.length === 0) return [];
      
      const client = openaiClients[clientIndex];
      
      // Make all requests for this client simultaneously
      const blockPromises = blocks.map(async (block) => {
        try {
          globalRequestCounter++;
          
          const response = await client.embeddings.create({
            model: "text-embedding-3-small",
            input: block.text,
          });

          const embedding = response.data[0].embedding;

          await db.run(
            `UPDATE blocks SET embedding = ? WHERE uid = ?`,
            [JSON.stringify(embedding), block.uid]
          );

          await markBlockProcessed(db, block.uid);
          
          processedCount++;
          process.stdout.write(`✓ ${block.uid} (API${clientIndex + 1}) `);
          
          return true;
        } catch (err) {
          console.error(`\n❌ Error embedding block ${block.uid} on API${clientIndex + 1}:`, err.message);
          
          if (err.message.includes('rate limit') || err.message.includes('429')) {
            console.log(`⏸️  API${clientIndex + 1} rate limited`);
          }
          return false;
        }
      });
      
      // Wait for all requests for this client to complete
      return await Promise.all(blockPromises);
    });
    
    // Wait for all clients to complete their requests
    await Promise.all(clientPromises);
    
    console.log(`\n💾 Batch complete. Progress saved to database.`);
    
    // Small delay between batches
    if (i + BATCH_SIZE < blocks.length) {
      await sleep(DELAY_MS);
    }
  }
  
  const finalStats = await getProgressStats(db);
  
  console.log(`\n✅ Embedding complete! Processed ${processedCount} new blocks.`);
  console.log(`📊 Total processed: ${finalStats.processedBlocks} blocks`);
  console.log(`📈 Blocks with embeddings: ${finalStats.blocksWithEmbeddings}/${finalStats.totalBlocks}`);
  
  // Clean up progress table when all blocks are done
  if (finalStats.blocksWithEmbeddings === finalStats.totalBlocks) {
    await clearProgress(db);
    console.log('🧹 Progress table cleaned up - all blocks completed.');
  }
  
  await db.close();
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹️  Process interrupted. Progress has been saved to database.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️  Process terminated. Progress has been saved to database.');
  process.exit(0);
});

// Start the process
embedBlocks().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});