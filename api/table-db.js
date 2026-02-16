const Database = require('better-sqlite3');
const path = require('path');
const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

class SermonDatabase {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.generalSearchCache = new Map(); // key -> { ts, results }
  }

  initialize() {
    console.log('Initializing database connection in Electron main process...');
    if (this.initialized) return;

    const initStart = process.hrtime.bigint();
    try {
      const dbPath = path.join(__dirname, 'sermons.db');
      console.log('Database path:', dbPath);

      this.db = new Database(dbPath, { readonly: true });

      // Pre-prepare frequently-used statements
      this._stmtGetSermon = this.db.prepare(`
        SELECT 
          s.id, s.uid, s.title, s.date,
          sec.uid as section_uid, sec.number as section_number, sec.order_index as section_order,
          p.uid as paragraph_uid, p.order_index as paragraph_order,
          b.uid as block_uid, b.text as block_text, b.type as block_type, 
          b.order_index as block_order, b.indented as block_indented
        FROM sermons s
        LEFT JOIN sections sec ON sec.sermon_uid = s.uid
        LEFT JOIN paragraphs p ON p.section_uid = sec.uid
        LEFT JOIN blocks b ON b.paragraph_uid = p.uid
        WHERE s.uid = ?
        ORDER BY sec.order_index, p.order_index, b.order_index
      `);

      this.sermonCache = new Map();
      this.sermonJsonCache = new Map();

      this.initialized = true;
      const initMs = Number(process.hrtime.bigint() - initStart) / 1e6;
      console.log(`Connected to SQLite database: ${dbPath} (init ${initMs.toFixed(2)} ms)`);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  ensureInitialized() {
    if (!this.initialized) {
      this.initialize();
    }
  }

  getSermon(uid) {
    console.log(`Fetching sermon with UID: ${uid}`);
    this.ensureInitialized();

    const totalStart = process.hrtime.bigint();

    // Check cache first
    if (this.sermonCache && this.sermonCache.has(uid)) {
      const totalMs = Number(process.hrtime.bigint() - totalStart) / 1e6;
      console.log(`Sermon cache hit in ${totalMs.toFixed(2)} ms`);
      return this.sermonCache.get(uid);
    }

    const queryStart = process.hrtime.bigint();
    const rows = this._stmtGetSermon.all(uid);
    const queryMs = Number(process.hrtime.bigint() - queryStart) / 1e6;
    console.log(`Fetched ${rows.length} rows for sermon UID: ${uid} (query ${queryMs.toFixed(2)} ms)`);

    if (rows.length === 0) {
      console.warn(`No sermon found with UID: ${uid}`);
      return null;
    }

    const buildStart = process.hrtime.bigint();

    // Transform flat rows into nested structure
    const sermon = {
      uid: rows[0].uid,
      title: rows[0].title,
      date: rows[0].date,
      sections: {}
    };

    for (const row of rows) {
      if (!sermon.sections[row.section_uid]) {
        sermon.sections[row.section_uid] = {
          uid: row.section_uid,
          number: row.section_number,
          paragraphs: {}
        };
      }
      const section = sermon.sections[row.section_uid];

      if (!section.paragraphs[row.paragraph_uid]) {
        section.paragraphs[row.paragraph_uid] = {
          uid: row.paragraph_uid,
          blocks: []
        };
      }
      const paragraph = section.paragraphs[row.paragraph_uid];

      paragraph.blocks.push({
        uid: row.block_uid,
        text: row.block_text,
        type: row.block_type,
        indented: !!row.block_indented
      });
    }

    const buildMs = Number(process.hrtime.bigint() - buildStart) / 1e6;
    console.log(`Constructed sermon object in ${buildMs.toFixed(2)} ms`);

    fs.writeFileSync(path.join(__dirname, `sermon_${uid}.json`), JSON.stringify(sermon, null, 2), 'utf-8');

    // Cache the result
    this.sermonCache.set(uid, sermon);

    const totalMs = Number(process.hrtime.bigint() - totalStart) / 1e6;
    console.log(`Total getSermon time: ${totalMs.toFixed(2)} ms`);

    return sermon;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

// if (require.main === module) {
//   const sermonDb = new SermonDatabase();
//   sermonDb.initialize();
  
//   // sample search for each type
//   (async () => {
//     console.log('General Search Results:', sermonDb.generalSearch('faith hope love', 5));
//     console.log('Phrase Search Results:', sermonDb.searchParagraphsExactPhrase('faith hope love', 5));
//     console.log('Similarity Search Results:', await sermonDb.searchSimilar('faith hope love', 5));
//     sermonDb.close();
//   })();
// }

if (require.main === module) {
  const sermonDb = new SermonDatabase();
  sermonDb.initialize();

  // fetch sermon
  const sermonUid = 'b5aca7393e97'; // replace with actual UID
  const sermon = sermonDb.getSermon(sermonUid);
  console.log('Fetched sermon structure:', sermon ? { uid: sermon.uid, title: sermon.title, sections: Object.keys(sermon.sections).length } : 'Not found');
  console.log('Fetched sermon:', sermon ? { uid: sermon.uid, title: sermon.title } : 'Not found');
  sermonDb.close();
}

module.exports = { SermonDatabase };