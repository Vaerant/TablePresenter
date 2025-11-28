const Database = require('better-sqlite3');
const db = new Database('./sermons.db');

/**
 * General search function for FTS5
 * @param {string} query - The search query
 * @param {number} [limit=20] - The maximum number of results to return. Use -1 for unlimited results.
 * @param {string} [sermonUid] - Optional sermon UID to filter results to a specific sermon
 * @returns {Array} - Array of search results
 */
function searchSermons(query, limit = 20, sermonUid = null) {
  let search;
  
  if (limit === -1) {
    if (sermonUid) {
      search = db.prepare(`
        SELECT 
          b.*,
          bm25(blocks_fts) as rank
        FROM blocks_fts
        JOIN blocks b ON b.rowid = blocks_fts.rowid
        WHERE blocks_fts MATCH ? AND b.sermon_uid = ?
        ORDER BY rank
      `);
      return search.all(query, sermonUid);
    } else {
      search = db.prepare(`
        SELECT 
          b.*,
          bm25(blocks_fts) as rank
        FROM blocks_fts
        JOIN blocks b ON b.rowid = blocks_fts.rowid
        WHERE blocks_fts MATCH ?
        ORDER BY rank
      `);
      return search.all(query);
    }
  } else {
    if (sermonUid) {
      search = db.prepare(`
        SELECT 
          b.*,
          bm25(blocks_fts) as rank
        FROM blocks_fts
        JOIN blocks b ON b.rowid = blocks_fts.rowid
        WHERE blocks_fts MATCH ? AND b.sermon_uid = ?
        ORDER BY rank
        LIMIT ?
      `);
      return search.all(query, sermonUid, limit);
    } else {
      search = db.prepare(`
        SELECT 
          b.*,
          bm25(blocks_fts) as rank
        FROM blocks_fts
        JOIN blocks b ON b.rowid = blocks_fts.rowid
        WHERE blocks_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
      return search.all(query, limit);
    }
  }
}

/**
 * Exact word match function with wildcard support
 * Searches for all words (in any order) or uses wildcards
 * @param {string} word - The word(s) to search for. Supports wildcards (e.g., 'adopt*') and multiple words (e.g., 'She is Him')
 * @param {number} [limit=20] - The maximum number of results to return. Use -1 for unlimited results.
 * @param {string} [sermonUid] - Optional sermon UID to filter results to a specific sermon
 * @returns {Array} - Array of search results
 */
function searchExactWord(word, limit = 20, sermonUid = null) {
  // If it contains a wildcard, use it as-is
  // Otherwise, split by spaces and join with quotes for exact word matches
  let query;
  if (word.includes('*')) {
    query = word;
  } else {
    // Split into individual words and wrap each in quotes for exact word matching
    const words = word.trim().split(/\s+/);
    query = words.map(w => `"${w}"`).join(' ');
  }
  return searchSermons(query, limit, sermonUid);
}

/**
 * Exact phrase match function
 * @param {string} phrase - The exact phrase to search for (words must be consecutive)
 * @param {number} [limit=20] - The maximum number of results to return. Use -1 for unlimited results.
 * @param {string} [sermonUid] - Optional sermon UID to filter results to a specific sermon
 * @returns {Array} - Array of search results
 */
function searchExactPhrase(phrase, limit = 20, sermonUid = null) {
  return searchSermons(`"${phrase}"`, limit, sermonUid);
}

/**
 * Close the database connection
 */
function closeDatabase() {
  db.close();
}

console.log('Exact Word Search (words in any order):');
searchExactWord('She is Him', 10).forEach(result => {
  console.log(`[Rank: ${result.rank.toFixed(2)}] ${result.text.substring(0, 100)}...`);
});

console.log('\n---\n');

console.log('Exact Phrase Search (consecutive words):');
searchExactPhrase('have faith', 10).forEach(result => {
  console.log(`[Rank: ${result.rank.toFixed(2)}] ${result.text.substring(0, 100)}...`);
});

console.log('\n---\n');

console.log('Exact Phrase Search (She is Him):');
searchExactPhrase('She is Him', 10).forEach(result => {
  console.log(`[Rank: ${result.rank.toFixed(2)}] ${result.text.substring(0, 100)}...`);
});

console.log('\n---\n');

const infiniteResults = searchExactWord('faith', -1);
console.log(`Total results for 'faith': ${infiniteResults.length}`);

console.log('\n---\n');

const infiniteResults2 = searchExactWord('cow on top tree', -1);
console.log(`Total results for 'cow on top tree': ${infiniteResults2.length}`);

module.exports = {
  searchSermons,
  searchExactWord,
  searchExactPhrase,
  closeDatabase
};