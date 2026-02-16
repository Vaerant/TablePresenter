// fixParagraphsFts.js
const Database = require('better-sqlite3');
const db = new Database('./sermons.db');

console.log('Fixing paragraphs FTS table...\n');

try {
  db.exec('BEGIN TRANSACTION');

  console.log('Step 1: Dropping old triggers...');
  db.exec('DROP TRIGGER IF EXISTS paragraphs_text_ai');
  db.exec('DROP TRIGGER IF EXISTS paragraphs_text_au');
  db.exec('DROP TRIGGER IF EXISTS paragraphs_text_ad');

  console.log('Step 2: Dropping old paragraphs_fts table...');
  db.exec('DROP TABLE IF EXISTS paragraphs_fts');

  console.log('Step 3: Recreating paragraphs_text with rowid support...');
  // Rename old table
  db.exec('ALTER TABLE paragraphs_text RENAME TO paragraphs_text_old');
  
  // Create new table WITHOUT specifying uid as PRIMARY KEY (so it gets a rowid)
  db.exec(`
    CREATE TABLE paragraphs_text (
      uid TEXT NOT NULL UNIQUE,
      section_uid TEXT,
      sermon_uid TEXT,
      text TEXT,
      FOREIGN KEY(section_uid) REFERENCES sections(uid),
      FOREIGN KEY(sermon_uid) REFERENCES sermons(uid),
      FOREIGN KEY(uid) REFERENCES paragraphs(uid)
    )
  `);

  // Copy data
  console.log('Step 4: Copying data...');
  db.exec(`
    INSERT INTO paragraphs_text (uid, section_uid, sermon_uid, text)
    SELECT uid, section_uid, sermon_uid, text FROM paragraphs_text_old
  `);

  // Drop old table
  db.exec('DROP TABLE paragraphs_text_old');

  console.log('Step 5: Creating new FTS5 table with content source...');
  db.exec(`
    CREATE VIRTUAL TABLE paragraphs_fts USING fts5(
      uid UNINDEXED,
      text,
      section_uid UNINDEXED,
      sermon_uid UNINDEXED,
      content='paragraphs_text',
      content_rowid='rowid',
      tokenize='porter unicode61'
    )
  `);

  console.log('Step 6: Rebuilding FTS index...');
  db.exec("INSERT INTO paragraphs_fts(paragraphs_fts) VALUES('rebuild')");

  console.log('Step 7: Recreating triggers for automatic updates...');
  db.exec(`
    CREATE TRIGGER paragraphs_text_ai AFTER INSERT ON blocks BEGIN
      DELETE FROM paragraphs_text WHERE uid = new.paragraph_uid;
      
      INSERT INTO paragraphs_text (uid, section_uid, sermon_uid, text)
      SELECT 
        new.paragraph_uid,
        new.section_uid,
        new.sermon_uid,
        GROUP_CONCAT(text, ' ') 
      FROM blocks 
      WHERE paragraph_uid = new.paragraph_uid
      ORDER BY order_index;
      
      INSERT INTO paragraphs_fts(paragraphs_fts, rowid, uid, text, section_uid, sermon_uid) 
      VALUES('delete', (SELECT rowid FROM paragraphs_text WHERE uid = new.paragraph_uid), new.paragraph_uid, '', new.section_uid, new.sermon_uid);
      
      INSERT INTO paragraphs_fts(rowid, uid, text, section_uid, sermon_uid)
      SELECT rowid, uid, text, section_uid, sermon_uid FROM paragraphs_text WHERE uid = new.paragraph_uid;
    END
  `);

  db.exec(`
    CREATE TRIGGER paragraphs_text_au AFTER UPDATE ON blocks BEGIN
      DELETE FROM paragraphs_text WHERE uid IN (old.paragraph_uid, new.paragraph_uid);
      
      INSERT OR IGNORE INTO paragraphs_text (uid, section_uid, sermon_uid, text)
      SELECT 
        old.paragraph_uid,
        (SELECT section_uid FROM blocks WHERE paragraph_uid = old.paragraph_uid LIMIT 1),
        (SELECT sermon_uid FROM blocks WHERE paragraph_uid = old.paragraph_uid LIMIT 1),
        GROUP_CONCAT(text, ' ') 
      FROM blocks 
      WHERE paragraph_uid = old.paragraph_uid
      ORDER BY order_index;
      
      INSERT OR IGNORE INTO paragraphs_text (uid, section_uid, sermon_uid, text)
      SELECT 
        new.paragraph_uid,
        new.section_uid,
        new.sermon_uid,
        GROUP_CONCAT(text, ' ') 
      FROM blocks 
      WHERE paragraph_uid = new.paragraph_uid
      ORDER BY order_index;
      
      INSERT INTO paragraphs_fts(paragraphs_fts) VALUES('rebuild');
    END
  `);

  db.exec(`
    CREATE TRIGGER paragraphs_text_ad AFTER DELETE ON blocks BEGIN
      DELETE FROM paragraphs_text WHERE uid = old.paragraph_uid;
      
      INSERT OR IGNORE INTO paragraphs_text (uid, section_uid, sermon_uid, text)
      SELECT 
        old.paragraph_uid,
        (SELECT section_uid FROM blocks WHERE paragraph_uid = old.paragraph_uid LIMIT 1),
        (SELECT sermon_uid FROM blocks WHERE paragraph_uid = old.paragraph_uid LIMIT 1),
        GROUP_CONCAT(text, ' ') 
      FROM blocks 
      WHERE paragraph_uid = old.paragraph_uid
      ORDER BY order_index;
      
      INSERT INTO paragraphs_fts(paragraphs_fts) VALUES('rebuild');
    END
  `);

  db.exec('COMMIT');

  console.log('\n✓ Successfully fixed paragraphs FTS table!');

  // Test it
  console.log('\n=== Test Search ===');
  const testResults = db.prepare(`
    SELECT 
      pt.uid,
      pt.text as paragraph_text,
      bm25(paragraphs_fts) as rank
    FROM paragraphs_fts
    JOIN paragraphs_text pt ON pt.rowid = paragraphs_fts.rowid
    WHERE paragraphs_fts MATCH 'faith'
    LIMIT 3
  `).all();
  
  console.log(`Found ${testResults.length} results:`);
  testResults.forEach(r => {
    console.log(`\n[Rank: ${r.rank.toFixed(2)}] ${r.uid}`);
    console.log(`${r.paragraph_text.substring(0, 100)}...`);
  });

} catch (error) {
  console.error('Error:', error.message);
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}