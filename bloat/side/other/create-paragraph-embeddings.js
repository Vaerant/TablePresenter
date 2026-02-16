const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const OpenAI = require("openai");

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: 'key' });

// Optimized settings for faster processing
// const BATCH_SIZE = 50; // Smaller batch size since paragraphs are longer
// const DELAY_MS = 150; // Slightly longer delay for paragraph processing
// const CONCURRENT_REQUESTS = 20; // Fewer concurrent requests for longer texts
const BATCH_SIZE = 25; // Smaller batch size for larger model
const DELAY_MS = 200; // Slightly longer delay
const CONCURRENT_REQUESTS = 15; // Fewer concurrent requests

async function initParagraphEmbeddingTable(db) {
  // Add paragraph_embedding column to paragraphs table if it doesn't exist
  try {
    await db.exec(`ALTER TABLE paragraphs ADD COLUMN paragraph_embedding TEXT`);
    console.log('✅ Added paragraph_embedding column to paragraphs table');
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      throw err;
    }
  }
}

async function initParagraphProgressTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS paragraph_embedding_progress (
      id INTEGER PRIMARY KEY,
      paragraph_uid TEXT UNIQUE,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'completed'
    )
  `);
}

async function getProcessedParagraphs(db) {
  const rows = await db.all('SELECT paragraph_uid FROM paragraph_embedding_progress WHERE status = "completed"');
  return rows.map(row => row.paragraph_uid);
}

async function markParagraphProcessed(db, paragraphUid) {
  await db.run(
    'INSERT OR REPLACE INTO paragraph_embedding_progress (paragraph_uid, processed_at, status) VALUES (?, CURRENT_TIMESTAMP, "completed")',
    [paragraphUid]
  );
}

async function getProgressStats(db) {
  const [totalParagraphs] = await db.all('SELECT COUNT(*) as count FROM paragraphs');
  const [processedParagraphs] = await db.all('SELECT COUNT(*) as count FROM paragraph_embedding_progress WHERE status = "completed"');
  const [paragraphsWithEmbeddings] = await db.all('SELECT COUNT(*) as count FROM paragraphs WHERE paragraph_embedding IS NOT NULL');
  
  return {
    totalParagraphs: totalParagraphs.count,
    processedParagraphs: processedParagraphs.count,
    paragraphsWithEmbeddings: paragraphsWithEmbeddings.count
  };
}

async function clearProgress(db) {
  await db.run('DELETE FROM paragraph_embedding_progress');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function embedParagraphs() {
  console.log('🚀 Starting paragraph embedding process...');
  
  // Open SQLite DB
  const db = await open({
    filename: "sermons.db",
    driver: sqlite3.Database,
  });

  // Initialize tables
  await initParagraphEmbeddingTable(db);
  await initParagraphProgressTable(db);
  
  // Get processed paragraph UIDs
  const processedParagraphs = await getProcessedParagraphs(db);
  
  // Get all paragraphs without embeddings, excluding already processed ones
  let query = `
    SELECT p.uid, p.section_uid, p.order_index,
           GROUP_CONCAT(b.text, ' ') as combined_text,
           COUNT(b.uid) as block_count
    FROM paragraphs p
    LEFT JOIN blocks b ON p.uid = b.paragraph_uid
    WHERE p.paragraph_embedding IS NULL
  `;
  
  if (processedParagraphs.length > 0) {
    const processedIds = processedParagraphs.map(id => `'${id}'`).join(',');
    query += ` AND p.uid NOT IN (${processedIds})`;
  }
  
  query += `
    GROUP BY p.uid, p.section_uid, p.order_index
    HAVING combined_text IS NOT NULL AND combined_text != ''
    ORDER BY p.section_uid, p.order_index
  `;
  
  const paragraphs = await db.all(query);
  
  // Get progress stats
  const stats = await getProgressStats(db);
  
  if (paragraphs.length === 0) {
    console.log('✅ All paragraphs are already embedded!');
    console.log(`📊 Total paragraphs: ${stats.totalParagraphs}`);
    console.log(`📈 Paragraphs with embeddings: ${stats.paragraphsWithEmbeddings}`);
    console.log(`📋 Progress entries: ${stats.processedParagraphs}`);
    await db.close();
    return;
  }

  console.log(`📊 Found ${paragraphs.length} paragraphs to embed...`);
  console.log(`📈 Previously processed: ${processedParagraphs.length} paragraphs`);
  console.log(`📋 Total paragraphs in database: ${stats.totalParagraphs}`);
  console.log(`⏱️  Estimated time: ${Math.ceil(paragraphs.length / (BATCH_SIZE * CONCURRENT_REQUESTS) * (DELAY_MS / 1000) / 60)} minutes`);

  let processedCount = 0;
  
  // Process in batches with concurrency
  for (let i = 0; i < paragraphs.length; i += BATCH_SIZE) {
    const batch = paragraphs.slice(i, i + BATCH_SIZE);
    
    console.log(`🔄 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(paragraphs.length/BATCH_SIZE)} (${batch.length} paragraphs)...`);
    
    // Process multiple paragraphs concurrently within each batch
    const chunks = [];
    for (let j = 0; j < batch.length; j += CONCURRENT_REQUESTS) {
      chunks.push(batch.slice(j, j + CONCURRENT_REQUESTS));
    }
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (paragraph) => {
        try {
          // Clean up the combined text
          const cleanText = paragraph.combined_text
            .replace(/\s+/g, ' ')
            .trim();
          
          if (!cleanText) {
            console.log(`⚠️  Skipping paragraph ${paragraph.uid} - no text content`);
            return false;
          }

          // Generate embedding
          const response = await openai.embeddings.create({
            model: "text-embedding-3-large",
            input: cleanText,
          });

          const embedding = response.data[0].embedding;

          // Store as JSON string
          await db.run(
            `UPDATE paragraphs SET paragraph_embedding = ? WHERE uid = ?`,
            [JSON.stringify(embedding), paragraph.uid]
          );

          // Mark as processed in progress table
          await markParagraphProcessed(db, paragraph.uid);
          
          processedCount++;
          process.stdout.write(`✓ ${paragraph.uid}(${paragraph.block_count} blocks) `);
          
          return true;
        } catch (err) {
          console.error(`\n❌ Error embedding paragraph ${paragraph.uid}:`, err.message);
          
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
    if (i + BATCH_SIZE < paragraphs.length) {
      await sleep(DELAY_MS);
    }
  }
  
  const finalStats = await getProgressStats(db);
  
  console.log(`\n✅ Paragraph embedding complete! Processed ${processedCount} new paragraphs.`);
  console.log(`📊 Total processed: ${finalStats.processedParagraphs} paragraphs`);
  console.log(`📈 Paragraphs with embeddings: ${finalStats.paragraphsWithEmbeddings}/${finalStats.totalParagraphs}`);
  
  // Clean up progress table when all paragraphs are done
  if (finalStats.paragraphsWithEmbeddings === finalStats.totalParagraphs) {
    await clearProgress(db);
    console.log('🧹 Progress table cleaned up - all paragraphs completed.');
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
embedParagraphs().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
