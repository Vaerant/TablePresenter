// populateParagraphWindows.js
const Database = require('better-sqlite3');
const db = new Database('./sermons.db');

console.log('Populating paragraph windows...\n');

try {
  db.exec('BEGIN TRANSACTION');

  // Clear existing data
  console.log('Clearing existing data...');
  db.exec("DELETE FROM paragraph_windows");
  db.exec("INSERT INTO paragraph_windows_fts(paragraph_windows_fts) VALUES('delete-all')");

  // Get all paragraphs ordered properly
  console.log('Fetching paragraphs...');
  const paragraphs = db.prepare(`
    SELECT 
      pt.uid,
      pt.section_uid,
      pt.sermon_uid,
      pt.text,
      p.order_index
    FROM paragraphs_text pt
    JOIN paragraphs p ON p.uid = pt.uid
    ORDER BY pt.sermon_uid, pt.section_uid, p.order_index
  `).all();

  console.log(`Found ${paragraphs.length} paragraphs`);

  const insertWindow = db.prepare(`
    INSERT INTO paragraph_windows (uid, paragraph_uids, section_uid, sermon_uid, window_size, start_order_index, text)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let windowCount = 0;
  const startTime = Date.now();

  // Create windows
  for (let i = 0; i < paragraphs.length; i++) {
    const currentPara = paragraphs[i];
    
    // Create 2-paragraph and 3-paragraph windows
    for (const windowSize of [2, 3]) {
      if (i + windowSize > paragraphs.length) continue;
      
      const windowParas = paragraphs.slice(i, i + windowSize);
      
      // Only create window if all paragraphs are in same section
      const sameSection = windowParas.every(p => p.section_uid === currentPara.section_uid);
      if (!sameSection) continue;
      
      const windowUid = `${currentPara.uid}_w${windowSize}`;
      const paragraphUids = JSON.stringify(windowParas.map(p => p.uid));
      const combinedText = windowParas.map(p => p.text).join(' ');
      
      insertWindow.run(
        windowUid,
        paragraphUids,
        currentPara.section_uid,
        currentPara.sermon_uid,
        windowSize,
        currentPara.order_index,
        combinedText
      );
      
      windowCount++;
      
      if (windowCount % 1000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (windowCount / elapsed).toFixed(0);
        process.stdout.write(`\r  Created ${windowCount} windows (${rate}/sec)  `);
      }
    }
  }

  console.log(`\n\nCreated ${windowCount} paragraph windows`);
  console.log('Committing...');
  db.exec('COMMIT');
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Done in ${totalTime}s`);

  // Stats
  const stats = db.prepare(`
    SELECT 
      window_size,
      COUNT(*) as count,
      AVG(LENGTH(text)) as avg_length
    FROM paragraph_windows
    GROUP BY window_size
  `).all();

  console.log('\n=== Statistics ===');
  stats.forEach(s => {
    console.log(`${s.window_size}-paragraph windows: ${s.count} (avg ${Math.round(s.avg_length)} chars)`);
  });

} catch (error) {
  console.error('Error:', error);
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}