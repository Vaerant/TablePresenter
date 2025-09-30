const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const OpenAI = require("openai");

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: 'key' });

// Optimized settings for faster processing
const BATCH_SIZE = 100; // Increased from 10 to 100
const DELAY_MS = 100; // Reduced from 200ms to 100ms
const CONCURRENT_REQUESTS = 100; // Process multiple embeddings simultaneously

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
  
  // Process in batches with concurrency
  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    const batch = blocks.slice(i, i + BATCH_SIZE);
    
    console.log(`🔄 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(blocks.length/BATCH_SIZE)} (${batch.length} blocks)...`);
    
    // Process multiple blocks concurrently within each batch
    const chunks = [];
    for (let j = 0; j < batch.length; j += CONCURRENT_REQUESTS) {
      chunks.push(batch.slice(j, j + CONCURRENT_REQUESTS));
    }
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (block) => {
        try {
          // Generate embedding
          const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: block.text,
          });

          const embedding = response.data[0].embedding;

          // Store as JSON string
          await db.run(
            `UPDATE blocks SET embedding = ? WHERE uid = ?`,
            [JSON.stringify(embedding), block.uid]
          );

          // Mark as processed in progress table
          await markBlockProcessed(db, block.uid);
          
          processedCount++;
          process.stdout.write(`✓ ${block.uid} `);
          
          return true;
        } catch (err) {
          console.error(`\n❌ Error embedding block ${block.uid}:`, err.message);
          
          // On API rate limit, wait longer
          if (err.message.includes('rate limit') || err.message.includes('429')) {
            console.log('⏸️  Rate limited, waiting 30 seconds...');
            await sleep(30000);
          }
          return false;
        }
      });
      
      // Wait for concurrent chunk to complete
      await Promise.all(promises);
      
      // Small delay between concurrent chunks
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await sleep(DELAY_MS / 10);
      }
    }
    
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