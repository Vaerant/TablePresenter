const express = require('express');
const path = require('path');
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const OpenAI = require("openai");
const { HierarchicalNSW } = require('hnswlib-node');
const fs = require('fs');

const app = express();
const port = 3000;

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: 'key' });

// Global HNSW index
let hnswIndex = null;
let indexMetadata = null;
const INDEX_PATH = 'sermon_embeddings.hnsw';
const METADATA_PATH = 'sermon_embeddings_metadata.json';

// Initialize HNSW index on startup
async function initializeHNSWIndex() {
  try {
    if (fs.existsSync(INDEX_PATH) && fs.existsSync(METADATA_PATH)) {
      console.log('📊 Loading existing HNSW index...');
      
      // Load metadata
      indexMetadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
      
      // Initialize and load index
      hnswIndex = new HierarchicalNSW('cosine', indexMetadata.dimension);
      hnswIndex.readIndex(INDEX_PATH);
      
      console.log(`✅ HNSW index loaded: ${indexMetadata.count} vectors, dimension ${indexMetadata.dimension}`);
    } else {
      console.log('🔨 HNSW index not found, will build on first search...');
    }
  } catch (error) {
    console.error('❌ Failed to load HNSW index:', error);
    hnswIndex = null;
    indexMetadata = null;
  }
}

// Build HNSW index from database
async function buildHNSWIndex(db, sendStatusUpdate = null) {
  try {
    if (sendStatusUpdate) sendStatusUpdate('🔨 Building HNSW index from database...');
    
    // Get all blocks with embeddings
    const blocks = await db.all(`
      SELECT b.uid, b.embedding, b.sermon_uid, b.section_uid, b.paragraph_uid, b.text,
             s.title as sermon_title, s.date as sermon_date,
             sec.number as section_number
      FROM blocks b
      JOIN sermons s ON b.sermon_uid = s.uid
      LEFT JOIN sections sec ON b.section_uid = sec.uid
      WHERE b.embedding IS NOT NULL
      ORDER BY b.uid
    `);

    if (blocks.length === 0) {
      throw new Error('No blocks with embeddings found');
    }

    // Parse first embedding to get dimension
    const firstEmbedding = JSON.parse(blocks[0].embedding);
    const dimension = firstEmbedding.length;
    
    if (sendStatusUpdate) sendStatusUpdate(`📐 Creating index for ${blocks.length} vectors, dimension ${dimension}...`);

    // Create new HNSW index
    hnswIndex = new HierarchicalNSW('cosine', dimension);
    hnswIndex.initIndex(blocks.length);

    // Prepare metadata mapping
    const metadata = {
      dimension,
      count: blocks.length,
      uidToIndex: {},
      indexToBlock: {}
    };

    // Add vectors to index
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const embedding = JSON.parse(block.embedding);
      
      hnswIndex.addPoint(embedding, i);
      
      // Store mappings
      metadata.uidToIndex[block.uid] = i;
      metadata.indexToBlock[i] = {
        uid: block.uid,
        text: block.text,
        sermon_uid: block.sermon_uid,
        section_uid: block.section_uid,
        paragraph_uid: block.paragraph_uid,
        sermon_title: block.sermon_title,
        sermon_date: block.sermon_date,
        section_number: block.section_number
      };

      if (sendStatusUpdate && i % 1000 === 0) {
        sendStatusUpdate(`🔄 Added ${i + 1}/${blocks.length} vectors to index...`);
      }
    }

    // Save index and metadata
    if (sendStatusUpdate) sendStatusUpdate('💾 Saving HNSW index to disk...');
    
    hnswIndex.writeIndex(INDEX_PATH);
    fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));
    
    indexMetadata = metadata;
    
    if (sendStatusUpdate) sendStatusUpdate(`✅ HNSW index built and saved: ${blocks.length} vectors`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to build HNSW index:', error);
    if (sendStatusUpdate) sendStatusUpdate(`❌ Failed to build HNSW index: ${error.message}`);
    return false;
  }
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

function cosineSimilarity(vecA, vecB) {
  let dot = 0.0, normA = 0.0, normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper function to escape FTS5 query
function escapeFTS5Query(query) {
  // Remove quotes and escape special characters
  let escaped = query.replace(/['"]/g, '').trim();
  
  // Split into words and wrap each in quotes to handle phrases
  const words = escaped.split(/\s+/).filter(word => word.length > 0);
  
  if (words.length === 1) {
    return `"${words[0]}"`;
  } else if (words.length > 1) {
    // For multi-word queries, try phrase search first, then fallback to AND
    return `"${escaped}"`;
  }
  
  return escaped;
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
    
    // Open database
    sendSSEData(res, { type: 'status', message: '🚀 Opening database...' });
    const db = await open({
      filename: "sermons.db",
      driver: sqlite3.Database,
    });

    sendSSEData(res, { type: 'status', message: `🔍 Searching for: "${query}"` });
    
    // Step 1: Keyword search (unchanged)
    sendSSEData(res, { type: 'status', message: '📝 Performing keyword search...' });
    
    const escapedQuery = escapeFTS5Query(query);
    console.log('Original query:', query);
    console.log('Escaped FTS5 query:', escapedQuery);
    
    let keywordHits = [];
    try {
      keywordHits = await db.all(
        `SELECT b.uid, b.text, b.sermon_uid, b.section_uid, b.paragraph_uid,
                s.title as sermon_title, s.date as sermon_date,
                sec.number as section_number
         FROM blocks_fts f
         JOIN blocks b ON f.rowid = b.rowid
         JOIN sermons s ON b.sermon_uid = s.uid
         LEFT JOIN sections sec ON b.section_uid = sec.uid
         WHERE f.text MATCH ? 
         ORDER BY rank`,
        [escapedQuery]
      );
    } catch (ftsError) {
      console.log('FTS5 phrase search failed, trying individual words:', ftsError.message);
      
      // Fallback: search for individual words with AND
      const words = query.replace(/['"]/g, '').split(/\s+/).filter(word => word.length > 0);
      if (words.length > 1) {
        const andQuery = words.map(word => `"${word}"`).join(' AND ');
        console.log('Trying AND query:', andQuery);
        
        try {
          keywordHits = await db.all(
            `SELECT b.uid, b.text, b.sermon_uid, b.section_uid, b.paragraph_uid,
                    s.title as sermon_title, s.date as sermon_date,
                    sec.number as section_number
             FROM blocks_fts f
             JOIN blocks b ON f.rowid = b.rowid
             JOIN sermons s ON b.sermon_uid = s.uid
             LEFT JOIN sections sec ON b.section_uid = sec.uid
             WHERE f.text MATCH ? 
             ORDER BY rank`,
            [andQuery]
          );
        } catch (andError) {
          console.log('AND query also failed, trying OR:', andError.message);
          
          // Final fallback: search for individual words with OR
          const orQuery = words.map(word => `"${word}"`).join(' OR ');
          console.log('Trying OR query:', orQuery);
          
          keywordHits = await db.all(
            `SELECT b.uid, b.text, b.sermon_uid, b.section_uid, b.paragraph_uid,
                    s.title as sermon_title, s.date as sermon_date,
                    sec.number as section_number
             FROM blocks_fts f
             JOIN blocks b ON f.rowid = b.rowid
             JOIN sermons s ON b.sermon_uid = s.uid
             LEFT JOIN sections sec ON b.section_uid = sec.uid
             WHERE f.text MATCH ? 
             ORDER BY rank`,
            [orQuery]
          );
        }
      } else if (words.length === 1) {
        // Single word search
        keywordHits = await db.all(
          `SELECT b.uid, b.text, b.sermon_uid, b.section_uid, b.paragraph_uid,
                  s.title as sermon_title, s.date as sermon_date,
                  sec.number as section_number
           FROM blocks_fts f
           JOIN blocks b ON f.rowid = b.rowid
           JOIN sermons s ON b.sermon_uid = s.uid
           LEFT JOIN sections sec ON b.section_uid = sec.uid
           WHERE f.text MATCH ? 
           ORDER BY rank`,
          [`"${words[0]}"`]
        );
      }
    }

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

    // Step 2: HNSW-powered semantic search
    sendSSEData(res, { type: 'status', message: '🧠 Starting HNSW semantic search...' });
    
    // Build index if not available
    if (!hnswIndex || !indexMetadata) {
      const built = await buildHNSWIndex(db, (msg) => sendSSEData(res, { type: 'status', message: msg }));
      if (!built) {
        throw new Error('Failed to build HNSW index');
      }
    }

    // Get query embedding
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = response.data[0].embedding;

    sendSSEData(res, { type: 'status', message: '⚡ Performing fast HNSW search...' });

    // Perform HNSW search - much faster than manual cosine similarity!
    const k = 100; // Get top 100 most similar
    const searchResults = hnswIndex.searchKnn(queryEmbedding, k);
    
    // Convert HNSW results to our format
    const keywordUids = new Set(keywordHits.map(h => h.uid));
    const semanticResults = [];
    
    for (let i = 0; i < searchResults.neighbors.length; i++) {
      const neighborIndex = searchResults.neighbors[i];
      const similarity = 1 - searchResults.distances[i]; // Convert distance to similarity
      const blockData = indexMetadata.indexToBlock[neighborIndex];
      
      // Skip if already in keyword results
      if (keywordUids.has(blockData.uid)) continue;
      
      // Only keep results with reasonable similarity
      if (similarity > 0.3) {
        semanticResults.push({
          ...blockData,
          score: similarity,
          type: 'semantic'
        });
      }
    }

    sendSSEData(res, { 
      type: 'status', 
      message: `⚡ HNSW search completed: ${semanticResults.length} semantic matches found` 
    });

    // Combine and sort results
    const finalResults = [...keywordResults, ...semanticResults];
    
    // Sort: keywords first, then by score within each type
    finalResults.sort((a, b) => {
      if (a.type === 'keyword' && b.type === 'semantic') return -1;
      if (a.type === 'semantic' && b.type === 'keyword') return 1;
      return b.score - a.score;
    });

    const endTime = Date.now();
    const keywordCount = finalResults.filter(r => r.type === 'keyword').length;
    const semanticCount = finalResults.filter(r => r.type === 'semantic').length;

    console.log('HNSW search results:', {
      totalResults: finalResults.length,
      keywordCount,
      semanticCount,
      searchTime: endTime - startTime,
      topSemanticScores: semanticResults.slice(0, 5).map(r => r.score)
    });

    const resultsToSend = Math.min(50, finalResults.length);
    
    sendSSEData(res, {
      type: 'final_results',
      results: finalResults.slice(0, resultsToSend),
      stats: {
        total: finalResults.length,
        keyword: keywordCount,
        semantic: semanticCount,
        time: endTime - startTime,
        processed: indexMetadata ? indexMetadata.count : 0,
        coverage: '100.0'
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

// Add endpoint to rebuild index
app.get('/rebuild-index', async (req, res) => {
  try {
    const db = await open({
      filename: "sermons.db",
      driver: sqlite3.Database,
    });

    setupSSE(res);
    
    const success = await buildHNSWIndex(db, (msg) => sendSSEData(res, { type: 'status', message: msg }));
    
    if (success) {
      sendSSEData(res, { type: 'success', message: '✅ HNSW index rebuilt successfully' });
    } else {
      sendSSEData(res, { type: 'error', message: '❌ Failed to rebuild HNSW index' });
    }
    
    await db.close();
    res.end();
  } catch (error) {
    sendSSEData(res, { type: 'error', message: error.message });
    res.end();
  }
});

app.listen(port, async () => {
  console.log(`🚀 Sermon search server running at http://localhost:${port}`);
  console.log(`📖 Open http://localhost:${port}/search-web.html to start searching`);
  console.log(`🔨 Rebuild index at http://localhost:${port}/rebuild-index`);
  
  // Initialize HNSW index
  await initializeHNSWIndex();
});
