import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SermonDatabase {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async initialize() {
    console.log('Initializing database connection...');
    if (this.initialized) return;

    try {
      // Detect Electron environment
      const isElectron = typeof process !== 'undefined' && process.versions && process.versions.electron;
      
      let dbPath;
      if (isElectron) {
        // In Electron, use user data directory for the database
        const { app } = require('electron');
        dbPath = path.join(app.getPath('userData'), 'sermons.db');
      } else {
        // Original logic for non-Electron (e.g., web or server)
        dbPath = process.env.NODE_ENV === 'production' 
          ? '/app/data/sermons.db'  // Docker/deployment path
          : path.join(__dirname, '..', 'data', 'sermons.db');
      }

      this.db = new Database(dbPath, { readonly: true });
      
      // Only set pragma statements that don't require write access
      try {
        this.db.pragma('cache_size = 1000000');
        this.db.pragma('temp_store = memory');
      } catch (pragmaError) {
        console.warn('Could not set some pragma statements (database may be readonly):', pragmaError.message);
      }
      
      this.initialized = true;
      console.log(`Connected to SQLite database: ${dbPath}`);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  // Get all sermon metadata
  getAllSermons() {
    this.ensureInitialized();
    const stmt = this.db.prepare(`
      SELECT id, uid, title, date 
      FROM sermons 
      ORDER BY date DESC
    `);
    return stmt.all();
  }

  // Get sermon by UID
  getSermon(uid) {
    this.ensureInitialized();
    const stmt = this.db.prepare(`
      SELECT * FROM sermons WHERE uid = ?
    `);
    return stmt.get(uid);
  }

  // Get sermon sections
  getSermonSections(sermonUid) {
    this.ensureInitialized();
    const stmt = this.db.prepare(`
      SELECT * FROM sections 
      WHERE sermon_uid = ? 
      ORDER BY order_index
    `);
    return stmt.all(sermonUid);
  }

  // Get section paragraphs
  getSectionParagraphs(sectionUid) {
    this.ensureInitialized();
    const stmt = this.db.prepare(`
      SELECT * FROM paragraphs 
      WHERE section_uid = ? 
      ORDER BY order_index
    `);
    return stmt.all(sectionUid);
  }

  // Get paragraph blocks
  getParagraphBlocks(paragraphUid) {
    this.ensureInitialized();
    const stmt = this.db.prepare(`
      SELECT * FROM blocks 
      WHERE paragraph_uid = ? 
      ORDER BY order_index
    `);
    return stmt.all(paragraphUid);
  }

  // Get all blocks for a sermon
  getSermonBlocks(sermonUid) {
    this.ensureInitialized();
    const stmt = this.db.prepare(`
      SELECT uid, text, type, section_uid, paragraph_uid, order_index, indented
      FROM blocks 
      WHERE sermon_uid = ? 
      ORDER BY section_uid, paragraph_uid, order_index
    `);
    return stmt.all(sermonUid);
  }

  // Full-text search using FTS5
  searchText(query, limit = 50) {
    this.ensureInitialized();
    const stmt = this.db.prepare(`
      SELECT 
        b.uid,
        b.text,
        b.type,
        b.section_uid,
        b.paragraph_uid,
        b.sermon_uid,
        s.title,
        s.date,
        bm4(blocks_fts) as rank
      FROM blocks_fts 
      JOIN blocks b ON blocks_fts.rowid = b.rowid
      JOIN sermons s ON b.sermon_uid = s.uid
      WHERE blocks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);
    return stmt.all(query, limit);
  }

  // Search by block type
  searchByBlockType(query, blockType, limit = 50) {
    this.ensureInitialized();
    const stmt = this.db.prepare(`
      SELECT 
        b.uid,
        b.text,
        b.type,
        b.section_uid,
        b.paragraph_uid,
        b.sermon_uid,
        s.title,
        s.date
      FROM blocks b
      JOIN sermons s ON b.sermon_uid = s.uid
      WHERE b.type = ? AND b.text LIKE ?
      ORDER BY s.date DESC
      LIMIT ?
    `);
    return stmt.all(blockType, `%${query}%`, limit);
  }

  // Search sermons by metadata
  searchSermons(filters = {}) {
    this.ensureInitialized();
    
    let sql = `SELECT id, uid, title, date FROM sermons WHERE 1=1`;
    const params = [];

    if (filters.title) {
      sql += ` AND title LIKE ?`;
      params.push(`%${filters.title}%`);
    }

    if (filters.date) {
      sql += ` AND date = ?`;
      params.push(filters.date);
    }

    if (filters.dateRange?.start && filters.dateRange?.end) {
      sql += ` AND date BETWEEN ? AND ?`;
      params.push(filters.dateRange.start, filters.dateRange.end);
    }

    if (filters.id) {
      sql += ` AND id = ?`;
      params.push(parseInt(filters.id));
    }

    if (filters.uid) {
      sql += ` AND uid = ?`;
      params.push(filters.uid);
    }

    sql += ` ORDER BY date DESC`;

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  // Get sermon statistics
  getSermonStats(uid) {
    this.ensureInitialized();
    
    const statsStmt = this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM sections WHERE sermon_uid = ?) as total_sections,
        (SELECT COUNT(*) FROM paragraphs p JOIN sections s ON p.section_uid = s.uid WHERE s.sermon_uid = ?) as total_paragraphs,
        (SELECT COUNT(*) FROM blocks WHERE sermon_uid = ?) as total_blocks,
        (SELECT SUM(LENGTH(text) - LENGTH(REPLACE(text, ' ', '')) + 1) FROM blocks WHERE sermon_uid = ?) as word_count
    `);

    const blockTypesStmt = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM blocks 
      WHERE sermon_uid = ? AND type IS NOT NULL
      GROUP BY type
    `);

    const stats = statsStmt.get(uid, uid, uid, uid);
    const blockTypes = blockTypesStmt.all(uid);

    return {
      totalSections: stats.total_sections,
      totalParagraphs: stats.total_paragraphs,
      totalBlocks: stats.total_blocks,
      wordCount: stats.word_count || 0,
      blockTypes: blockTypes.reduce((acc, row) => {
        acc[row.type] = row.count;
        return acc;
      }, {}),
      averageParagraphLength: stats.total_paragraphs > 0 ? (stats.word_count || 0) / stats.total_paragraphs : 0
    };
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

export const sermonDatabase = new SermonDatabase();
