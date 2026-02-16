const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const OpenAI = require("openai");
const { exec } = require('child_process');
const { promisify } = require('util');
require('dotenv').config();

const execAsync = promisify(exec);

// Initialize OpenAI client with timeout
let openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 15000 // 15 second timeout
});

// Optimized settings for faster processing
const BATCH_SIZE = 100;
const DELAY_MS = 100;
const CONCURRENT_REQUESTS = 100;

// Overnight processing settings
const REINIT_INTERVAL_MINUTES = 30; // Reinitialize every 30 minutes
const SCREEN_WAKE_INTERVAL_SECONDS = 30; // Keep screen active every 30 seconds
const WIFI_RECONNECT_INTERVAL_SECONDS = 120; // Reconnect WiFi every 120 seconds
const MAX_RETRIES = 3; // Max retries per block

let lastReinitTime = Date.now();
let screenWakeInterval;
let wifiReconnectInterval;

// Keep screen awake by moving cursor slightly
function keepScreenAwake() {
  // This creates a subtle activity to prevent screen timeout
  process.stdout.write(`\n⏰ ${new Date().toLocaleTimeString()} - Process active...\n`);
}

function startScreenWakeTimer() {
  screenWakeInterval = setInterval(keepScreenAwake, SCREEN_WAKE_INTERVAL_SECONDS * 1000);
}

function stopScreenWakeTimer() {
  if (screenWakeInterval) {
    clearInterval(screenWakeInterval);
  }
}

async function reinitializeConnections() {
  console.log('\n🔄 Reinitializing connections for stability...');
  
  // Reinitialize OpenAI client with timeout
  openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 15000 // 15 second timeout
  });
  
  // Test OpenAI connection
  try {
    await openai.models.list();
    console.log('✅ OpenAI connection refreshed');
  } catch (err) {
    console.log('⚠️ OpenAI connection test failed:', err.message);
  }
  
  lastReinitTime = Date.now();
}

function shouldReinitialize() {
  return (Date.now() - lastReinitTime) > (REINIT_INTERVAL_MINUTES * 60 * 1000);
}

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

async function ensureEmbeddingColumn(db) {
  try {
    await db.exec(`ALTER TABLE blocks ADD COLUMN embedding TEXT`);
  } catch (err) {
    // Column might already exist, ignore error
  }
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
  console.log('🚀 Starting embedding process for overnight run...');
  console.log('🌙 Screen wake-up prevention activated');
  console.log('📡 WiFi reconnection activated');
  
  // Start screen wake timer
  startScreenWakeTimer();
  
  // Start WiFi reconnect timer
  startWifiReconnectTimer();
  
  // Open SQLite DB
  let db = await open({
    filename: "sermons.db",
    driver: sqlite3.Database,
  });

  // Ensure embedding column exists
  await ensureEmbeddingColumn(db);

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
  console.log(`🔄 Will reinitialize connections every ${REINIT_INTERVAL_MINUTES} minutes`);

  let processedCount = 0;
  let globalRetryCount = 0;
  
  // Process in batches with concurrency
  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    // Check if we should reinitialize connections
    if (shouldReinitialize()) {
      await reinitializeConnections();
      
      // Refresh database connection
      await db.close();
      db = await open({
        filename: "sermons.db",
        driver: sqlite3.Database,
      });
      console.log('✅ Database connection refreshed');
    }
    
    const batch = blocks.slice(i, i + BATCH_SIZE);
    
    console.log(`🔄 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(blocks.length/BATCH_SIZE)} (${batch.length} blocks)...`);
    console.log(`⏰ ${new Date().toLocaleTimeString()} - ${processedCount}/${blocks.length} blocks completed`);
    
    // Process multiple blocks concurrently within each batch
    const chunks = [];
    for (let j = 0; j < batch.length; j += CONCURRENT_REQUESTS) {
      chunks.push(batch.slice(j, j + CONCURRENT_REQUESTS));
    }
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (block) => {
        let retries = 0;
        
        while (retries <= MAX_RETRIES) {
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
            retries++;
            console.error(`\n❌ Error embedding block ${block.uid} (attempt ${retries}/${MAX_RETRIES + 1}):`, err.message);
            
            // On API rate limit, wait longer
            if (err.message.includes('rate limit') || err.message.includes('429')) {
              const waitTime = Math.min(30000 * retries, 120000); // Exponential backoff, max 2 minutes
              console.log(`⏸️ Rate limited, waiting ${waitTime/1000} seconds...`);
              await sleep(waitTime);
            } else if (err.message.includes('network') || err.message.includes('ENOTFOUND') || err.message.includes('timeout')) {
              // Network issues - reinitialize and retry
              console.log('🔄 Network issue detected, reinitializing connection...');
              await reinitializeConnections();
              await sleep(5000);
            } else {
              // Other errors - shorter wait
              await sleep(2000 * retries);
            }
            
            if (retries > MAX_RETRIES) {
              console.error(`❌ Failed to process block ${block.uid} after ${MAX_RETRIES + 1} attempts`);
              globalRetryCount++;
              return false;
            }
          }
        }
        return false;
      });
      
      // Wait for concurrent chunk to complete
      await Promise.all(promises);
      
      // Small delay between concurrent chunks
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await sleep(DELAY_MS / 10);
      }
    }
    
    console.log(`\n💾 Batch complete. Progress saved to database.`);
    console.log(`📊 Running total: ${processedCount}/${blocks.length} (${(processedCount/blocks.length*100).toFixed(1)}%)`);
    
    if (globalRetryCount > 0) {
      console.log(`⚠️ Failed blocks so far: ${globalRetryCount}`);
    }
    
    // Small delay between batches
    if (i + BATCH_SIZE < blocks.length) {
      await sleep(DELAY_MS);
    }
  }
  
  // Stop timers
  stopScreenWakeTimer();
  stopWifiReconnectTimer();
  
  const finalStats = await getProgressStats(db);
  
  console.log(`\n✅ Embedding complete! Processed ${processedCount} new blocks.`);
  console.log(`📊 Total processed: ${finalStats.processedBlocks} blocks`);
  console.log(`📈 Blocks with embeddings: ${finalStats.blocksWithEmbeddings}/${finalStats.totalBlocks}`);
  
  if (globalRetryCount > 0) {
    console.log(`⚠️ Total failed blocks: ${globalRetryCount}`);
  }
  
  // Clean up progress table when all blocks are done
  if (finalStats.blocksWithEmbeddings === finalStats.totalBlocks) {
    await clearProgress(db);
    console.log('🧹 Progress table cleaned up - all blocks completed.');
  }
  
  await db.close();
}

// WiFi reconnection functionality
async function getCurrentWifiProfile() {
  try {
    // First try to get currently connected network
    const { stdout: interfaceInfo } = await execAsync('netsh wlan show interfaces');
    const profileMatch = interfaceInfo.match(/Profile\s*:\s*(.+)/);
    if (profileMatch) {
      const profileName = profileMatch[1].trim();
      console.log(`📡 Current WiFi profile: ${profileName}`);
      return profileName;
    }
  } catch (err) {
    console.log('⚠️ Could not get current WiFi interface:', err.message);
  }
  
  // Fallback to Allways Fresh SA if we can't detect current profile
  return "Allways Fresh SA";
}

async function reconnectWifi() {
  try {
    // Always try to connect to Allways Fresh SA first
    const targetProfile = "Allways Fresh SA";
    
    console.log(`📡 Reconnecting to WiFi: ${targetProfile}`);
    
    // Disconnect current connection
    await execAsync('netsh wlan disconnect');
    await sleep(3000); // Wait 3 seconds for disconnect
    
    // Connect to target profile
    await execAsync(`netsh wlan connect name="${targetProfile}"`);
    await sleep(2000); // Wait for connection
    
    // Verify connection
    const { stdout } = await execAsync('netsh wlan show interfaces');
    if (stdout.includes('connected') && stdout.includes(targetProfile)) {
      console.log(`📡 WiFi successfully reconnected to: ${targetProfile}`);
    } else {
      console.log(`⚠️ WiFi connection to ${targetProfile} may have failed`);
    }
    
  } catch (err) {
    console.log('⚠️ WiFi reconnection failed:', err.message);
    
    // Try alternative connection method
    try {
      await sleep(2000);
      await execAsync(`netsh wlan connect profile="Allways Fresh SA"`);
      console.log('📡 WiFi reconnected using alternative method');
    } catch (altErr) {
      console.log('⚠️ Alternative WiFi connection also failed:', altErr.message);
    }
  }
}

function startWifiReconnectTimer() {
  wifiReconnectInterval = setInterval(reconnectWifi, WIFI_RECONNECT_INTERVAL_SECONDS * 1000);
}

function stopWifiReconnectTimer() {
  if (wifiReconnectInterval) {
    clearInterval(wifiReconnectInterval);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹️  Process interrupted. Progress has been saved to database.');
  stopScreenWakeTimer();
  stopWifiReconnectTimer();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️  Process terminated. Progress has been saved to database.');
  stopScreenWakeTimer();
  stopWifiReconnectTimer();
  process.exit(0);
});

// Start the process
embedBlocks().catch(err => {
  console.error('❌ Fatal error:', err);
  stopScreenWakeTimer();
  stopWifiReconnectTimer();
  process.exit(1);
});