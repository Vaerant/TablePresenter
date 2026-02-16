// populateParagraphSearch.js
const Database = require('better-sqlite3');
const db = new Database('./sermons.db');

console.log('Populating paragraph search tables...\n');

try {
  // Start transaction for better performance
  db.exec('BEGIN TRANSACTION');

  // Clear existing data
  console.log('Clearing existing paragraph search data...');
  
  // For contentless FTS5 tables, we need to use 'delete-all' command
  db.exec("INSERT INTO paragraphs_fts(paragraphs_fts) VALUES('delete-all')");
  db.exec('DELETE FROM paragraphs_text');

  console.log('Fetching all blocks...');
  const startTime = Date.now();
  
  // Get ALL blocks at once and group by paragraph_uid
  const allBlocks = db.prepare(`
    SELECT 
      b.paragraph_uid,
      b.section_uid,
      b.sermon_uid,
      b.text,
      b.order_index
    FROM blocks b
    ORDER BY b.paragraph_uid, b.order_index
  `).all();

  console.log(`Fetched ${allBlocks.length} blocks in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log('Grouping blocks by paragraph...');

  // Group blocks by paragraph_uid
  const paragraphMap = {};
  for (const block of allBlocks) {
    if (!paragraphMap[block.paragraph_uid]) {
      paragraphMap[block.paragraph_uid] = {
        uid: block.paragraph_uid,
        section_uid: block.section_uid,
        sermon_uid: block.sermon_uid,
        texts: []
      };
    }
    paragraphMap[block.paragraph_uid].texts.push(block.text);
  }

  const paragraphs = Object.values(paragraphMap);
  console.log(`Found ${paragraphs.length} paragraphs to process`);
  console.log('Inserting into database...\n');

  // Prepare statements
  const insertText = db.prepare(`
    INSERT INTO paragraphs_text (uid, section_uid, sermon_uid, text)
    VALUES (?, ?, ?, ?)
  `);

  const insertFts = db.prepare(`
    INSERT INTO paragraphs_fts (uid, text, section_uid, sermon_uid)
    VALUES (?, ?, ?, ?)
  `);

  // Process each paragraph
  let processed = 0;
  const processStart = Date.now();

  for (const para of paragraphs) {
    // Concatenate block texts (already in order from SQL)
    const combinedText = para.texts.join(' ');

    // Insert into both tables
    insertText.run(para.uid, para.section_uid, para.sermon_uid, combinedText);
    insertFts.run(para.uid, combinedText, para.section_uid, para.sermon_uid);
    
    processed++;
    
    // Show progress
    if (processed % 1000 === 0) {
      const elapsed = ((Date.now() - processStart) / 1000).toFixed(1);
      const rate = (processed / (Date.now() - processStart) * 1000).toFixed(0);
      const remaining = Math.round((paragraphs.length - processed) / rate);
      process.stdout.write(`\r  Processed ${processed}/${paragraphs.length} (${rate}/sec, ~${remaining}s remaining)  `);
    }
  }

  console.log(`\n\nProcessed ${processed} paragraphs`);

  // Commit transaction
  console.log('Committing transaction...');
  const commitStart = Date.now();
  db.exec('COMMIT');
  console.log(`Committed in ${((Date.now() - commitStart) / 1000).toFixed(1)}s`);

  console.log('\n✓ Successfully populated paragraph search tables!');
  console.log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  // Show some statistics
  console.log('\n=== Statistics ===');
  const stats = db.prepare(`
    SELECT 
      COUNT(DISTINCT pt.sermon_uid) as sermon_count,
      COUNT(DISTINCT pt.section_uid) as section_count,
      COUNT(*) as paragraph_count,
      AVG(LENGTH(pt.text)) as avg_text_length,
      MIN(LENGTH(pt.text)) as min_text_length,
      MAX(LENGTH(pt.text)) as max_text_length
    FROM paragraphs_text pt
  `).get();

  console.log(`Sermons: ${stats.sermon_count}`);
  console.log(`Sections: ${stats.section_count}`);
  console.log(`Paragraphs: ${stats.paragraph_count}`);
  console.log(`Average paragraph length: ${Math.round(stats.avg_text_length)} characters`);
  console.log(`Shortest paragraph: ${stats.min_text_length} characters`);
  console.log(`Longest paragraph: ${stats.max_text_length} characters`);

  // Test search
  console.log('\n=== Test Search ===');
  const testResults = db.prepare(`
    SELECT COUNT(*) as count
    FROM paragraphs_fts
    WHERE paragraphs_fts MATCH 'faith'
  `).get();
  console.log(`Paragraphs containing "faith": ${testResults.count}`);

} catch (error) {
  console.error('\nError:', error.message);
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}