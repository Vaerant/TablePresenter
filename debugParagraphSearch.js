// debugParagraphSearch.js
const Database = require('better-sqlite3');
const db = new Database('./sermons.db');

console.log('=== Debugging Paragraph Search ===\n');

// Test 1: Direct FTS query
console.log('Test 1: Direct FTS query');
const directResults = db.prepare(`
  SELECT COUNT(*) as count
  FROM paragraphs_fts
  WHERE paragraphs_fts MATCH 'faith'
`).get();
console.log(`Results: ${directResults.count}\n`);

// Test 2: Check FTS table structure
console.log('Test 2: Sample FTS entries (first 3)');
const ftsEntries = db.prepare(`
  SELECT *
  FROM paragraphs_fts
  WHERE paragraphs_fts MATCH 'faith'
  LIMIT 3
`).all();
console.log('FTS entries:', ftsEntries);
console.log();

// Test 3: Check paragraphs_text
console.log('Test 3: Sample paragraphs_text entries (first 3)');
const textEntries = db.prepare(`
  SELECT uid, section_uid, sermon_uid, LENGTH(text) as text_len, SUBSTR(text, 1, 50) as preview
  FROM paragraphs_text
  LIMIT 3
`).all();
console.log('Text entries:', textEntries);
console.log();

// Test 4: Try to find matching UIDs
console.log('Test 4: Check if UIDs match');
const firstFtsUid = ftsEntries.length > 0 ? ftsEntries[0].uid : null;
if (firstFtsUid) {
  console.log(`Looking for uid: ${firstFtsUid}`);
  const textMatch = db.prepare(`
    SELECT uid, SUBSTR(text, 1, 50) as preview
    FROM paragraphs_text
    WHERE uid = ?
  `).get(firstFtsUid);
  console.log('Match in paragraphs_text:', textMatch);
}
console.log();

// Test 5: Try simplified join
console.log('Test 5: Simplified join attempt');
const joinTest = db.prepare(`
  SELECT 
    paragraphs_fts.uid,
    pt.uid as text_uid
  FROM paragraphs_fts
  LEFT JOIN paragraphs_text pt ON pt.uid = paragraphs_fts.uid
  WHERE paragraphs_fts MATCH 'faith'
  LIMIT 5
`).all();
console.log('Join results:', joinTest);

db.close();