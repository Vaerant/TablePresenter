// paragraphSearchModule.js
const Database = require('better-sqlite3');
const db = new Database('./sermons.db');
const OpenAI = require('openai');
const axios = require('axios'); // Added
require('dotenv').config();

async function createQueryEmbedding(query, model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small') {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY env var is required for embeddings.');
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const resp = await openai.embeddings.create({
    model,
    input: query,
  });

  const embedding = resp?.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('No embedding returned from OpenAI.');
  }
  return embedding;
}

/**
 * Perform vector similarity search against Zilliz using axios (Node-friendly)
 * @param {number[]} queryEmbedding - The embedding array
 * @param {number} [limit=500] - Max results
 * @param {string} [sermonUid] - Optional sermon UID to filter results to a specific sermon
 * @returns {Promise<Array<{block_uid:string,id:string|number,distance:number}>>}
 */
async function performSimilaritySearch(queryEmbedding, limit = 500) {
  const { ZILLIZ_API_KEY, ZILLIZ_COLLECTION_NAME, ZILLIZ_METRIC_TYPE, ZILLIZ_URL } = process.env;
  if (!ZILLIZ_API_KEY) throw new Error('ZILLIZ_API_KEY env var is required for similarity search.');

  const payload = {
    collectionName: ZILLIZ_COLLECTION_NAME || 'sermon_blocks',
    vector: queryEmbedding,                  // single vector
    limit,
    outputFields: ['id', 'block_uid'],
    data: [queryEmbedding],          // 2D array for multiple vectors
    searchParams: {
      metricType: ZILLIZ_METRIC_TYPE || 'COSINE',
      params: { nprobe: 64, ef: Math.min(limit * 2, 2000) }
    }
  };

  let response;
  try {
    response = await axios.post(`${ZILLIZ_URL}/v2/vectordb/entities/search`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ZILLIZ_API_KEY}`
      },
      timeout: 30000,
      validateStatus: () => true
    });
  } catch (err) {
    if (err.code === 'ECONNABORTED') throw new Error('Zilliz similarity search request timed out.');
    throw new Error(`Network error contacting Zilliz: ${err.message}`);
  }

  if (response.status < 200 || response.status >= 300) {
    const snippet = typeof response.data === 'object' ? JSON.stringify(response.data).slice(0, 400) : String(response.data).slice(0, 400);
    throw new Error(`Zilliz HTTP ${response.status}: ${response.statusText}. Body: ${snippet}`);
  }

  const result = response.data;
  if (result?.code && result.code !== 0) {
    throw new Error(`Zilliz API error (${result.code}): ${result.message || 'Unknown error'}`);
  }
  const hits = result?.data;
  if (!Array.isArray(hits)) return [];

  return hits.map(hit => ({
    block_uid: hit.block_uid,
    id: hit.id,
    distance: hit.distance
  }));
}

/**
 * Convenience wrapper: embed query then perform similarity search
 * @param {string} query
 * @param {number} [limit=20]
 * @param {string} [sermonUid] - Optional sermon UID to filter results to a specific sermon
 * @returns {Promise<Array>}
 */
async function searchSimilar(query, limit = 20, sermonUid = null) {
  const embedding = await createQueryEmbedding(query);
  return performSimilaritySearch(embedding, limit, sermonUid);
}

/**
 * Search paragraphs using FTS5
 * @param {string} query - The search query
 * @param {number} [limit=20] - The maximum number of results to return. Use -1 for unlimited results.
 * @param {string} [sermonUid] - Optional sermon UID to filter results to a specific sermon
 * @returns {Array} - Array of search results with paragraph data
 */
function searchParagraphs(query, limit = 20, sermonUid = null) {
  let search;
  
  if (limit === -1) {
    if (sermonUid) {
      search = db.prepare(`
        SELECT 
          pt.uid,
          pt.section_uid,
          pt.sermon_uid,
          pt.text as paragraph_text,
          bm25(paragraphs_fts) as rank,
          s.number as section_number,
          ser.title as sermon_title,
          ser.date as sermon_date,
          ser.uid as sermon_uid
        FROM paragraphs_fts
        JOIN paragraphs_text pt ON pt.rowid = paragraphs_fts.rowid
        JOIN sections s ON s.uid = pt.section_uid
        JOIN sermons ser ON ser.uid = pt.sermon_uid
        WHERE paragraphs_fts MATCH ? AND pt.sermon_uid = ?
        ORDER BY rank
      `);
      return search.all(query, sermonUid);
    } else {
      search = db.prepare(`
        SELECT 
          pt.uid,
          pt.section_uid,
          pt.sermon_uid,
          pt.text as paragraph_text,
          bm25(paragraphs_fts) as rank,
          s.number as section_number,
          ser.title as sermon_title,
          ser.date as sermon_date
        FROM paragraphs_fts
        JOIN paragraphs_text pt ON pt.rowid = paragraphs_fts.rowid
        JOIN sections s ON s.uid = pt.section_uid
        JOIN sermons ser ON ser.uid = pt.sermon_uid
        WHERE paragraphs_fts MATCH ?
        ORDER BY rank
      `);
      return search.all(query);
    }
  } else {
    if (sermonUid) {
      search = db.prepare(`
        SELECT 
          pt.uid,
          pt.section_uid,
          pt.sermon_uid,
          pt.text as paragraph_text,
          bm25(paragraphs_fts) as rank,
          s.number as section_number,
          ser.title as sermon_title,
          ser.date as sermon_date
        FROM paragraphs_fts
        JOIN paragraphs_text pt ON pt.rowid = paragraphs_fts.rowid
        JOIN sections s ON s.uid = pt.section_uid
        JOIN sermons ser ON ser.uid = pt.sermon_uid
        WHERE paragraphs_fts MATCH ? AND pt.sermon_uid = ?
        ORDER BY rank
        LIMIT ?
      `);
      return search.all(query, sermonUid, limit);
    } else {
      search = db.prepare(`
        SELECT 
          pt.uid,
          pt.section_uid,
          pt.sermon_uid,
          pt.text as paragraph_text,
          bm25(paragraphs_fts) as rank,
          s.number as section_number,
          ser.title as sermon_title,
          ser.date as sermon_date
        FROM paragraphs_fts
        JOIN paragraphs_text pt ON pt.rowid = paragraphs_fts.rowid
        JOIN sections s ON s.uid = pt.section_uid
        JOIN sermons ser ON ser.uid = pt.sermon_uid
        WHERE paragraphs_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
      return search.all(query, limit);
    }
  }
}

/**
 * Search paragraphs with exact word match
 * @param {string} word - The word(s) to search for
 * @param {number} [limit=20] - The maximum number of results to return
 * @param {string} [sermonUid] - Optional sermon UID to filter results to a specific sermon
 * @returns {Array} - Array of search results
 */
function searchParagraphsExactWord(word, limit = 20, sermonUid = null) {
  let query;
  if (word.includes('*')) {
    query = word;
  } else {
    const words = word.trim().split(/\s+/);
    query = words.map(w => `"${w}"`).join(' ');
  }
  return searchParagraphs(query, limit, sermonUid);
}

/**
 * Search paragraphs with exact phrase match
 * @param {string} phrase - The exact phrase to search for
 * @param {number} [limit=20] - The maximum number of results to return
 * @param {string} [sermonUid] - Optional sermon UID to filter results to a specific sermon
 * @returns {Array} - Array of search results
 */
function searchParagraphsExactPhrase(phrase, limit = 20, sermonUid = null) {
  return searchParagraphs(`"${phrase}"`, limit, sermonUid);
}

/**
 * Get all blocks for a specific paragraph (for detailed view)
 * @param {string} paragraphUid - The paragraph UID
 * @returns {Array} - Array of blocks in the paragraph
 */
function getParagraphBlocks(paragraphUid) {
  const query = db.prepare(`
    SELECT *
    FROM blocks
    WHERE paragraph_uid = ?
    ORDER BY order_index
  `);
  return query.all(paragraphUid);
}

/**
 * Get block details by block UID
 * @param {string} blockUid - The block UID
 * @returns {Object|null} - Block data with sermon and section info
 */
function getBlockByUid(blockUid) {
  const query = db.prepare(`
    SELECT 
      b.*,
      s.number as section_number,
      ser.title as sermon_title,
      ser.date as sermon_date
    FROM blocks b
    JOIN sections s ON s.uid = b.section_uid
    JOIN sermons ser ON ser.uid = b.sermon_uid
    WHERE b.uid = ?
  `);
  return query.get(blockUid);
}

/**
 * Get multiple blocks by their UIDs
 * @param {Array<string>} blockUids - Array of block UIDs
 * @returns {Array} - Array of block data
 */
function getBlocksByUids(blockUids) {
  if (!blockUids || blockUids.length === 0) return [];
  
  const placeholders = blockUids.map(() => '?').join(',');
  const query = db.prepare(`
    SELECT 
      b.*,
      s.number as section_number,
      ser.title as sermon_title,
      ser.date as sermon_date
    FROM blocks b
    JOIN sections s ON s.uid = b.section_uid
    JOIN sermons ser ON ser.uid = b.sermon_uid
    WHERE b.uid IN (${placeholders})
  `);
  return query.all(...blockUids);
}

/**
 * Enhanced similarity search that returns full block details
 * @param {string} query
 * @param {number} [limit=20]
 * @param {string} [sermonUid] - Optional sermon UID to filter results to a specific sermon
 * @returns {Promise<Array>}
 */
async function searchSimilarWithDetails(query, limit = 20, sermonUid = null) {
  const similarBlocks = await searchSimilar(query, limit, sermonUid);
  const blockUids = similarBlocks.map(block => block.block_uid);
  const blockDetails = getBlocksByUids(blockUids);
  
  // Merge similarity scores with block details
  return similarBlocks.map(simBlock => {
    const blockDetail = blockDetails.find(detail => detail.uid === simBlock.block_uid);
    return {
      ...simBlock,
      ...blockDetail
    };
  });
}

/**
 * Close the database connection
 */
function closeDatabase() {
  db.close();
}

// Example usage
if (require.main === module) {
  // console.log('=== Paragraph-Level Search Examples ===\n');

  // console.log('1. Exact Word Search (words in any order):');
  // searchParagraphsExactWord('faith hope', 5).forEach(result => {
  //   console.log(`[Rank: ${result.rank.toFixed(2)}] ${result.sermon_title} - Section ${result.section_number}`);
  //   console.log(`   ${result.paragraph_text.substring(0, 150)}...`);
  //   console.log();
  // });

  // console.log('\n---\n');

  // console.log('2. Exact Phrase Search:');
  // searchParagraphsExactPhrase('have faith', 5).forEach(result => {
  //   console.log(`[Rank: ${result.rank.toFixed(2)}] ${result.sermon_title} - Section ${result.section_number}`);
  //   console.log(`   ${result.paragraph_text.substring(0, 150)}...`);
  //   console.log();
  // });

  // console.log('\n---\n');

  // console.log('3. Wildcard Search:');
  // searchParagraphs('adopt*', 5).forEach(result => {
  //   console.log(`[Rank: ${result.rank.toFixed(2)}] ${result.sermon_title} - Section ${result.section_number}`);
  //   console.log(`   ${result.paragraph_text.substring(0, 150)}...`);
  //   console.log();
  // });

  // console.log('\n---\n');

  // const totalResults = searchParagraphsExactWord('cow on top tree', -1);
  // console.log(`Total paragraphs containing 'cow on top tree': ${totalResults.length}\n`);
  // totalResults.forEach(r => {
  //   console.log(`[Rank: ${r.rank.toFixed(2)}] ${r.sermon_title} (${r.sermon_date})`);
  //   console.log(`Section ${r.section_number}`);
  //   console.log(`${r.paragraph_text}`);
  //   console.log();
  // });

  // console.log('\n---\n');

  // searchSimilarWithDetails('cuff links with red blood lines through', 20).then(similarBlocks => {
  searchSimilarWithDetails('man plays brass instrument', 20).then(similarBlocks => {
    console.log('4. Similarity Search Results for "faith and hope" with full details:');
    similarBlocks.forEach((block, index) => {
      console.log(`\n${index + 1}. [Distance: ${block.distance.toFixed(4)}]`);
      console.log(`   Sermon: ${block.sermon_title} (${block.sermon_date}) (${block.sermon_uid})`);
      console.log(`   Section: ${block.section_number}`);
      console.log(`   Block UID: ${block.block_uid}`);
      console.log(`   Text: ${block.text}`);
    });
    closeDatabase();
  }).catch(err => {
    console.error('Error:', err.message);
    closeDatabase();
  });
}

module.exports = {
  searchParagraphs,
  searchParagraphsExactWord,
  searchParagraphsExactPhrase,
  getParagraphBlocks,
  getBlockByUid,
  getBlocksByUids,
  searchSimilar,
  searchSimilarWithDetails,
  closeDatabase
};