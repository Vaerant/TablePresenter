const Database = require('better-sqlite3');
const db = new Database('./sermons.db');

// Search function
function searchSermons(query, limit = 20) {
  const search = db.prepare(`
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

// Helper to display results
function showResults(title, results) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(title);
  console.log(`${'='.repeat(60)}`);
  console.log(`Found ${results.length} results:\n`);
  
  results.slice(0, 5).forEach((result, i) => {
    console.log(`${i + 1}. [Rank: ${result.rank.toFixed(2)}]`);
    console.log(`   ${result.text.substring(0, 100)}...`);
  });
}

// 1. EXACT WORD MATCH - Use quotes for exact words only
console.log('\n1. EXACT WORD: "she" (not substrings)');
let results = searchSermons('"she"', 10);
showResults('Exact word "she"', results);

// 2. PREFIX WILDCARD - Use * at the end
console.log('\n2. PREFIX WILDCARD: adopt*');
results = searchSermons('adopt*', 10);
showResults('Words starting with "adopt"', results);

// 3. MULTIPLE WILDCARDS
console.log('\n3. MULTIPLE TERMS WITH WILDCARDS: faith* hope*');
results = searchSermons('faith* hope*', 10);
showResults('faith* AND hope*', results);

// 4. PHRASE SEARCH - Exact phrase in quotes
console.log('\n4. EXACT PHRASE: "have faith"');
results = searchSermons('"have faith"', 10);
showResults('Exact phrase "have faith"', results);

// 5. OR SEARCH - Use OR between terms
console.log('\n5. OR SEARCH: faith OR hope');
results = searchSermons('faith OR hope', 10);
showResults('faith OR hope', results);

// 6. AND SEARCH - Default behavior or explicit AND
console.log('\n6. AND SEARCH: faith AND hope');
results = searchSermons('faith AND hope', 10);
showResults('faith AND hope', results);

// 7. NOT SEARCH - Use NOT with parentheses
console.log('\n7. NOT SEARCH: faith NOT hope');
results = searchSermons('faith NOT hope', 10);
showResults('faith but NOT hope', results);

// 8. NEAR OPERATOR - Words within N words of each other
console.log('\n8. NEAR OPERATOR: NEAR(faith hope, 5)');
results = searchSermons('NEAR(faith hope, 5)', 10);
showResults('faith and hope within 5 words', results);

// 9. COMPLEX QUERY - Combine operators
console.log('\n9. COMPLEX: (believe* OR "have faith") NOT doubt');
results = searchSermons('(believe* OR "have faith") NOT doubt', 10);
showResults('Complex query', results);

// 10. PARENTHESES FOR GROUPING
console.log('\n10. GROUPING: (faith OR hope) AND love');
results = searchSermons('(faith OR hope) AND love', 10);
showResults('(faith OR hope) AND love', results);

// 11. Alternative NOT using column prefix
console.log('\n11. EXCLUDE MULTIPLE: faith NOT (hope OR doubt)');
results = searchSermons('faith NOT (hope OR doubt)', 10);
showResults('faith excluding hope and doubt', results);

console.log('\n\n' + '='.repeat(60));
console.log('SEARCH SYNTAX SUMMARY');
console.log('='.repeat(60));
console.log(`
Exact word:           "she"
Prefix wildcard:      adopt*
Exact phrase:         "have faith"
OR search:            faith OR hope
AND search:           faith AND hope (or just: faith hope)
NOT search:           faith NOT hope
Column search:        {text}: faith
NEAR search:          NEAR(faith hope, 5)
Grouping:             (faith OR hope) AND love
Complex NOT:          faith NOT (hope OR doubt)
Complex:              ("exact phrase" OR wild*) NOT exclude

NOTES:
- FTS5 doesn't support suffix wildcards like *tion
- Wildcards only work as prefix: word*
- Quotes make searches exact (no stemming/partial matches)
- Default is AND between terms (faith hope = faith AND hope)
- Use "NOT" keyword for exclusion
- Column search uses {columnName}: syntax
- Case-insensitive by default
- Use parentheses () for grouping operations
`);

db.close();