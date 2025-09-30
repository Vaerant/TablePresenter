const express = require('express');
const path = require('path');
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const OpenAI = require("openai");

const app = express();
const port = 3000;

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: 'key' });

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

    // Step 2: Optimized Semantic search
    sendSSEData(res, { type: 'status', message: '🧠 Starting optimized semantic search...' });
    
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = response.data[0].embedding;

    // Get total count
    const keywordUids = keywordHits.map(h => h.uid);
    let countQuery = `SELECT COUNT(*) as count FROM blocks WHERE embedding IS NOT NULL`;
    if (keywordUids.length > 0) {
      const placeholders = keywordUids.map(() => '?').join(',');
      countQuery += ` AND uid NOT IN (${placeholders})`;
    }
    const totalCount = await db.get(countQuery, keywordUids);
    
    sendSSEData(res, { 
      type: 'status', 
      message: `📊 Processing ${totalCount.count} blocks with embeddings...` 
    });

    // Optimized batch processing with early termination and sampling
    const batchSize = 10000; // Larger batches for better throughput
    const maxBatches = Math.min(15, Math.ceil(totalCount.count / batchSize)); // Limit total batches
    const targetResults = 50; // Target number of good semantic results
    let topSemanticResults = [];
    let processedCount = 0;
    let batchNumber = 0;
    let earlyTerminationScore = 0; // Dynamic threshold for early termination
    
    // Pre-calculate offsets for sampling if we have too many blocks
    let offsets = [];
    if (totalCount.count > batchSize * maxBatches) {
      // Sample across the entire dataset
      const step = Math.floor(totalCount.count / (batchSize * maxBatches));
      for (let i = 0; i < maxBatches; i++) {
        offsets.push(i * step * batchSize);
      }
      sendSSEData(res, { 
        type: 'status', 
        message: `🎯 Sampling strategy: Processing ${maxBatches} batches across ${totalCount.count} blocks` 
      });
    } else {
      // Process all data
      for (let offset = 0; offset < totalCount.count; offset += batchSize) {
        offsets.push(offset);
      }
    }
    
    for (const offset of offsets) {
      const batchStartTime = Date.now();
      batchNumber++;
      
      // Get batch with optimized query (only essential fields)
      let batchQuery = `
        SELECT b.uid, b.text, b.embedding, b.sermon_uid, b.section_uid, b.paragraph_uid,
               s.title as sermon_title, s.date as sermon_date,
               sec.number as section_number
        FROM blocks b
        JOIN sermons s ON b.sermon_uid = s.uid
        LEFT JOIN sections sec ON b.section_uid = sec.uid
        WHERE b.embedding IS NOT NULL`;
      
      if (keywordUids.length > 0) {
        const placeholders = keywordUids.map(() => '?').join(',');
        batchQuery += ` AND b.uid NOT IN (${placeholders})`;
      }
      
      batchQuery += ` LIMIT ${batchSize} OFFSET ${offset}`;
      
      const batchBlocks = await db.all(batchQuery, keywordUids);
      if (batchBlocks.length === 0) break;

      // Optimized batch processing with early filtering
      const batchResults = [];
      for (const block of batchBlocks) {
        const embedding = JSON.parse(block.embedding);
        const score = cosineSimilarity(queryEmbedding, embedding);
        
        // Early filtering - only keep results above a minimum threshold
        if (score > 0.3 || batchResults.length < 10) { // Always keep top 10 per batch
          batchResults.push({
            uid: block.uid,
            text: block.text,
            sermon_uid: block.sermon_uid,
            section_uid: block.section_uid,
            paragraph_uid: block.paragraph_uid,
            sermon_title: block.sermon_title,
            sermon_date: block.sermon_date,
            section_number: block.section_number,
            score: score,
            type: 'semantic'
          });
        }
      }

      // Sort and keep only best results from this batch
      batchResults.sort((a, b) => b.score - a.score);
      const topBatchResults = batchResults.slice(0, 20); // Keep top 20 from each batch
      
      // Merge with global top results
      topSemanticResults = [...topSemanticResults, ...topBatchResults];
      topSemanticResults.sort((a, b) => b.score - a.score);
      topSemanticResults = topSemanticResults.slice(0, targetResults); // Keep only top N globally

      processedCount += batchBlocks.length;
      
      // Update early termination threshold
      if (topSemanticResults.length >= 10) {
        earlyTerminationScore = Math.max(earlyTerminationScore, topSemanticResults[9].score * 0.8);
      }
      
      const batchTime = Date.now() - batchStartTime;
      const progress = Math.min(100, ((batchNumber / maxBatches) * 100)).toFixed(1);
      const topScore = topBatchResults.length > 0 ? topBatchResults[0].score : 0;
      
      // Send batch update
      sendSSEData(res, {
        type: 'batch_results',
        batchNumber,
        count: batchBlocks.length,
        time: batchTime,
        progress: parseFloat(progress),
        topScore: (topScore * 100).toFixed(1)
      });

      // Send intermediate results more frequently
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
          progress: parseFloat(progress)
        });
      }

      // Early termination if we have enough good results and processed significant portion
      if (batchNumber >= 5 && topSemanticResults.length >= targetResults && 
          topSemanticResults[targetResults-1].score > 0.5) {
        sendSSEData(res, { 
          type: 'status', 
          message: `🎯 Early termination: Found ${topSemanticResults.length} high-quality results` 
        });
        break;
      }

      // Adaptive termination based on diminishing returns
      if (batchNumber >= 3 && topBatchResults.length > 0 && 
          topBatchResults[0].score < earlyTerminationScore) {
        sendSSEData(res, { 
          type: 'status', 
          message: `⚡ Smart termination: Score threshold reached after ${batchNumber} batches` 
        });
        break;
      }
    }

    // Final results - Fix the combination logic
    console.log('Before final results combination:', {
      keywordResultsLength: keywordResults.length,
      topSemanticResultsLength: topSemanticResults.length,
      sampleKeyword: keywordResults[0] ? keywordResults[0].type : 'none',
      sampleSemantic: topSemanticResults[0] ? topSemanticResults[0].type : 'none'
    });

    // Combine results but maintain separation
    const finalResults = [];
    
    // Add keyword results first (they get priority in display)
    finalResults.push(...keywordResults);
    
    // Add semantic results
    finalResults.push(...topSemanticResults);
    
    // Debug logging
    console.log('Final results before sorting:', {
      totalFinal: finalResults.length,
      keywordCount: finalResults.filter(r => r.type === 'keyword').length,
      semanticCount: finalResults.filter(r => r.type === 'semantic').length,
      topSemanticScores: topSemanticResults.slice(0, 5).map(r => r.score),
      sampleTypes: finalResults.slice(0, 25).map(r => ({ type: r.type, score: r.score }))
    });
    
    // Sort: keywords first, then by score within each type
    finalResults.sort((a, b) => {
      if (a.type === 'keyword' && b.type === 'semantic') return -1;
      if (a.type === 'semantic' && b.type === 'keyword') return 1;
      return b.score - a.score;
    });

    const endTime = Date.now();
    const keywordCount = finalResults.filter(r => r.type === 'keyword').length;
    const semanticCount = finalResults.filter(r => r.type === 'semantic').length;

    // Debug logging
    console.log('Final results after processing:', {
      totalResults: finalResults.length,
      keywordCount,
      semanticCount,
      topResults: finalResults.slice(0, 25).map(r => ({ type: r.type, score: r.score }))
    });

    // Send more results to see the semantic ones
    const resultsToSend = Math.min(50, finalResults.length);
    
    sendSSEData(res, {
      type: 'final_results',
      results: finalResults.slice(0, resultsToSend),
      stats: {
        total: finalResults.length,
        keyword: keywordCount,
        semantic: semanticCount,
        time: endTime - startTime,
        processed: processedCount,
        coverage: ((processedCount / totalCount.count) * 100).toFixed(1)
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
