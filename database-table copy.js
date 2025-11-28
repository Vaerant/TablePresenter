const Database = require('better-sqlite3');
const path = require('path');

class SermonDatabase {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.generalSearchCache = new Map(); // key -> { ts, results }
  }

  initialize() {
    console.log('Initializing database connection in Electron main process...');
    if (this.initialized) return;

    try {
      const dbPath = path.join(__dirname, 'sermons.db');
      console.log('Database path:', dbPath);

      this.db = new Database(dbPath, { readonly: true });
      
      this.initialized = true;
      console.log(`Connected to SQLite database: ${dbPath}`);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  getAllSermons() {
    this.ensureInitialized();
    const sql = `
      SELECT 
        s.id,
        s.uid,
        s.title,
        s.date,
        COALESCE(pc.paragraph_count, 0) AS paragraph_count
      FROM sermons s
      LEFT JOIN (
        SELECT sec.sermon_uid, COUNT(p.uid) AS paragraph_count
        FROM sections sec
        JOIN paragraphs p ON p.section_uid = sec.uid
        GROUP BY sec.sermon_uid
      ) pc ON pc.sermon_uid = s.uid
      ORDER BY s.date ASC
    `;
    return this.db.prepare(sql).all();
  }

  getSermon(uid) {
    this.ensureInitialized();
    
    // First get the sermon
    const sermon = this.db.prepare(`SELECT * FROM sermons WHERE uid = ?`).get(uid);
    
    if (!sermon) {
      return null;
    }
    
    // Get all sections for this sermon
    const sections = this.db.prepare(`
      SELECT uid, number, order_index
      FROM sections 
      WHERE sermon_uid = ? 
      ORDER BY order_index
    `).all(uid);
    
    // Get all paragraphs for all sections at once
    const paragraphs = this.db.prepare(`
      SELECT p.uid, p.section_uid, p.order_index
      FROM paragraphs p
      JOIN sections s ON p.section_uid = s.uid
      WHERE s.sermon_uid = ?
      ORDER BY s.order_index, p.order_index
    `).all(uid);
    
    // Get all blocks for this sermon at once
    const blocks = this.db.prepare(`
      SELECT uid, text, type, section_uid, paragraph_uid, order_index, indented
      FROM blocks 
      WHERE sermon_uid = ? 
      ORDER BY section_uid, paragraph_uid, order_index
    `).all(uid);
    
    // Build hierarchical structure (without italic_segments since table doesn't exist)
    const structuredSermon = this.buildSermonHierarchy(sermon, sections, paragraphs, blocks, []);
    return structuredSermon;
  }

  buildSermonHierarchy(sermon, sections, paragraphs, blocks, italicSegments) {
    // Group data by parent IDs for efficient lookup
    const paragraphsBySection = {};
    const blocksByParagraph = {};
    const italicsByBlock = {};
    
    // Group paragraphs by section
    paragraphs.forEach(paragraph => {
      if (!paragraphsBySection[paragraph.section_uid]) {
        paragraphsBySection[paragraph.section_uid] = [];
      }
      paragraphsBySection[paragraph.section_uid].push(paragraph);
    });
    
    // Group blocks by paragraph
    blocks.forEach(block => {
      if (!blocksByParagraph[block.paragraph_uid]) {
        blocksByParagraph[block.paragraph_uid] = [];
      }
      blocksByParagraph[block.paragraph_uid].push(block);
    });
    
    // Group italic segments by block (empty for now since table doesn't exist)
    italicSegments.forEach(italic => {
      if (!italicsByBlock[italic.block_uid]) {
        italicsByBlock[italic.block_uid] = [];
      }
      italicsByBlock[italic.block_uid].push({
        text: italic.text,
        index: italic.start_index
      });
    });
    
    // Build the hierarchical structure
    const structuredSections = {};
    const orderedSectionIds = [];
    
    sections.forEach(section => {
      orderedSectionIds.push(section.uid);
      
      const sectionParagraphs = paragraphsBySection[section.uid] || [];
      const structuredParagraphs = {};
      const orderedParagraphIds = [];
      
      sectionParagraphs.forEach(paragraph => {
        orderedParagraphIds.push(paragraph.uid);
        
        const paragraphBlocks = blocksByParagraph[paragraph.uid] || [];
        const structuredBlocks = {};
        const orderedBlockIds = [];
        
        paragraphBlocks.forEach(block => {
          orderedBlockIds.push(block.uid);
          
          const blockItalics = italicsByBlock[block.uid] || [];
          
          structuredBlocks[block.uid] = {
            text: block.text,
            type: block.type,
            order: block.order_index,
            indented: !!block.indented,
            italicSegments: blockItalics
          };
        });
        
        structuredParagraphs[paragraph.uid] = {
          order: paragraph.order_index,
          blocks: structuredBlocks,
          orderedBlockIds: orderedBlockIds
        };
      });
      
      structuredSections[section.uid] = {
        number: section.number,
        order: section.order_index,
        paragraphs: structuredParagraphs,
        orderedParagraphIds: orderedParagraphIds
      };
    });
    
    return {
      id: sermon.id,
      uid: sermon.uid,
      title: sermon.title,
      date: sermon.date,
      sections: structuredSections,
      orderedSectionIds: orderedSectionIds
    };
  }

  getSermonSections(sermonUid) {
    this.ensureInitialized();
    const sql = `
      SELECT * FROM sections 
      WHERE sermon_uid = ? 
      ORDER BY order_index
    `;
    return this.db.prepare(sql).all(sermonUid);
  }

  getSectionParagraphs(sectionUid) {
    this.ensureInitialized();
    const sql = `
      SELECT * FROM paragraphs 
      WHERE section_uid = ? 
      ORDER BY order_index
    `;
    return this.db.prepare(sql).all(sectionUid);
  }

  getParagraphBlocks(paragraphUid) {
    this.ensureInitialized();
    const sql = `
      SELECT * FROM blocks 
      WHERE paragraph_uid = ? 
      ORDER BY order_index
    `;
    return this.db.prepare(sql).all(paragraphUid);
  }

  getSermonBlocks(sermonUid) {
    this.ensureInitialized();
    const sql = `
      SELECT uid, text, type, section_uid, paragraph_uid, order_index, indented
      FROM blocks 
      WHERE sermon_uid = ? 
      ORDER BY section_uid, paragraph_uid, order_index
    `;
    return this.db.prepare(sql).all(sermonUid);
  }

  searchText(query, limit = null, searchMode = 'phrase') {
    this.ensureInitialized();
    if (searchMode === 'general') {
      return this.searchTextGeneral(query, limit);
    } else {
      return this.searchTextPhrase(query, limit);
    }
  }

  searchTextPhrase(query, limit = null) {
    this.ensureInitialized();
    
    // For phrase search, we need exact consecutive word matching
    // Try FTS search with exact phrase syntax first
    const ftsQuery = `"${query}"`; // Wrap in quotes for exact phrase matching
    const ftsSql = `
      SELECT 
        b.uid,
        b.text,
        b.type,
        b.section_uid,
        b.paragraph_uid,
        b.sermon_uid,
        s.title,
        s.date
      FROM blocks_fts 
      JOIN blocks b ON blocks_fts.rowid = b.rowid
      JOIN sermons s ON b.sermon_uid = s.uid
      WHERE blocks_fts MATCH ?
      ORDER BY s.date DESC, b.sermon_uid, b.paragraph_uid, b.order_index
      ${limit ? 'LIMIT ?' : ''}
    `;
    
    console.log('Executing FTS phrase search with exact query:', ftsQuery, 'limit:', limit || 'none');
    
    try {
      const stmt = this.db.prepare(ftsSql);
      const rows = limit ? stmt.all(ftsQuery, limit) : stmt.all(ftsQuery);
      console.log('FTS phrase search returned', rows?.length || 0, 'results');
      return rows || [];
    } catch (err) {
      console.log('FTS phrase search failed, falling back to manual phrase matching:', err.message);
      return this.searchExactPhrase(query, limit);
    }
  }

  searchExactPhrase(query, limit = null) {
    this.ensureInitialized();
    
    // Manual phrase matching - look for exact consecutive words
    const trimmedQuery = query.trim().toLowerCase();
    
    // First get all potential matches with LIKE
    const likeSql = `
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
      WHERE LOWER(b.text) LIKE ?
      ORDER BY s.date DESC, b.sermon_uid, b.paragraph_uid, b.order_index
    `;
    
    const rows = this.db.prepare(likeSql).all(`%${trimmedQuery}%`);
    
    // Now filter results to ensure exact phrase matching
    const exactMatches = rows.filter(row => {
      const text = row.text.toLowerCase();
      
      // Create a regex for exact phrase matching with word boundaries
      const words = trimmedQuery.split(/\s+/);
      const escapedWords = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      
      // Create pattern that matches the exact phrase with word boundaries
      let pattern = '\\b' + escapedWords[0] + '\\b';
      for (let i = 1; i < escapedWords.length; i++) {
        pattern += '\\s+(?:[^\\w\\s]*\\s*)*' + escapedWords[i] + '\\b';
      }
      
      const regex = new RegExp(pattern, 'i');
      return regex.test(text);
    });
    
    // Apply limit if specified
    const finalResults = limit ? exactMatches.slice(0, limit) : exactMatches;
    
    console.log('Manual phrase search returned', finalResults.length, 'exact matches out of', rows.length, 'potential matches');
    return finalResults;
  }

  searchTextGeneral(query, limit = null) {
    this.ensureInitialized();
    
    const words = this._tokenizeGeneralQuery(query);
    if (!words.length) return [];

    const key = `${words.join(' ')}|${limit || 'none'}`;
    const cached = this.generalSearchCache.get(key);
    if (cached && (Date.now() - cached.ts) < 4000) {
      return cached.results;
    }

    // Use AND operator for FTS5 to let the database do the filtering
    const ftsExpr = words.join(' AND ');

    const ftsSql = `
      SELECT 
        b.uid,
        b.text,
        b.type,
        b.section_uid,
        b.paragraph_uid,
        b.sermon_uid,
        s.title,
        s.date,
        b.order_index
      FROM blocks_fts
      JOIN blocks b ON blocks_fts.rowid = b.rowid
      JOIN sermons s ON b.sermon_uid = s.uid
      WHERE blocks_fts MATCH ?
      ORDER BY s.date DESC, b.sermon_uid, b.paragraph_uid, b.order_index
      ${limit ? 'LIMIT ?' : ''}
    `;

    try {
      const stmt = this.db.prepare(ftsSql);
      const rows = limit ? stmt.all(ftsExpr, limit) : stmt.all(ftsExpr);
      
      // Still apply whole-word validation but on limited results
      const regexes = this._compileWholeWordRegexes(words);
      const filtered = rows.filter(r => {
        const lower = (r.text || '').toLowerCase();
        return regexes.every(rx => rx.test(lower));
      });

      this.generalSearchCache.set(key, { ts: Date.now(), results: filtered });
      return filtered;
    } catch (err) {
      // Fallback: LIKE-based with AND logic and LIMIT
      const likeConditions = words.map(() => 'LOWER(b.text) LIKE ?').join(' AND ');
      const likeSql = `
        SELECT 
          b.uid,
          b.text,
          b.type,
          b.section_uid,
          b.paragraph_uid,
          b.sermon_uid,
          s.title,
          s.date,
          b.order_index
        FROM blocks b
        JOIN sermons s ON b.sermon_uid = s.uid
        WHERE ${likeConditions}
        ORDER BY s.date DESC, b.sermon_uid, b.paragraph_uid, b.order_index
        ${limit ? 'LIMIT ?' : ''}
      `;
      const likeParams = words.map(w => `%${w}%`);
      if (limit) likeParams.push(limit);

      const stmt = this.db.prepare(likeSql);
      const rows2 = stmt.all(...likeParams);
      
      const regexes = this._compileWholeWordRegexes(words);
      const filtered = (rows2 || []).filter(r => {
        const lower = (r.text || '').toLowerCase();
        return regexes.every(rx => rx.test(lower));
      });

      this.generalSearchCache.set(key, { ts: Date.now(), results: filtered });
      return filtered;
    }
  }

  searchByBlockType(query, blockType, limit = null) {
    this.ensureInitialized();
    const sql = `
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
      WHERE b.type = ? AND LOWER(b.text) LIKE LOWER(?)
      ORDER BY s.date DESC
      ${limit ? 'LIMIT ?' : ''}
    `;
    
    const stmt = this.db.prepare(sql);
    return limit ? stmt.all(blockType, `%${query}%`, limit) : stmt.all(blockType, `%${query}%`);
  }

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

  getBlockContext(sermonUid, blockUid) {
    this.ensureInitialized();
    
    // First get the target block to find its paragraph
    const block = this.db.prepare(`
      SELECT paragraph_uid, order_index
      FROM blocks 
      WHERE uid = ? AND sermon_uid = ?
    `).get(blockUid, sermonUid);
    
    if (!block) {
      return { paragraphBlocks: [] };
    }
    
    // Get all blocks in the same paragraph
    const paragraphBlocks = this.db.prepare(`
      SELECT uid, text, type, order_index, indented
      FROM blocks 
      WHERE paragraph_uid = ? 
      ORDER BY order_index
    `).all(block.paragraph_uid);
    
    return { 
      paragraphBlocks: paragraphBlocks || [],
      targetBlockIndex: paragraphBlocks ? paragraphBlocks.findIndex(b => b.uid === blockUid) : -1
    };
  }

  _tokenizeGeneralQuery(raw) {
    return Array.from(
      new Set(
        (raw || '')
          .toLowerCase()
          .trim()
          .split(/\s+/)
          .map(w => w.replace(/[%_]/g, '').replace(/[^a-z0-9'-]/g, ''))
          .filter(w => w.length > 0)
      )
    );
  }

  _compileWholeWordRegexes(words) {
    return words.map(w => {
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match when not preceded/followed by alphanumeric or apostrophe/hyphen
      return new RegExp(`(^|[^A-Za-z0-9''-])${esc}(?=$|[^A-Za-z0-9''-])`, 'i');
    });
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

module.exports = { SermonDatabase };