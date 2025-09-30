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
async function performSemanticSearch(queryEmbedding, keywordUids, limit = 500) { // Increase limit for better coverage
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
        nprobe: 32, // Increase for better accuracy (was 16)
        ef: Math.min(limit * 2, 1000) // Add ef parameter for better recall
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
  console.log('Zilliz response:', JSON.stringify(result, null, 2));
  
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

  console.log('Parsed hits:', Array.isArray(hits) ? hits.length : 0, Array.isArray(hits) ? hits.slice(0, 3) : []);

  if (!Array.isArray(hits)) {
    console.error('Unexpected Zilliz response format:', result);
    return [];
  }

  // Convert to consistent shape with improved similarity calculation
  return hits.map(hit => {
    const distanceOrScore = hit.distance ?? hit.score;
    let similarity = 0;
    if (typeof distanceOrScore === 'number') {
      if (ZILLIZ_METRIC_TYPE === 'COSINE') {
        // Improved COSINE distance to similarity conversion
        // Zilliz COSINE distance: 0 = identical, 2 = opposite
        similarity = Math.max(0, Math.min(1, 1 - (distanceOrScore / 2)));
      } else if (ZILLIZ_METRIC_TYPE === 'IP') {
        // Inner Product: higher is better, normalize to 0-1 range
        similarity = Math.max(0, Math.min(1, (distanceOrScore + 1) / 2));
      } else if (ZILLIZ_METRIC_TYPE === 'L2') {
        // L2 distance: lower is better
        similarity = 1 / (1 + distanceOrScore);
      } else {
        similarity = Math.max(0, 1 - distanceOrScore);
      }
    }
    return {
      block_uid: hit.block_uid ?? hit.entity?.block_uid ?? hit.fields?.block_uid,
      score: similarity,
      id: hit.id ?? hit.entity?.id ?? hit.fields?.id,
      distance: typeof distanceOrScore === 'number' ? distanceOrScore : undefined
    };
  }).filter(h => h.block_uid);
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

    // Step 2: Enhanced Semantic search using Zilliz with local re-ranking
    sendSSEData(res, { type: 'status', message: '🧠 Starting enhanced Zilliz semantic search...' });
    sendSSEData(res, { type: 'status', message: `📐 Metric: ${ZILLIZ_METRIC_TYPE}, Enhanced re-ranking enabled` });

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = response.data[0].embedding;

    // Get more semantic results from Zilliz for better coverage
    const keywordUids = limitedKeywordHits.map(h => h.uid);
    const semanticHits = await performSemanticSearch(queryEmbedding, keywordUids, 500); // Increased from 200
    
    sendSSEData(res, { 
      type: 'status', 
      message: `🎯 Found ${semanticHits.length} semantic matches from Zilliz` 
    });

    // Enhanced re-ranking with batch processing
    let topSemanticResults = [];
    if (semanticHits.length > 0) {
      sendSSEData(res, { type: 'status', message: '🔄 Enhanced re-ranking with local embeddings...' });
      
      // Process in batches for better performance
      const batchSize = 100;
      const batches = [];
      for (let i = 0; i < semanticHits.length; i += batchSize) {
        batches.push(semanticHits.slice(i, i + batchSize));
      }
      
      let processedCount = 0;
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
        
        // Enhanced scoring for this batch
        const batchResults = batch
          .map(hit => {
            const block = blockMap.get(hit.block_uid);
            if (!block) return null;
            
            let scores = {
              local: hit.score,
              zilliz: hit.score,
              combined: hit.score
            };
            
            // Calculate enhanced similarity if embedding exists
            if (block.embedding) {
              try {
                const blockEmbedding = JSON.parse(block.embedding);
                scores = calculateEnhancedSimilarity(queryEmbedding, blockEmbedding, hit.score);
              } catch (e) {
                console.warn('Failed to parse embedding for block:', block.uid);
              }
            }
            
            return {
              ...block,
              score: scores.combined, // Use combined score for ranking
              local_score: scores.local,
              zilliz_score: scores.zilliz,
              type: 'semantic',
              distance: hit.distance
            };
          })
          .filter(Boolean);

        allResults.push(...batchResults);
        processedCount += batch.length;
        
        // Send progress update
        const progress = ((batchIndex + 1) / batches.length * 100).toFixed(1);
        sendSSEData(res, { 
          type: 'status', 
          message: `⚡ Processed batch ${batchIndex + 1}/${batches.length} (${progress}%)` 
        });
      }
      
      // Final ranking with improved scoring
      topSemanticResults = allResults
        .sort((a, b) => {
          // Primary sort by combined score
          if (Math.abs(b.score - a.score) > 0.01) {
            return b.score - a.score;
          }
          // Secondary sort by local score for tie-breaking
          return (b.local_score || b.score) - (a.local_score || a.score);
        })
        .slice(0, 100); // Keep top 100 after re-ranking

      sendSSEData(res, { 
        type: 'status', 
        message: `✅ Enhanced re-ranking complete: ${topSemanticResults.length} results` 
      });
      
      // Debug logging for enhanced scores
      console.log('Enhanced semantic scores (top 10):', topSemanticResults.slice(0, 10).map(h => ({
        combined: h.score.toFixed(4),
        local: h.local_score?.toFixed(4) || 'N/A',
        zilliz: h.zilliz_score?.toFixed(4) || 'N/A',
        distance: h.distance?.toFixed(4) || 'N/A'
      })));
    }

    // Improved result combination with better scoring balance
    console.log('Before enhanced results combination:', {
      keywordResultsLength: keywordResults.length,
      topSemanticResultsLength: topSemanticResults.length,
    });

    // Remove duplicates between keyword and semantic results
    const keywordUidsSet = new Set(keywordResults.map(r => r.uid));
    const uniqueSemanticResults = topSemanticResults.filter(r => !keywordUidsSet.has(r.uid));
    
    // Enhanced keyword score adjustment - make them competitive but not overwhelming
    const adjustedKeywordResults = keywordResults.map((r, index) => ({
      ...r,
      // More nuanced keyword scoring based on rank
      score: Math.min(0.98, 0.95 - (index * 0.015)),
      original_rank: index
    }));
    
    // Improved semantic score normalization
    const maxSemanticScore = uniqueSemanticResults.length > 0 ? uniqueSemanticResults[0].score : 0;
    const normalizedSemanticResults = uniqueSemanticResults.map((r, index) => ({
      ...r,
      // Ensure top semantic results can compete with keyword results
      score: maxSemanticScore > 0.8 ? r.score : r.score * 1.1, // Boost if needed
      semantic_rank: index
    }));
    
    // Smart combination with interleaving
    const finalResults = [];
    const maxKeyword = Math.min(20, adjustedKeywordResults.length);
    const maxSemantic = Math.min(80, normalizedSemanticResults.length);
    
    // Add results with intelligent interleaving
    let keywordIndex = 0;
    let semanticIndex = 0;
    
    // Always start with top keyword results if they exist
    while (finalResults.length < 100 && (keywordIndex < maxKeyword || semanticIndex < maxSemantic)) {
      // Add keyword result if available and score is competitive
      if (keywordIndex < maxKeyword && 
          (semanticIndex >= maxSemantic || 
           adjustedKeywordResults[keywordIndex].score >= (normalizedSemanticResults[semanticIndex]?.score || 0))) {
        finalResults.push(adjustedKeywordResults[keywordIndex]);
        keywordIndex++;
      }
      // Add semantic result
      else if (semanticIndex < maxSemantic) {
        finalResults.push(normalizedSemanticResults[semanticIndex]);
        semanticIndex++;
      }
    }
    
    // Final sort by score to ensure best results are at top
    finalResults.sort((a, b) => b.score - a.score);

    const endTime = Date.now();
    const keywordCount = finalResults.filter(r => r.type === 'keyword').length;
    const semanticCount = finalResults.filter(r => r.type === 'semantic').length;

    // Enhanced debug logging
    console.log('Enhanced final results:', {
      totalResults: finalResults.length,
      keywordCount,
      semanticCount,
      duplicatesRemoved: topSemanticResults.length - uniqueSemanticResults.length,
      topResults: finalResults.slice(0, 20).map(r => ({ 
        type: r.type, 
        score: r.score.toFixed(3),
        local: r.local_score?.toFixed(3) || 'N/A',
        zilliz: r.zilliz_score?.toFixed(3) || 'N/A'
      })),
      scoreDistribution: {
        maxKeyword: adjustedKeywordResults[0]?.score.toFixed(3) || 'N/A',
        maxSemantic: normalizedSemanticResults[0]?.score.toFixed(3) || 'N/A',
        avgTop20: (finalResults.slice(0, 20).reduce((sum, r) => sum + r.score, 0) / Math.min(20, finalResults.length)).toFixed(3)
      }
    });

    // Send enhanced results
    const resultsToSend = Math.min(100, finalResults.length); // Increased from 50
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
        coverage: `Enhanced Hybrid (Zilliz + local re-ranking, metric=${ZILLIZ_METRIC_TYPE})`,
        enhancement: 'Local re-ranking with combined scoring'
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