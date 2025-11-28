// test-fts5-search.js
const Database = require('better-sqlite3');
const path = require('path');

class FTS5SearchTester {
  constructor(dbPath = './sermons.db') {
    this.db = new Database(dbPath, { readonly: true });
    console.log(`Connected to database: ${dbPath}\n`);
  }

  /**
   * Test basic FTS5 search
   */
  basicSearch(searchTerm) {
    console.log(`\n=== Basic FTS5 Search for: "${searchTerm}" ===`);
    
    const query = `
      SELECT b.uid, b.text, b.sermon_uid, b.paragraph_uid
      FROM blocks_fts fts
      JOIN blocks b ON b.rowid = fts.rowid
      WHERE fts MATCH ?
    `;
    
    // Use ^ prefix to match complete tokens only
    const results = this.db.prepare(query).all(`^${searchTerm}`);
    
    // Count unique paragraphs
    const uniqueParagraphs = new Set(results.map(r => r.paragraph_uid)).size;
    
    console.log(`Found ${results.length} results from ${uniqueParagraphs} unique paragraph(s).`);
    
    return results;
  }

  /**
   * Test FTS5 search with BM25 ranking
   */
  rankedSearch(searchTerm) {
    console.log(`\n=== Ranked Search (BM25) for: "${searchTerm}" ===`);
    
    const query = `
      SELECT uid, text, sermon_uid, bm25(blocks_fts) as rank
      FROM blocks_fts
      WHERE blocks_fts MATCH ?
      ORDER BY rank
    `;
    
    const results = this.db.prepare(query).all(searchTerm);
    this.displayResults(results, true);
    return results;
  }

  /**
   * Test phrase search
   */
  phraseSearch(phrase) {
    console.log(`\n=== Phrase Search for: "${phrase}" ===`);
    
    // FTS5 phrase queries use quotes
    const searchTerm = `"${phrase}"`;
    
    const query = `
      SELECT uid, text, sermon_uid, bm25(blocks_fts) as rank
      FROM blocks_fts
      WHERE blocks_fts MATCH ?
      ORDER BY rank
      LIMIT 10
    `;
    
    const results = this.db.prepare(query).all(searchTerm);
    this.displayResults(results, true);
    return results;
  }

  /**
   * Test boolean search (AND, OR, NOT)
   */
  booleanSearch(searchTerm) {
    console.log(`\n=== Boolean Search for: "${searchTerm}" ===`);
    console.log('(Use AND, OR, NOT operators)');
    
    const query = `
      SELECT uid, text, sermon_uid, bm25(blocks_fts) as rank
      FROM blocks_fts
      WHERE blocks_fts MATCH ?
      ORDER BY rank
      LIMIT 10
    `;
    
    const results = this.db.prepare(query).all(searchTerm);
    this.displayResults(results, true);
    return results;
  }

  /**
   * Test prefix search (for autocomplete)
   */
  prefixSearch(prefix) {
    console.log(`\n=== Prefix Search for: "${prefix}*" ===`);
    
    const searchTerm = `${prefix}*`;
    
    const query = `
      SELECT uid, text, sermon_uid, bm25(blocks_fts) as rank
      FROM blocks_fts
      WHERE blocks_fts MATCH ?
      ORDER BY rank
      LIMIT 10
    `;
    
    const results = this.db.prepare(query).all(searchTerm);
    this.displayResults(results, true);
    return results;
  }

  /**
   * Test column-specific search
   */
  columnSearch(searchTerm, column = 'text') {
    console.log(`\n=== Column-Specific Search (${column}) for: "${searchTerm}" ===`);
    
    const columnSearchTerm = `${column}:${searchTerm}`;
    
    const query = `
      SELECT uid, text, sermon_uid, bm25(blocks_fts) as rank
      FROM blocks_fts
      WHERE blocks_fts MATCH ?
      ORDER BY rank
      LIMIT 10
    `;
    
    const results = this.db.prepare(query).all(columnSearchTerm);
    this.displayResults(results, true);
    return results;
  }

  /**
   * Test search with highlighted snippets
   */
  snippetSearch(searchTerm) {
    console.log(`\n=== Snippet Search with Highlighting for: "${searchTerm}" ===`);
    
    const query = `
      SELECT 
        uid,
        snippet(blocks_fts, 1, '<b>', '</b>', '...', 32) as snippet,
        sermon_uid,
        bm25(blocks_fts) as rank
      FROM blocks_fts
      WHERE blocks_fts MATCH ?
      ORDER BY rank
      LIMIT 10
    `;
    
    const results = this.db.prepare(query).all(searchTerm);
    
    results.forEach((row, idx) => {
      console.log(`\n${idx + 1}. UID: ${row.uid}`);
      console.log(`   Sermon: ${row.sermon_uid}`);
      console.log(`   Rank: ${row.rank?.toFixed(4)}`);
      console.log(`   Snippet: ${row.snippet}`);
    });
    
    return results;
  }

  /**
   * Search within specific sermon
   */
  searchInSermon(searchTerm, sermonUid) {
    console.log(`\n=== Search in Sermon "${sermonUid}" for: "${searchTerm}" ===`);
    
    const query = `
      SELECT 
        uid,
        text,
        sermon_uid,
        bm25(blocks_fts) as rank
      FROM blocks_fts
      WHERE blocks_fts MATCH ? AND sermon_uid = ?
      ORDER BY rank
      LIMIT 10
    `;
    
    const results = this.db.prepare(query).all(searchTerm, sermonUid);
    this.displayResults(results, true);
    return results;
  }

  /**
   * Get search statistics
   */
  getStats() {
    console.log('\n=== FTS5 Index Statistics ===\n');
    
    const totalBlocks = this.db.prepare('SELECT COUNT(*) as count FROM blocks').get();
    console.log(`Total blocks in database: ${totalBlocks.count}`);
    
    const ftsBlocks = this.db.prepare('SELECT COUNT(*) as count FROM blocks_fts').get();
    console.log(`Total blocks in FTS index: ${ftsBlocks.count}`);
    
    // Get sample of indexed data
    const sample = this.db.prepare('SELECT uid, text FROM blocks_fts LIMIT 3').all();
    console.log('\nSample indexed blocks:');
    sample.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.uid}: ${row.text.substring(0, 100)}...`);
    });
  }

  /**
   * Display search results
   */
  displayResults(results, showRank = false) {
    if (results.length === 0) {
      console.log('No results found.');
      return;
    }
    
    console.log(`\nFound ${results.length} results:\n`);
    
    results.forEach((row, idx) => {
      console.log(`${idx + 1}. UID: ${row.uid}`);
      console.log(`   Sermon: ${row.sermon_uid}`);
      if (showRank && row.rank !== undefined) {
        console.log(`   Rank: ${row.rank.toFixed(4)}`);
      }
      console.log(`   Text: ${row.text.substring(0, 150)}${row.text.length > 150 ? '...' : ''}`);
      console.log('');
    });
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
    console.log('\nDatabase connection closed.');
  }
}

// Example usage
function runTests() {
  const tester = new FTS5SearchTester('./sermons.db');
  
  try {
    // Show database stats
    // tester.getStats();
    
    // Test different search types
    tester.basicSearch('she');
    // tester.rankedSearch('faith');
    // tester.phraseSearch('faith hope');
    // tester.booleanSearch('faith AND hope');
    // tester.booleanSearch('faith OR love');
    // tester.booleanSearch('faith NOT doubt');
    // tester.prefixSearch('believ');
    // tester.columnSearch('faith', 'text');
    // tester.snippetSearch('grace');
    
    // Example: Search within specific sermon (replace with actual sermon UID)
    // tester.searchInSermon('love', 'your-sermon-uid');
    
  } finally {
    tester.close();
  }
}

// Run if called directly
if (require.main === module) {
  runTests();
}

module.exports = { FTS5SearchTester };