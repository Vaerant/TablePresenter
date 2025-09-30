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
// New: dense vector config
const ZILLIZ_VECTOR_FIELD = process.env.ZILLIZ_VECTOR_FIELD || "embedding";
const ZILLIZ_METRIC_TYPE = (process.env.ZILLIZ_METRIC_TYPE || "COSINE").toUpperCase();
const ZILLIZ_SEARCH_PARAMS = process.env.ZILLIZ_SEARCH_PARAMS; // optional JSON string with index params (e.g., {"nprobe":10} for IVF or {"ef":128} for HNSW)

// Hybrid fusion config (for heavy similarity processing)
const HYBRID_ALPHA = Number(process.env.HYBRID_ALPHA ?? 0.95);    // weight for semantic similarity (0..1) - heavily favor semantic
const HYBRID_BETA = Number(process.env.HYBRID_BETA ?? 0.02);      // weight for RRF contribution - minimal
const HYBRID_RRF_K = Number(process.env.HYBRID_RRF_K ?? 60);      // RRF constant k
const HYBRID_SEM_TEMP = Number(process.env.HYBRID_SEM_TEMP ?? 5.0); // temperature for semantic softmax - very high to preserve differences

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
async function performSemanticSearch(queryEmbedding, keywordUids, limit = 100) {
  const fetch = global.fetch || (await import("node-fetch")).default;
  
  if (!ZILLIZ_API_KEY) {
    throw new Error("ZILLIZ_API_KEY env var is required for semantic search.");
  }

  // Build filter to exclude keyword results (Zilliz filter grammar)
  let filter = "";
  if (keywordUids.length > 0) {
    const uidList = keywordUids.map(uid => `"${uid}"`).join(",");
    filter = `block_uid not in [${uidList}]`;
  }

  // Parse optional index params from env (fall back to empty object)
  let indexParams = {};
  if (ZILLIZ_SEARCH_PARAMS) {
    try {
      indexParams = JSON.parse(ZILLIZ_SEARCH_PARAMS);
    } catch (e) {
      console.warn("Invalid ZILLIZ_SEARCH_PARAMS JSON:", e.message);
    }
  }

  // Payload per Zilliz dense vector search docs
  const searchPayload = {
    collectionName: ZILLIZ_COLLECTION_NAME,
    data: [queryEmbedding],
    limit,
    outputFields: ["id", "block_uid"],
    ...(filter ? { filter } : {}),
    searchParams: {
      annsField: ZILLIZ_VECTOR_FIELD,
      metricType: ZILLIZ_METRIC_TYPE,
      params: indexParams
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
      hits = Array.isArray(result.data[0]) ? result.data[0] : result.data;
    } else if (Array.isArray(result.data?.rows)) {
      hits = result.data.rows;
    } else if (Array.isArray(result.data?.entities)) {
      hits = result.data.entities;
    }
  }

  console.log(`Parsed hits (${ZILLIZ_METRIC_TYPE}):`, Array.isArray(hits) ? hits.length : 0, Array.isArray(hits) ? hits.slice(0, 3) : []);

  if (!Array.isArray(hits)) {
    console.error('Unexpected Zilliz response format:', result);
    return [];
  }

  // Metric-aware similarity conversion
  const toSimilarity = (metric, { score, distance }) => {
    const s = typeof score === 'number' ? score : undefined;
    const d = typeof distance === 'number' ? distance : undefined;
    switch (metric) {
      case 'COSINE':
        // Prefer distance if present; otherwise accept score as similarity
        if (d !== undefined) return Math.max(0, 1 - d);
        return s !== undefined ? s : 0;
      case 'IP':
        // Higher is better; score is similarity
        if (s !== undefined) return s;
        // Fallback if only distance present
        return d !== undefined ? Math.max(0, 1 - d) : 0;
      case 'L2':
      case 'EUCLIDEAN':
        // Lower distance is better; squash to (0,1]
        if (d !== undefined) return 1 / (1 + d);
        // Fallback if only score present
        return s !== undefined ? 1 / (1 + Math.max(0, s)) : 0;
      default:
        // Generic fallback
        if (d !== undefined) return Math.max(0, 1 - d);
        return s !== undefined ? s : 0;
    }
  };

  return hits.map(hit => {
    const similarity = toSimilarity(ZILLIZ_METRIC_TYPE, { score: hit.score, distance: hit.distance });
    return {
      block_uid: hit.block_uid ?? hit.entity?.block_uid ?? hit.fields?.block_uid,
      score: similarity,
      id: hit.id ?? hit.entity?.id ?? hit.fields?.id,
      distance: typeof hit.distance === 'number' ? hit.distance : (typeof hit.score === 'number' ? hit.score : undefined)
    };
  }).filter(h => h.block_uid);
}

// Helper: stable softmax normalization
function stableSoftmax(values, temperature = 1.0) {
  const t = Math.max(temperature, 1e-6);
  const scaled = values.map(v => v / t);
  const maxV = Math.max(...scaled);
  const exps = scaled.map(v => Math.exp(v - maxV));
  const denom = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map(e => e / denom);
}

// Hybrid fusion (WeightedSum + RRF), inspired by Zilliz hybrid-search docs
function fuseHybrid(keywordResults, semanticResults, {
  alpha = HYBRID_ALPHA,
  beta = HYBRID_BETA,
  rrfK = HYBRID_RRF_K,
  semTemp = HYBRID_SEM_TEMP
} = {}) {
  // Build maps
  const kwMap = new Map(keywordResults.map((r, i) => [r.uid, { r, rank: i + 1 }]));
  const semMap = new Map(semanticResults.map((r, i) => [r.uid, { r, rank: i + 1 }]));

  // Preserve semantic scores with minimal normalization
  const semScores = semanticResults.map(r => Math.max(0, r.score ?? 0));
  
  // Very gentle normalization - preserve the natural score distribution
  const maxSemScore = Math.max(...semScores, 0.1);
  const minSemScore = Math.min(...semScores, 0);
  const scoreRange = maxSemScore - minSemScore;
  
  let semNormalized;
  if (scoreRange > 0.05) {
    // Use raw scores with minimal scaling to preserve differences
    semNormalized = semScores.map(s => s / maxSemScore);
  } else {
    // If very little variation, use raw scores directly
    semNormalized = semScores;
  }
  
  // Skip softmax entirely to preserve score differences
  const semSoftMap = new Map(semanticResults.map((r, i) => [r.uid, semNormalized[i]]));

  // Simple keyword score handling
  const kwScores = keywordResults.map((r, i) => {
    if (typeof r.score === 'number' && r.score > 0) {
      return r.score;
    }
    return Math.exp(-i * 0.05);
  });
  
  // Normalize keyword scores
  const kwMin = Math.min(...kwScores, 0);
  const kwMax = Math.max(...kwScores, 1);
  const kwNorm = kwScores.map(s => (kwMax > kwMin ? (s - kwMin) / (kwMax - kwMin) : s));
  const kwNormMap = new Map(keywordResults.map((r, i) => [r.uid, kwNorm[i]]));

  // Union of doc ids
  const ids = new Set([...kwMap.keys(), ...semMap.keys()]);
  const fused = [];

  for (const id of ids) {
    const kw = kwMap.get(id);
    const sem = semMap.get(id);

    const kwRank = kw?.rank ?? null;
    const semRank = sem?.rank ?? null;
    const rrfScore =
      (kwRank ? 1 / (rrfK + kwRank) : 0) +
      (semRank ? 1 / (rrfK + semRank) : 0);

    const semScore = semSoftMap.get(id) ?? 0;
    const kwScore = kwNormMap.get(id) ?? 0;

    // Heavily weighted toward semantic with minimal RRF influence
    const fusedScore = alpha * semScore + (1 - alpha) * kwScore + beta * rrfScore;

    // Prefer full record from semantic, else keyword
    const base = (sem?.r) || (kw?.r);
    fused.push({
      ...base,
      type: 'hybrid',
      score: fusedScore,
      components: {
        semantic: semScore,
        keyword: kwScore,
        rrf: rrfScore,
        raw_semantic: sem?.r?.score ?? 0,
        raw_keyword: kw?.r?.score ?? 0,
        normalized_semantic_range: scoreRange,
        semantic_weight: alpha,
        ranks: { semantic: semRank ?? undefined, keyword: kwRank ?? undefined }
      }
    });
  }

  fused.sort((a, b) => b.score - a.score);
  return fused;
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

    // Step 2: Semantic search using Zilliz
    sendSSEData(res, { type: 'status', message: '🧠 Starting Zilliz semantic search...' });
    
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = response.data[0].embedding;

    // Get semantic results from Zilliz
    const keywordUids = limitedKeywordHits.map(h => h.uid);
    const semanticHits = await performSemanticSearch(queryEmbedding, keywordUids, 100);
    
    sendSSEData(res, { 
      type: 'status', 
      message: `🎯 Found ${semanticHits.length} semantic matches from Zilliz` 
    });

    // Debug logging for score analysis
    console.log('Zilliz semantic scores:', semanticHits.slice(0, 10).map(h => ({
      score: h.score.toFixed(4),
      distance: h.distance?.toFixed(4)
    })));

    // Fetch full block details from SQLite for semantic results
    let topSemanticResults = [];
    if (semanticHits.length > 0) {
      const blockUids = semanticHits.map(hit => `'${hit.block_uid}'`).join(',');
      const blockDetails = await db.all(`
        SELECT b.uid, b.text, b.sermon_uid, b.section_uid, b.paragraph_uid,
               s.title as sermon_title, s.date as sermon_date,
               sec.number as section_number
        FROM blocks b
        JOIN sermons s ON b.sermon_uid = s.uid
        LEFT JOIN sections sec ON b.section_uid = sec.uid
        WHERE b.uid IN (${blockUids})
      `);

      // Create a map for quick lookup
      const blockMap = new Map(blockDetails.map(block => [block.uid, block]));
      
      // Combine Zilliz scores with SQLite block details - remove artificial boosting
      topSemanticResults = semanticHits
        .map(hit => {
          const block = blockMap.get(hit.block_uid);
          if (!block) return null;
          return {
            ...block,
            score: hit.score, // Use actual score without boosting
            type: 'semantic',
            distance: hit.distance // Keep for debugging
          };
        })
        .filter(result => result !== null)
        .sort((a, b) => b.score - a.score);

      sendSSEData(res, { 
        type: 'status', 
        message: `✅ Retrieved ${topSemanticResults.length} complete semantic results` 
      });
    }

    // Heavy hybrid fusion (WeightedSum + RRF)
    sendSSEData(res, { type: 'status', message: '⚖️ Fusing keyword and semantic results (Hybrid: Weighted + RRF)...' });
    const hybridResults = fuseHybrid(keywordResults, topSemanticResults);

    // Debug logging for hybrid fusion - enhanced with more details
    console.log('Semantic score analysis:');
    console.log('  Raw range:', topSemanticResults.length > 0 ? 
      `${Math.min(...topSemanticResults.map(r => r.score)).toFixed(4)} - ${Math.max(...topSemanticResults.map(r => r.score)).toFixed(4)}` : 'N/A');
    console.log('  Fusion weights: α=' + HYBRID_ALPHA + ', β=' + HYBRID_BETA);
    
    console.log('Hybrid top results:', hybridResults.slice(0, 10).map(r => ({
      uid: r.uid,
      score: r.score.toFixed(4),
      comp: {
        s: r.components.semantic.toFixed(4),
        k: r.components.keyword.toFixed(4),
        rrf: r.components.rrf.toFixed(4),
        rawSem: r.components.raw_semantic?.toFixed(4) ?? '0.0000',
        rawKw: r.components.raw_keyword?.toFixed(4) ?? '0.0000',
        semRange: r.components.normalized_semantic_range?.toFixed(4) ?? '0.0000',
        α: r.components.semantic_weight?.toFixed(2) ?? '0.00'
      }
    })));

    const endTime = Date.now();
    const keywordCount = hybridResults.filter(r => (r.components?.keyword ?? 0) > 0).length;
    const semanticCount = hybridResults.filter(r => (r.components?.semantic ?? 0) > 0).length;

    // Send results
    const resultsToSend = Math.min(50, hybridResults.length);
    sendSSEData(res, {
      type: 'final_results',
      results: hybridResults.slice(0, resultsToSend),
      stats: {
        total: hybridResults.length,
        keyword: keywordCount,
        semantic: semanticCount,
        time: endTime - startTime,
        processed: semanticHits.length,
        fusion: {
          alpha: HYBRID_ALPHA,
          beta: HYBRID_BETA,
          rrfK: HYBRID_RRF_K,
          semTemp: HYBRID_SEM_TEMP
        },
        coverage: "Hybrid (keyword + dense vector)"
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