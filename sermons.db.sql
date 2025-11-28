BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "blocks" (
	"uid"	TEXT,
	"paragraph_uid"	TEXT,
	"section_uid"	TEXT,
	"sermon_uid"	TEXT,
	"text"	TEXT,
	"order_index"	INTEGER,
	"type"	TEXT,
	"indented"	BOOLEAN DEFAULT FALSE,
	PRIMARY KEY("uid"),
	FOREIGN KEY("paragraph_uid") REFERENCES "paragraphs"("uid"),
	FOREIGN KEY("section_uid") REFERENCES "sections"("uid"),
	FOREIGN KEY("sermon_uid") REFERENCES "sermons"("uid")
);
CREATE TABLE IF NOT EXISTSAL TABLE blocks_fts USING fts5(
    uid UNINDEXED,
    text,
    sermon_uid UNINDEXED,
    content='blocks',
    content_rowid='rowid'
  );
CREATE TABLE IF NOT EXISTS "blocks_fts_config" (
	"k"	,
	"v"	,
	PRIMARY KEY("k")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "blocks_fts_data" (
	"id"	INTEGER,
	"block"	BLOB,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "blocks_fts_docsize" (
	"id"	INTEGER,
	"sz"	BLOB,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "blocks_fts_idx" (
	"segid"	,
	"term"	,
	"pgno"	,
	PRIMARY KEY("segid","term")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "paragraph_windows" (
	"uid"	TEXT,
	"paragraph_uids"	TEXT,
	"section_uid"	TEXT,
	"sermon_uid"	TEXT,
	"window_size"	INTEGER,
	"start_order_index"	INTEGER,
	"text"	TEXT,
	PRIMARY KEY("uid"),
	FOREIGN KEY("section_uid") REFERENCES "sections"("uid"),
	FOREIGN KEY("sermon_uid") REFERENCES "sermons"("uid")
);
CREATE TABLE IF NOT EXISTSAL TABLE paragraph_windows_fts USING fts5(
    uid UNINDEXED,
    text,
    section_uid UNINDEXED,
    sermon_uid UNINDEXED,
    window_size UNINDEXED,
    content='paragraph_windows',
    content_rowid='rowid',
    tokenize='porter unicode61'
);
CREATE TABLE IF NOT EXISTS "paragraph_windows_fts_config" (
	"k"	,
	"v"	,
	PRIMARY KEY("k")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "paragraph_windows_fts_data" (
	"id"	INTEGER,
	"block"	BLOB,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "paragraph_windows_fts_docsize" (
	"id"	INTEGER,
	"sz"	BLOB,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "paragraph_windows_fts_idx" (
	"segid"	,
	"term"	,
	"pgno"	,
	PRIMARY KEY("segid","term")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "paragraphs" (
	"uid"	TEXT,
	"section_uid"	TEXT,
	"order_index"	INTEGER,
	PRIMARY KEY("uid"),
	FOREIGN KEY("section_uid") REFERENCES "sections"("uid")
);
CREATE TABLE IF NOT EXISTSAL TABLE paragraphs_fts USING fts5(
      uid UNINDEXED,
      text,
      section_uid UNINDEXED,
      sermon_uid UNINDEXED,
      content='paragraphs_text',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );
CREATE TABLE IF NOT EXISTS "paragraphs_fts_config" (
	"k"	,
	"v"	,
	PRIMARY KEY("k")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "paragraphs_fts_data" (
	"id"	INTEGER,
	"block"	BLOB,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "paragraphs_fts_docsize" (
	"id"	INTEGER,
	"sz"	BLOB,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "paragraphs_fts_idx" (
	"segid"	,
	"term"	,
	"pgno"	,
	PRIMARY KEY("segid","term")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "paragraphs_text" (
	"uid"	TEXT NOT NULL UNIQUE,
	"section_uid"	TEXT,
	"sermon_uid"	TEXT,
	"text"	TEXT,
	FOREIGN KEY("section_uid") REFERENCES "sections"("uid"),
	FOREIGN KEY("sermon_uid") REFERENCES "sermons"("uid"),
	FOREIGN KEY("uid") REFERENCES "paragraphs"("uid")
);
CREATE TABLE IF NOT EXISTS "sections" (
	"uid"	TEXT,
	"sermon_uid"	TEXT,
	"number"	TEXT,
	"order_index"	INTEGER,
	PRIMARY KEY("uid"),
	FOREIGN KEY("sermon_uid") REFERENCES "sermons"("uid")
);
CREATE TABLE IF NOT EXISTS "sermons" (
	"id"	INTEGER,
	"uid"	TEXT NOT NULL UNIQUE,
	"title"	TEXT,
	"date"	TEXT,
	"created_at"	DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id")
);
CREATE TRIGGER blocks_ad AFTER DELETE ON blocks BEGIN
        INSERT INTO blocks_fts(blocks_fts, rowid, uid, text, sermon_uid) 
        VALUES('delete', old.rowid, old.uid, old.text, old.sermon_uid);
      END;
CREATE TRIGGER blocks_ai AFTER INSERT ON blocks BEGIN
        INSERT INTO blocks_fts(rowid, uid, text, sermon_uid) 
        VALUES (new.rowid, new.uid, new.text, new.sermon_uid);
      END;
CREATE TRIGGER blocks_au AFTER UPDATE ON blocks BEGIN
        INSERT INTO blocks_fts(blocks_fts, rowid, uid, text, sermon_uid) 
        VALUES('delete', old.rowid, old.uid, old.text, old.sermon_uid);
        INSERT INTO blocks_fts(rowid, uid, text, sermon_uid) 
        VALUES (new.rowid, new.uid, new.text, new.sermon_uid);
      END;
CREATE TRIGGER paragraph_windows_ad AFTER DELETE ON paragraph_windows BEGIN
    INSERT INTO paragraph_windows_fts(paragraph_windows_fts, rowid, uid, text, section_uid, sermon_uid, window_size) 
    VALUES('delete', old.rowid, old.uid, old.text, old.section_uid, old.sermon_uid, old.window_size);
END;
CREATE TRIGGER paragraph_windows_ai AFTER INSERT ON paragraph_windows BEGIN
    INSERT INTO paragraph_windows_fts(rowid, uid, text, section_uid, sermon_uid, window_size) 
    VALUES (new.rowid, new.uid, new.text, new.section_uid, new.sermon_uid, new.window_size);
END;
CREATE TRIGGER paragraph_windows_au AFTER UPDATE ON paragraph_windows BEGIN
    INSERT INTO paragraph_windows_fts(paragraph_windows_fts, rowid, uid, text, section_uid, sermon_uid, window_size) 
    VALUES('delete', old.rowid, old.uid, old.text, old.section_uid, old.sermon_uid, old.window_size);
    INSERT INTO paragraph_windows_fts(rowid, uid, text, section_uid, sermon_uid, window_size) 
    VALUES (new.rowid, new.uid, new.text, new.section_uid, new.sermon_uid, new.window_size);
END;
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
    END;
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
    END;
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
    END;
COMMIT;
