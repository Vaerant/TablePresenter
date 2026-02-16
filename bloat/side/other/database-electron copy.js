const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');

class SermonDatabase {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async initialize() {
    console.log('Initializing database connection in Electron main process...');
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      try {
        const dbPath = path.join(__dirname, 'sermons.db');
        console.log('Database path:', dbPath);

        // Remove OPEN_READONLY to allow index creation
        this.db = new sqlite3.Database(dbPath, (err) => {
          if (err) {
            console.error('Failed to initialize database:', err);
            reject(err);
            return;
          }
          
          // Optimize SQLite settings for read performance
          this.db.serialize(() => {
            this.db.run("PRAGMA cache_size = -64000"); // 64MB cache
            this.db.run("PRAGMA temp_store = memory");
            this.db.run("PRAGMA journal_mode = WAL"); // Better for reads
            this.db.run("PRAGMA synchronous = NORMAL");
            this.db.run("PRAGMA mmap_size = 268435456"); // 256MB memory map
            
            // Create indexes if they don't exist
            this.createIndexes().then(() => {
              this.initialized = true;
              console.log(`Connected to SQLite database: ${dbPath}`);
              resolve();
            }).catch(reject);
          });
        });
      } catch (error) {
        console.error('Failed to initialize database:', error);
        reject(error);
      }
    });
  }

  // Convert synchronous methods to use callbacks/promises
  getAllSermons() {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, uid, title, date 
        FROM sermons 
        ORDER BY date ASC
      `;
      this.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getSermon(uid) {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      // First get the sermon
      const sermonSql = `SELECT * FROM sermons WHERE uid = ?`;
      
      this.db.get(sermonSql, [uid], (err, sermon) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!sermon) {
          resolve(null);
          return;
        }
        
        // Get all sections for this sermon
        const sectionsSql = `
          SELECT uid, number, order_index
          FROM sections 
          WHERE sermon_uid = ? 
          ORDER BY order_index
        `;
        
        this.db.all(sectionsSql, [uid], (err, sections) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Get all paragraphs for all sections at once
          const paragraphsSql = `
            SELECT p.uid, p.section_uid, p.order_index
            FROM paragraphs p
            JOIN sections s ON p.section_uid = s.uid
            WHERE s.sermon_uid = ?
            ORDER BY s.order_index, p.order_index
          `;
          
          this.db.all(paragraphsSql, [uid], (err, paragraphs) => {
            if (err) {
              reject(err);
              return;
            }
            
            // Get all blocks for this sermon at once
            const blocksSql = `
              SELECT uid, text, type, section_uid, paragraph_uid, order_index, indented
              FROM blocks 
              WHERE sermon_uid = ? 
              ORDER BY section_uid, paragraph_uid, order_index
            `;
            
            this.db.all(blocksSql, [uid], (err, blocks) => {
              if (err) {
                reject(err);
                return;
              }
              
              // Get all italic segments for this sermon
              const italicsSql = `
                SELECT i.block_uid, i.text, i.start_index
                FROM italic_segments i
                JOIN blocks b ON i.block_uid = b.uid
                WHERE b.sermon_uid = ?
                ORDER BY i.block_uid, i.start_index
              `;
              
              this.db.all(italicsSql, [uid], (err, italicSegments) => {
                if (err) {
                  reject(err);
                  return;
                }
                
                // Build hierarchical structure
                const structuredSermon = this.buildSermonHierarchy(sermon, sections, paragraphs, blocks, italicSegments);
                resolve(structuredSermon);
              });
            });
          });
        });
      });
    });
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
    
    // Group italic segments by block
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
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM sections 
        WHERE sermon_uid = ? 
        ORDER BY order_index
      `;
      this.db.all(sql, [sermonUid], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getSectionParagraphs(sectionUid) {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM paragraphs 
        WHERE section_uid = ? 
        ORDER BY order_index
      `;
      this.db.all(sql, [sectionUid], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getParagraphBlocks(paragraphUid) {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM blocks 
        WHERE paragraph_uid = ? 
        ORDER BY order_index
      `;
      this.db.all(sql, [paragraphUid], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getSermonBlocks(sermonUid) {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT uid, text, type, section_uid, paragraph_uid, order_index, indented
        FROM blocks 
        WHERE sermon_uid = ? 
        ORDER BY section_uid, paragraph_uid, order_index
      `;
      this.db.all(sql, [sermonUid], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  searchText(query, limit = null) {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      // Try FTS search first (FTS is already case-insensitive by default)
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
      
      // console.log('Executing FTS search with query:', query, 'limit:', limit || 'none'); // Debug log
      
      const params = limit ? [query, limit] : [query];
      
      this.db.all(ftsSql, params, (err, rows) => {
        if (err) {
          console.log('FTS search failed, falling back to LIKE search:', err.message);
          
          // Fallback to case-insensitive LIKE search
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
            WHERE LOWER(b.text) LIKE LOWER(?)
            ORDER BY s.date DESC, b.sermon_uid, b.paragraph_uid, b.order_index
            ${limit ? 'LIMIT ?' : ''}
          `;
          
          // console.log('Executing case-insensitive LIKE search with query:', `%${query}%`, 'limit:', limit || 'none'); // Debug log
          
          const likeParams = limit ? [`%${query}%`, limit] : [`%${query}%`];
          
          this.db.all(likeSql, likeParams, (likeErr, likeRows) => {
            if (likeErr) {
              // console.error('LIKE search also failed:', likeErr);
              reject(likeErr);
            } else {
              // console.log('LIKE search returned', likeRows?.length || 0, 'results'); // Debug log
              // console.log('Sample result:', likeRows?.[0]); // Debug log
              resolve(likeRows || []);
            }
          });
        } else {
          // console.log('FTS search returned', rows?.length || 0, 'results'); // Debug log
          // console.log('Sample result:', rows?.[0]); // Debug log
          resolve(rows || []);
        }
      });
    });
  }

  searchTextStream(query, callback, batchSize = 100) {
    this.ensureInitialized();
    
    const sql = `
      SELECT 
        b.uid, b.text, b.type, b.section_uid, b.paragraph_uid, b.sermon_uid,
        s.title, s.date
      FROM blocks_fts 
      JOIN blocks b ON blocks_fts.rowid = b.rowid
      JOIN sermons s ON b.sermon_uid = s.uid
      WHERE blocks_fts MATCH ?
      ORDER BY s.date DESC, b.sermon_uid, b.paragraph_uid, b.order_index
    `;
    
    let batch = [];
    let totalProcessed = 0;
    
    this.db.each(sql, [query], 
      (err, row) => {
        if (err) {
          callback(err, null, null);
          return;
        }
        
        batch.push(row);
        totalProcessed++;
        
        if (batch.length >= batchSize) {
          callback(null, [...batch], { totalProcessed, isComplete: false });
          batch = [];
        }
      },
      (err, totalRows) => {
        if (err) {
          callback(err, null, null);
          return;
        }
        
        // Send final batch if any remaining
        if (batch.length > 0) {
          callback(null, batch, { totalProcessed, isComplete: true, totalRows });
        } else {
          callback(null, [], { totalProcessed, isComplete: true, totalRows });
        }
      }
    );
  }

  searchByBlockType(query, blockType, limit = null) {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
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
      
      const params = limit ? [blockType, `%${query}%`, limit] : [blockType, `%${query}%`];
      
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
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

    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(sql);
      stmt.all(...params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
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
    return new Promise((resolve, reject) => {
      // First get the target block to find its paragraph
      const getBlockSql = `
        SELECT paragraph_uid, order_index
        FROM blocks 
        WHERE uid = ? AND sermon_uid = ?
      `;
      
      this.db.get(getBlockSql, [blockUid, sermonUid], (err, block) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!block) {
          resolve({ paragraphBlocks: [] });
          return;
        }
        
        // Get all blocks in the same paragraph
        const contextSql = `
          SELECT uid, text, type, order_index, indented
          FROM blocks 
          WHERE paragraph_uid = ? 
          ORDER BY order_index
        `;
        
        this.db.all(contextSql, [block.paragraph_uid], (err, paragraphBlocks) => {
          if (err) {
            reject(err);
          } else {
            resolve({ 
              paragraphBlocks: paragraphBlocks || [],
              targetBlockIndex: paragraphBlocks ? paragraphBlocks.findIndex(b => b.uid === blockUid) : -1
            });
          }
        });
      });
    });
  }

  // Add this method to create indexes for better search performance
  async createIndexes() {
    return new Promise((resolve, reject) => {
      const indexes = [
        // Index for text searches
        `CREATE INDEX IF NOT EXISTS idx_blocks_text ON blocks(text)`,
        
        // Composite index for sermon-based queries
        `CREATE INDEX IF NOT EXISTS idx_blocks_sermon_paragraph_order 
         ON blocks(sermon_uid, paragraph_uid, order_index)`,
        
        // Index for type-based searches
        `CREATE INDEX IF NOT EXISTS idx_blocks_type ON blocks(type)`,
        
        // Index for sermon lookups
        `CREATE INDEX IF NOT EXISTS idx_sermons_date ON sermons(date DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_sermons_uid ON sermons(uid)`,
        
        // Indexes for joins
        `CREATE INDEX IF NOT EXISTS idx_sections_sermon ON sections(sermon_uid, order_index)`,
        `CREATE INDEX IF NOT EXISTS idx_paragraphs_section ON paragraphs(section_uid, order_index)`,
        `CREATE INDEX IF NOT EXISTS idx_blocks_paragraph ON blocks(paragraph_uid, order_index)`
      ];

      let completed = 0;
      const total = indexes.length;

      indexes.forEach(indexSql => {
        this.db.run(indexSql, (err) => {
          if (err) {
            console.error(`Failed to create index: ${err.message}`);
            reject(err);
            return;
          }
          completed++;
          if (completed === total) {
            console.log('All indexes created successfully');
            resolve();
          }
        });
      });
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
