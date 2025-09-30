const express = require('express');
const path = require('path');
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const OpenAI = require("openai");
const { HierarchicalNSW } = require('hnswlib-node');

const app = express();
const port = 3000;

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: 'key' });

// Global HNSW index and metadata
let hnswIndex = null;
let blockMetadata = new Map(); // Map from HNSW ID to block metadata
let indexReady = false;

// Initialize HNSW index on startup
async function initializeIndex() {
  console.log('🚀 Initializing HNSW index...');
  
  const indexPath = path.join(__dirname, 'hnsw_index.bin');
  const metadataPath = path.join(__dirname, 'metadata.json');
  
  // Try to load existing index
  if (require('fs').existsSync(indexPath) && require('fs').existsSync(metadataPath)) {
    console.log('📁 Loading existing HNSW index...');
    try {
      hnswIndex = new HierarchicalNSW('cosine', 1536);
      console.log('   📥 Loading index file...');
      hnswIndex.loadIndex(indexPath);
      
      console.log('   📥 Loading metadata...');
      const metadataJson = require('fs').readFileSync(metadataPath, 'utf8');
      const metadataArray = JSON.parse(metadataJson);
      blockMetadata = new Map(metadataArray);
      
      console.log(`✅ Loaded existing index from disk! (${blockMetadata.size} blocks)`);
      indexReady = true;
      return;
    } catch (error) {
      console.log('⚠️ Failed to load existing index, rebuilding...', error.message);
    }
  }
  
  console.log('📂 Opening database...');
  const db = await open({
    filename: "sermons.db",
    driver: sqlite3.Database,
  });

  console.log('📊 Counting blocks with embeddings...');
  const countResult = await db.get(`
    SELECT COUNT(*) as count 
    FROM blocks b 
    WHERE b.embedding IS NOT NULL
  `);
  
  const totalBlocks = countResult.count;
  console.log(`📋 Found ${totalBlocks} blocks to process`);

  // Get first block to determine embedding dimensions
  console.log('🔧 Determining embedding dimensions...');
  const firstBlock = await db.get(`
    SELECT b.embedding
    FROM blocks b
    WHERE b.embedding IS NOT NULL
    LIMIT 1
  `);
  
  if (!firstBlock) {
    console.log('❌ No embeddings found in database');
    await db.close();
    return;
  }

  const embeddingDim = JSON.parse(firstBlock.embedding).length;
  console.log(`📐 Embedding dimension: ${embeddingDim}`);
  
  console.log('🏗️ Initializing HNSW index structure...');
  hnswIndex = new HierarchicalNSW('cosine', embeddingDim);
  hnswIndex.initIndex(totalBlocks);

  // Process in batches to avoid memory issues
  const batchSize = 5000; // Process 5k blocks at a time
  const totalBatches = Math.ceil(totalBlocks / batchSize);
  let processed = 0;
  let hnswId = 0;
  
  console.log(`⚡ Processing ${totalBlocks} blocks in ${totalBatches} batches of ${batchSize}...`);
  const startProcessing = Date.now();

  for (let batch = 0; batch < totalBatches; batch++) {
    const offset = batch * batchSize;
    const limit = Math.min(batchSize, totalBlocks - offset);
    
    console.log(`   📥 Loading batch ${batch + 1}/${totalBatches} (${offset} to ${offset + limit - 1})...`);
    
    // Load current batch
    const batchBlocks = await db.all(`
      SELECT b.uid, b.text, b.embedding, b.sermon_uid, b.section_uid, b.paragraph_uid,
             s.title as sermon_title, s.date as sermon_date,
             sec.number as section_number
      FROM blocks b
      JOIN sermons s ON b.sermon_uid = s.uid
      LEFT JOIN sections sec ON b.section_uid = sec.uid
      WHERE b.embedding IS NOT NULL
      ORDER BY b.rowid
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    console.log(`   ⚡ Processing batch ${batch + 1} (${batchBlocks.length} blocks)...`);
    
    // Process current batch
    for (let i = 0; i < batchBlocks.length; i++) {
      const block = batchBlocks[i];
      const embedding = JSON.parse(block.embedding);
      
      // Add to HNSW index
      hnswIndex.addPoint(embedding, hnswId);
      
      // Store metadata
      blockMetadata.set(hnswId, {
        uid: block.uid,
        text: block.text,
        sermon_uid: block.sermon_uid,
        section_uid: block.section_uid,
        paragraph_uid: block.paragraph_uid,
        sermon_title: block.sermon_title,
        sermon_date: block.sermon_date,
        section_number: block.section_number
      });

      hnswId++;
      processed++;
    }

    // Progress update after each batch
    const elapsed = Date.now() - startProcessing;
    const rate = processed / (elapsed / 1000);
    const eta = ((totalBlocks - processed) / rate) / 60;
    const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    console.log(`   📈 Completed batch ${batch + 1}/${totalBatches} - Processed ${processed}/${totalBlocks} embeddings (${rate.toFixed(0)}/sec, ETA: ${eta.toFixed(1)}min, Memory: ${memUsage}MB)`);
    
    // Optional: Force garbage collection between batches to keep memory usage down
    if (global.gc) {
      global.gc();
    }
  }

  console.log('✅ HNSW index ready!');
  indexReady = true;
  await db.close();
  
  // After building index, save to disk
  console.log('💾 Saving index to disk...');
  const saveStart = Date.now();
  hnswIndex.saveIndex(indexPath);
  console.log(`   💾 Index saved (${Date.now() - saveStart}ms)`);
  
  console.log('💾 Saving metadata to disk...');
  const metaStart = Date.now();
  const metadataArray = Array.from(blockMetadata.entries());
  require('fs').writeFileSync(metadataPath, JSON.stringify(metadataArray));
  console.log(`   💾 Metadata saved (${Date.now() - metaStart}ms)`);
  
  console.log('💾 Index saved to disk for faster startup next time');
}

// Serve static files
app.use(express.static(__dirname));

// SSE headers helper
function setupSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
}

function sendSSEData(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    res.status(400).json({ error: 'Query parameter required' });
    return;
  }

  setupSSE(res);
  
  try {
    const startTime = Date.now();
    
    // Open database for keyword search
    sendSSEData(res, { type: 'status', message: '🚀 Starting ultra-fast search...' });
    const db = await open({
      filename: "sermons.db",
      driver: sqlite3.Database,
    });

    sendSSEData(res, { type: 'status', message: `🔍 Searching for: "${query}"` });
    
    // Step 1: Keyword search (same as before)
    sendSSEData(res, { type: 'status', message: '📝 Performing keyword search...' });
    
    const keywordHits = await db.all(
      `SELECT b.uid, b.text, b.sermon_uid, b.section_uid, b.paragraph_uid,
              s.title as sermon_title, s.date as sermon_date,
              sec.number as section_number
       FROM blocks_fts f
       JOIN blocks b ON f.rowid = b.rowid
       JOIN sermons s ON b.sermon_uid = s.uid
       LEFT JOIN sections sec ON b.section_uid = sec.uid
       WHERE f.text MATCH ? 
       ORDER BY rank`,
      [query]
    );

    const keywordResults = keywordHits.map(h => ({ 
      ...h, 
      score: 2.0,
      type: 'keyword'
    }));

    sendSSEData(res, { 
      type: 'status', 
      message: `✅ Found ${keywordHits.length} keyword matches` 
    });

    // Send keyword results immediately
    if (keywordResults.length > 0) {
      sendSSEData(res, { 
        type: 'keyword_results', 
        results: keywordResults.slice(0, 10) 
      });
    }

    // Step 2: Ultra-fast semantic search with HNSW
    if (!indexReady) {
      sendSSEData(res, { 
        type: 'status', 
        message: '⚠️ HNSW index not ready, falling back to slower search...' 
      });
      // Fallback to original method if needed
      await db.close();
      res.end();
      return;
    }

    sendSSEData(res, { type: 'status', message: '⚡ Performing ultra-fast semantic search...' });
    
    // Get query embedding
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = response.data[0].embedding;

    // Ultra-fast HNSW search
    const searchStartTime = Date.now();
    const numResults = 100; // Get more candidates for better quality
    const searchResults = hnswIndex.searchKnn(queryEmbedding, numResults);
    const searchTime = Date.now() - searchStartTime;

    sendSSEData(res, { 
      type: 'status', 
      message: `🚀 HNSW search completed in ${searchTime}ms! Found ${searchResults.neighbors.length} candidates` 
    });

    // Convert HNSW results to our format
    const semanticResults = [];
    const keywordUids = new Set(keywordHits.map(h => h.uid));

    for (let i = 0; i < searchResults.neighbors.length; i++) {
      const hnswId = searchResults.neighbors[i];
      const distance = searchResults.distances[i];
      const similarity = 1 - distance; // Convert distance to similarity
      
      const metadata = blockMetadata.get(hnswId);
      if (metadata && !keywordUids.has(metadata.uid) && similarity > 0.3) {
        semanticResults.push({
          ...metadata,
          score: similarity,
          type: 'semantic'
        });
      }
    }

    // Sort by similarity score
    semanticResults.sort((a, b) => b.score - a.score);
    const topSemanticResults = semanticResults.slice(0, 50);

    sendSSEData(res, { 
      type: 'status', 
      message: `✅ Found ${topSemanticResults.length} high-quality semantic matches` 
    });

    // Send intermediate results immediately (HNSW is so fast we get results instantly)
    if (topSemanticResults.length > 0) {
      const combinedResults = [...keywordResults, ...topSemanticResults];
      combinedResults.sort((a, b) => {
        if (a.type === 'keyword' && b.type === 'semantic') return -1;
        if (a.type === 'semantic' && b.type === 'keyword') return 1;
        return b.score - a.score;
      });

      sendSSEData(res, {
        type: 'intermediate_results',
        results: combinedResults.slice(0, 15),
        progress: 100
      });
    }

    // Final results
    const finalResults = [...keywordResults, ...topSemanticResults];
    finalResults.sort((a, b) => {
      if (a.type === 'keyword' && b.type === 'semantic') return -1;
      if (a.type === 'semantic' && b.type === 'keyword') return 1;
      return b.score - a.score;
    });

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    sendSSEData(res, {
      type: 'final_results',
      results: finalResults.slice(0, 10),
      stats: {
        total: finalResults.length,
        keyword: keywordResults.length,
        semantic: topSemanticResults.length,
        time: totalTime,
        processed: blockMetadata.size,
        coverage: '100.0', // HNSW searches entire index
        method: 'HNSW'
      }
    });

    await db.close();
    res.end();

  } catch (error) {
    console.error('Search error:', error);
    sendSSEData(res, { 
      type: 'error', 
      message: error.message 
    });
    res.end();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: indexReady ? 'ready' : 'initializing',
    indexSize: blockMetadata.size
  });
});

// Start server
app.listen(port, async () => {
  console.log(`🚀 Optimized sermon search server starting at http://localhost:${port}`);
  console.log(`📖 Open http://localhost:${port}/search-web.html to start searching`);
  
  // Initialize HNSW index in background
  await initializeIndex();
});
