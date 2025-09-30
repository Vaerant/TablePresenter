const express = require('express');
const path = require('path');
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const OpenAI = require("openai");
require('dotenv').config();

const app = express();
const port = 3000;

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Zilliz configuration
const ZILLIZ_QUERY_ENDPOINT = process.env.ZILLIZ_QUERY_ENDPOINT || "";
const ZILLIZ_API_KEY = process.env.ZILLIZ_API_KEY;
const ZILLIZ_COLLECTION_NAME = process.env.ZILLIZ_COLLECTION_NAME || "sermon_blocks";
// Add configurable metric type (defaults to COSINE per Zilliz docs)
const ZILLIZ_METRIC_TYPE = process.env.ZILLIZ_METRIC_TYPE || "COSINE";

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

// Helper function for Zilliz requests with retry
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
    await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** (attempt - 1), 8000)));
  }
}

// Semantic search using Zilliz
async function performSemanticSearch(queryEmbedding, keywordUids, limit = 500) {
  const fetch = global.fetch || (await import("node-fetch")).default;
  
  if (!ZILLIZ_API_KEY) {
    throw new Error("ZILLIZ_API_KEY env var is required for semantic search.");
  }

  // Don't filter out keyword results - let them compete fairly
  let filter = "";

  // Payload with enhanced search parameters for better accuracy
  const searchPayload = {
    collectionName: ZILLIZ_COLLECTION_NAME,
    data: [queryEmbedding],
    limit,
    outputFields: ["id", "block_uid"],
    ...(filter ? { filter } : {}),
    searchParams: {
      annsField: "embedding",
      metricType: ZILLIZ_METRIC_TYPE,
      params: { 
        nprobe: 64, // Increase for better accuracy when getting 500 results
        ef: Math.min(limit * 2, 2000) // Increase ef for better recall with 500 results
      }
    }
  };

  console.log('Zilliz search payload:', JSON.stringify(searchPayload, null, 2));

  const response = await postWithRetry(fetch, ZILLIZ_QUERY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ZILLIZ_API_KEY}`,
    },
    body: JSON.stringify(searchPayload),
  });

  const result = await response.json();
  console.log('Zilliz response summary:', { 
    code: result.code, 
    dataLength: result.data ? 'present' : 'missing',
    resultCount: result.data?.length || 'unknown'
  });
  
  if (result.code && result.code !== 0) {
    throw new Error(`Zilliz API error (${result.code}): ${result.message || 'Unknown error'}`);
  }
  
  // Parse according to docs, with fallbacks for older shapes
  let hits = [];
  if (result?.data) {
    if (Array.isArray(result.data?.results)) {
      hits = result.data.results;
    } else if (Array.isArray(result.data?.[0]?.results)) {
      hits = result.data[0].results;
    } else if (Array.isArray(result.data)) {
      if (Array.isArray(result.data[0])) {
        hits = result.data[0];
      } else {
        hits = result.data;
      }
    } else if (Array.isArray(result.data?.rows)) {
      hits = result.data.rows;
    } else if (Array.isArray(result.data?.entities)) {
      hits = result.data.entities;
    }
  }

  console.log('Parsed hits:', Array.isArray(hits) ? hits.length : 0);

  if (!Array.isArray(hits)) {
    console.error('Unexpected Zilliz response format:', result);
    return [];
  }

  // Return raw hits with block_uid for local processing
  return hits.map(hit => ({
    block_uid: hit.block_uid ?? hit.entity?.block_uid ?? hit.fields?.block_uid,
    id: hit.id ?? hit.entity?.id ?? hit.fields?.id,
    distance: hit.distance ?? hit.score,
    zilliz_rank: hits.indexOf(hit)
  })).filter(h => h.block_uid);
}

// Enhanced local re-ranking function
function calculateEnhancedSimilarity(queryEmbedding, blockEmbedding, zillizScore) {
  // Calculate local cosine similarity
  const localSimilarity = cosineSimilarity(queryEmbedding, blockEmbedding);
  
  // Combine Zilliz and local scores with weighted average
  // Give more weight to local calculation for final accuracy
  const combinedScore = (localSimilarity * 0.7) + (zillizScore * 0.3);
  
  return {
    local: localSimilarity,
    zilliz: zillizScore,
    combined: combinedScore
  };
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
    
    // Step 1: Keyword search with proper FTS5 escaping
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
         ORDER BY rank
         LIMIT 100`,
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
             ORDER BY rank
             LIMIT 100`,
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
             ORDER BY rank
             LIMIT 100`,
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
           ORDER BY rank
           LIMIT 100`,
          [`"${words[0]}"`]
        );
      }
    }

    // Limit keyword results and give them competitive but not overwhelming scores
    const limitedKeywordHits = keywordHits.slice(0, 25);
    const keywordResults = limitedKeywordHits.map((h, index) => ({ 
      ...h, 
      score: 1.0 - (index * 0.01), // Decreasing scores: 1.0, 0.99, 0.98, etc.
      type: 'keyword'
    }));
    
    sendSSEData(res, { 
      type: 'status', 
      message: `✅ Found ${keywordHits.length} keyword matches (showing top 25)` 
    });

    // Send keyword results immediately
    if (keywordResults.length > 0) {
      sendSSEData(res, { 
        type: 'keyword_results', 
        results: keywordResults.slice(0, 10) 
      });
    }

    // Step 2: Get 500 results from Zilliz and do local cosine similarity
    sendSSEData(res, { type: 'status', message: '🧠 Getting 500 candidates from Zilliz...' });
    sendSSEData(res, { type: 'status', message: `📐 Metric: ${ZILLIZ_METRIC_TYPE}, Local cosine re-ranking enabled` });

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = response.data[0].embedding;

    // Get 500 semantic candidates from Zilliz
    const keywordUids = limitedKeywordHits.map(h => h.uid);
    const semanticHits = await performSemanticSearch(queryEmbedding, keywordUids, 500);
    
    sendSSEData(res, { 
      type: 'status', 
      message: `🎯 Got ${semanticHits.length} candidates from Zilliz, starting local re-ranking...` 
    });

    // Local cosine similarity calculation on all 500 results
    let topSemanticResults = [];
    if (semanticHits.length > 0) {
      // Get all block details and embeddings for the 500 candidates
      const batchSize = 100;
      const batches = [];
      for (let i = 0; i < semanticHits.length; i += batchSize) {
        batches.push(semanticHits.slice(i, i + batchSize));
      }
      
      const allResults = [];
      
      for (const [batchIndex, batch] of batches.entries()) {
        const blockUids = batch.map(hit => `'${hit.block_uid}'`).join(',');
        const blockDetails = await db.all(`
          SELECT b.uid, b.text, b.embedding, b.sermon_uid, b.section_uid, b.paragraph_uid,
                 s.title as sermon_title, s.date as sermon_date,
                 sec.number as section_number
          FROM blocks b
          JOIN sermons s ON b.sermon_uid = s.uid
          LEFT JOIN sections sec ON b.section_uid = sec.uid
          WHERE b.uid IN (${blockUids})
        `);

        const blockMap = new Map(blockDetails.map(block => [block.uid, block]));
        
        // Local cosine similarity calculation for this batch
        const batchResults = batch
          .map(hit => {
            const block = blockMap.get(hit.block_uid);
            if (!block || !block.embedding) return null;
            
            try {
              const blockEmbedding = JSON.parse(block.embedding);
              const localScore = cosineSimilarity(queryEmbedding, blockEmbedding);
              
              return {
                ...block,
                score: localScore, // Use local cosine similarity as primary score
                zilliz_rank: hit.zilliz_rank,
                zilliz_distance: hit.distance,
                type: 'semantic'
              };
            } catch (e) {
              console.warn('Failed to parse embedding for block:', block.uid);
              return null;
            }
          })
          .filter(Boolean);

        allResults.push(...batchResults);
        
        // Send progress update
        const progress = ((batchIndex + 1) / batches.length * 100).toFixed(1);
        sendSSEData(res, { 
          type: 'status', 
          message: `⚡ Local re-ranking batch ${batchIndex + 1}/${batches.length} (${progress}%)` 
        });
      }
      
      // Sort by local cosine similarity score
      topSemanticResults = allResults
        .sort((a, b) => b.score - a.score)
        .slice(0, 100); // Keep top 100 after local re-ranking

      sendSSEData(res, { 
        type: 'status', 
        message: `✅ Local re-ranking complete: ${topSemanticResults.length} results (top score: ${(topSemanticResults[0]?.score * 100).toFixed(1)}%)` 
      });
      
      // Debug logging for local scores
      console.log('Local cosine scores (top 10):', topSemanticResults.slice(0, 10).map(h => ({
        local_score: (h.score * 100).toFixed(1),
        zilliz_rank: h.zilliz_rank,
        zilliz_distance: h.zilliz_distance?.toFixed(4) || 'N/A'
      })));
    }

    // Result combination with improved scoring balance
    console.log('Before results combination:', {
      keywordResultsLength: keywordResults.length,
      topSemanticResultsLength: topSemanticResults.length,
    });

    // Remove duplicates between keyword and semantic results
    const keywordUidsSet = new Set(keywordResults.map(r => r.uid));
    const uniqueSemanticResults = topSemanticResults.filter(r => !keywordUidsSet.has(r.uid));
    
    // Keyword score adjustment to compete with local cosine scores
    const adjustedKeywordResults = keywordResults.map((r, index) => ({
      ...r,
      // Competitive keyword scoring that can compete with cosine similarity
      score: Math.min(0.95, 0.90 - (index * 0.01)), // Start at 90% and decrease
      original_rank: index
    }));
    
    // Normalize semantic scores if needed
    const maxSemanticScore = uniqueSemanticResults.length > 0 ? uniqueSemanticResults[0].score : 0;
    const normalizedSemanticResults = uniqueSemanticResults.map((r, index) => ({
      ...r,
      // Keep the local cosine similarity scores as they are more accurate
      score: r.score,
      semantic_rank: index
    }));
    
    // Smart combination with score-based sorting
    const finalResults = [];
    
    // Combine all results
    finalResults.push(...adjustedKeywordResults);
    finalResults.push(...normalizedSemanticResults);
    
    // Sort by score - let the best scores win regardless of type
    finalResults.sort((a, b) => b.score - a.score);

    const endTime = Date.now();
    const keywordCount = finalResults.filter(r => r.type === 'keyword').length;
    const semanticCount = finalResults.filter(r => r.type === 'semantic').length;

    // Enhanced debug logging
    console.log('Final results with local cosine:', {
      totalResults: finalResults.length,
      keywordCount,
      semanticCount,
      duplicatesRemoved: topSemanticResults.length - uniqueSemanticResults.length,
      topResults: finalResults.slice(0, 15).map(r => ({ 
        type: r.type, 
        score: (r.score * 100).toFixed(1) + '%',
        rank: finalResults.indexOf(r)
      })),
      scoreDistribution: {
        maxKeyword: adjustedKeywordResults[0] ? (adjustedKeywordResults[0].score * 100).toFixed(1) + '%' : 'N/A',
        maxSemantic: normalizedSemanticResults[0] ? (normalizedSemanticResults[0].score * 100).toFixed(1) + '%' : 'N/A',
        candidatesProcessed: semanticHits.length
      }
    });

    // Send enhanced results
    const resultsToSend = Math.min(100, finalResults.length);
    sendSSEData(res, {
      type: 'final_results',
      results: finalResults.slice(0, resultsToSend),
      stats: {
        total: finalResults.length,
        keyword: keywordCount,
        semantic: semanticCount,
        time: endTime - startTime,
        processed: semanticHits.length,
        duplicatesRemoved: topSemanticResults.length - uniqueSemanticResults.length,
        coverage: `Hybrid (Zilliz 500 candidates + local cosine re-ranking, metric=${ZILLIZ_METRIC_TYPE})`,
        enhancement: 'Local cosine similarity on 500 Zilliz candidates'
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

app.listen(port, () => {
  console.log(`🚀 Sermon search server running at http://localhost:${port}`);
  console.log(`📖 Open http://localhost:${port}/search-web.html to start searching`);
});