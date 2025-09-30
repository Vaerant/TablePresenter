const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');

/**
 * Convert JSON sermon data to SQLite database
 */
class SermonJsonToSqliteConverter {
  constructor(dbPath = './sermon_data/sermons.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  /**
   * Initialize SQLite database and create tables
   */
  async initDatabase() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`Connected to SQLite database: ${this.dbPath}`);
          resolve();
        }
      });
    });
  }

  /**
   * Create database schema
   */
  async createSchema() {
    const schema = `
      -- Sermons table
      CREATE TABLE IF NOT EXISTS sermons (
        id INTEGER PRIMARY KEY,
        uid TEXT UNIQUE NOT NULL,
        title TEXT,
        date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Sections table
      CREATE TABLE IF NOT EXISTS sections (
        uid TEXT PRIMARY KEY,
        sermon_uid TEXT,
        number TEXT,
        order_index INTEGER,
        FOREIGN KEY (sermon_uid) REFERENCES sermons(uid)
      );

      -- Paragraphs table
      CREATE TABLE IF NOT EXISTS paragraphs (
        uid TEXT PRIMARY KEY,
        section_uid TEXT,
        order_index INTEGER,
        FOREIGN KEY (section_uid) REFERENCES sections(uid)
      );

      -- Blocks table (main content)
      CREATE TABLE IF NOT EXISTS blocks (
        uid TEXT PRIMARY KEY,
        paragraph_uid TEXT,
        section_uid TEXT,
        sermon_uid TEXT,
        text TEXT,
        order_index INTEGER,
        type TEXT,
        indented BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (paragraph_uid) REFERENCES paragraphs(uid),
        FOREIGN KEY (section_uid) REFERENCES sections(uid),
        FOREIGN KEY (sermon_uid) REFERENCES sermons(uid)
      );

      -- Italic segments table
      CREATE TABLE IF NOT EXISTS italic_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_uid TEXT,
        text TEXT,
        start_index INTEGER,
        FOREIGN KEY (block_uid) REFERENCES blocks(uid)
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_sermons_uid ON sermons(uid);
      CREATE INDEX IF NOT EXISTS idx_sermons_date ON sermons(date);
      CREATE INDEX IF NOT EXISTS idx_sections_sermon ON sections(sermon_uid);
      CREATE INDEX IF NOT EXISTS idx_paragraphs_section ON paragraphs(section_uid);
      CREATE INDEX IF NOT EXISTS idx_blocks_paragraph ON blocks(paragraph_uid);
      CREATE INDEX IF NOT EXISTS idx_blocks_section ON blocks(section_uid);
      CREATE INDEX IF NOT EXISTS idx_blocks_sermon ON blocks(sermon_uid);
      CREATE INDEX IF NOT EXISTS idx_blocks_text_fts ON blocks(text);
      CREATE INDEX IF NOT EXISTS idx_blocks_type ON blocks(type);
      CREATE INDEX IF NOT EXISTS idx_italic_segments_block ON italic_segments(block_uid);

      -- Full-text search virtual table
      CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
        uid,
        text,
        sermon_uid,
        content='blocks',
        content_rowid='rowid'
      );

      -- Triggers to keep FTS table in sync
      CREATE TRIGGER IF NOT EXISTS blocks_ai AFTER INSERT ON blocks BEGIN
        INSERT INTO blocks_fts(rowid, uid, text, sermon_uid) 
        VALUES (new.rowid, new.uid, new.text, new.sermon_uid);
      END;

      CREATE TRIGGER IF NOT EXISTS blocks_ad AFTER DELETE ON blocks BEGIN
        INSERT INTO blocks_fts(blocks_fts, rowid, uid, text, sermon_uid) 
        VALUES('delete', old.rowid, old.uid, old.text, old.sermon_uid);
      END;

      CREATE TRIGGER IF NOT EXISTS blocks_au AFTER UPDATE ON blocks BEGIN
        INSERT INTO blocks_fts(blocks_fts, rowid, uid, text, sermon_uid) 
        VALUES('delete', old.rowid, old.uid, old.text, old.sermon_uid);
        INSERT INTO blocks_fts(rowid, uid, text, sermon_uid) 
        VALUES (new.rowid, new.uid, new.text, new.sermon_uid);
      END;
    `;

    return new Promise((resolve, reject) => {
      this.db.exec(schema, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database schema created successfully');
          resolve();
        }
      });
    });
  }

  /**
   * Insert sermon data into database
   */
  async insertSermon(sermon) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO sermons (id, uid, title, date)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run([sermon.id, sermon.uid, sermon.title, sermon.date], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });

      stmt.finalize();
    });
  }

  /**
   * Insert section data
   */
  async insertSection(sectionUid, sermonUid, section) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO sections (uid, sermon_uid, number, order_index)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run([sectionUid, sermonUid, section.number, section.order], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });

      stmt.finalize();
    });
  }

  /**
   * Insert paragraph data
   */
  async insertParagraph(paragraphUid, sectionUid, paragraph) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO paragraphs (uid, section_uid, order_index)
        VALUES (?, ?, ?)
      `);

      // Handle missing or undefined paragraph order
      const orderIndex = paragraph && paragraph.order !== undefined ? paragraph.order : 0;

      stmt.run([paragraphUid, sectionUid, orderIndex], function(err) {
        stmt.finalize();
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  /**
   * Insert block data
   */
  async insertBlock(blockUid, paragraphUid, sectionUid, sermonUid, block) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO blocks (uid, paragraph_uid, section_uid, sermon_uid, text, order_index, type, indented)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        blockUid, 
        paragraphUid, 
        sectionUid, 
        sermonUid, 
        block.text, 
        block.order, 
        block.type || null, 
        block.indented || false
      ], function(err) {
        stmt.finalize();
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  /**
   * Insert italic segments
   */
  async insertItalicSegments(blockUid, italicSegments) {
    if (!italicSegments || italicSegments.length === 0) return;

    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO italic_segments (block_uid, text, start_index)
        VALUES (?, ?, ?)
      `);

      let completed = 0;
      let hasError = false;

      for (const segment of italicSegments) {
        stmt.run([blockUid, segment.text, segment.index], (err) => {
          if (err && !hasError) {
            hasError = true;
            stmt.finalize();
            reject(err);
            return;
          }
          completed++;
          if (completed === italicSegments.length) {
            stmt.finalize();
            resolve();
          }
        });
      }
    });
  }

  /**
   * Convert a single sermon from JSON to SQLite
   */
  async convertSermon(sermon) {
    try {
      // Insert sermon
      await this.insertSermon(sermon);

      // Insert sections
      for (const sectionUid of sermon.orderedSectionIds) {
        const section = sermon.sections[sectionUid];
        await this.insertSection(sectionUid, sermon.uid, section);

        // Insert paragraphs
        for (const paragraphUid of section.orderedParagraphIds) {
          const paragraph = section.paragraphs[paragraphUid];
          
          // Add debug logging for problematic paragraphs
          if (!paragraph) {
            console.warn(`Warning: Missing paragraph data for ${paragraphUid} in sermon ${sermon.uid}`);
          }
          
          await this.insertParagraph(paragraphUid, sectionUid, paragraph);

          // Insert blocks - only if paragraph exists and has blocks
          if (paragraph && paragraph.orderedBlockIds) {
            for (const blockUid of paragraph.orderedBlockIds) {
              const block = paragraph.blocks[blockUid];
              
              if (!block) {
                console.warn(`Warning: Missing block data for ${blockUid} in sermon ${sermon.uid}`);
                continue;
              }
              
              await this.insertBlock(blockUid, paragraphUid, sectionUid, sermon.uid, block);

              // Insert italic segments if any
              if (block.italicSegments) {
                await this.insertItalicSegments(blockUid, block.italicSegments);
              }
            }
          }
        }
      }

      console.log(`Converted sermon: ${sermon.title} (${sermon.uid})`);
    } catch (error) {
      console.error(`Error converting sermon ${sermon.uid}:`, error.message);
      console.error(`Sermon structure:`, JSON.stringify({
        uid: sermon.uid,
        title: sermon.title,
        hasSections: !!sermon.sections,
        orderedSectionIds: sermon.orderedSectionIds?.length || 0
      }, null, 2));
      throw error;
    }
  }

  /**
   * Convert all sermons from JSON files to SQLite
   */
  async convertAllSermons(sermonsDir = './sermon_data') {
    try {
      // First, convert individual sermon files
      const files = await fs.readdir(sermonsDir);
      const sermonFiles = files.filter(file => 
        file.endsWith('.json') && 
        file !== 'all_sermons.json' && 
        file !== 'structure.json'
      );

      console.log(`Found ${sermonFiles.length} sermon files to convert`);

      // Process in concurrent batches for much better performance
      const batchSize = 50; // Process 50 files concurrently
      let converted = 0;

      for (let i = 0; i < sermonFiles.length; i += batchSize) {
        const batch = sermonFiles.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(sermonFiles.length/batchSize)} (${batch.length} files)`);
        
        // Begin transaction for the entire batch
        await new Promise((resolve, reject) => {
          this.db.run('BEGIN TRANSACTION', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        try {
          // Load all files in batch concurrently
          const batchPromises = batch.map(async (file) => {
            const filePath = path.join(sermonsDir, file);
            const sermonData = JSON.parse(await fs.readFile(filePath, 'utf-8'));
            return sermonData;
          });

          const batchSermons = await Promise.all(batchPromises);

          // Convert all sermons in batch
          const conversionPromises = batchSermons.map(sermonData => 
            this.convertSermon(sermonData).catch(error => {
              console.error(`Error in batch converting sermon ${sermonData.uid}:`, error.message);
              return null; // Continue with other sermons
            })
          );

          await Promise.all(conversionPromises);
          converted += batch.length;

          // Commit transaction for this batch
          await new Promise((resolve, reject) => {
            this.db.run('COMMIT', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          console.log(`Batch completed: ${converted}/${sermonFiles.length} sermons converted`);

        } catch (error) {
          // Rollback on batch error
          await new Promise((resolve) => {
            this.db.run('ROLLBACK', () => resolve());
          });
          console.error(`Batch failed, rolling back: ${error.message}`);
          throw error;
        }
      }

      console.log(`Successfully converted ${converted} sermons to SQLite`);

      // Generate summary statistics
      await this.generateStatistics();

    } catch (error) {
      throw error;
    }
  }

  /**
   * Convert a single sermon from JSON to SQLite with prepared statements
   */
  async convertSermonOptimized(sermon) {
    try {
      // Use prepared statements for better performance
      const sermonStmt = this.db.prepare(`
        INSERT OR REPLACE INTO sermons (id, uid, title, date)
        VALUES (?, ?, ?, ?)
      `);
      
      const sectionStmt = this.db.prepare(`
        INSERT OR REPLACE INTO sections (uid, sermon_uid, number, order_index)
        VALUES (?, ?, ?, ?)
      `);
      
      const paragraphStmt = this.db.prepare(`
        INSERT OR REPLACE INTO paragraphs (uid, section_uid, order_index)
        VALUES (?, ?, ?)
      `);
      
      const blockStmt = this.db.prepare(`
        INSERT OR REPLACE INTO blocks (uid, paragraph_uid, section_uid, sermon_uid, text, order_index, type, indented)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const italicStmt = this.db.prepare(`
        INSERT INTO italic_segments (block_uid, text, start_index)
        VALUES (?, ?, ?)
      `);

      // Insert sermon
      await new Promise((resolve, reject) => {
        sermonStmt.run([sermon.id, sermon.uid, sermon.title, sermon.date], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });

      // Insert sections, paragraphs, and blocks
      for (const sectionUid of sermon.orderedSectionIds) {
        const section = sermon.sections[sectionUid];
        
        await new Promise((resolve, reject) => {
          sectionStmt.run([sectionUid, sermon.uid, section.number, section.order], function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          });
        });

        // Insert paragraphs
        for (const paragraphUid of section.orderedParagraphIds) {
          const paragraph = section.paragraphs[paragraphUid];
          
          if (!paragraph) {
            console.warn(`Warning: Missing paragraph data for ${paragraphUid} in sermon ${sermon.uid}`);
            continue;
          }
          
          const orderIndex = paragraph && paragraph.order !== undefined ? paragraph.order : 0;
          
          await new Promise((resolve, reject) => {
            paragraphStmt.run([paragraphUid, sectionUid, orderIndex], function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            });
          });

          // Insert blocks
          if (paragraph && paragraph.orderedBlockIds) {
            for (const blockUid of paragraph.orderedBlockIds) {
              const block = paragraph.blocks[blockUid];
              
              if (!block) {
                console.warn(`Warning: Missing block data for ${blockUid} in sermon ${sermon.uid}`);
                continue;
              }
              
              await new Promise((resolve, reject) => {
                blockStmt.run([
                  blockUid, 
                  paragraphUid, 
                  sectionUid, 
                  sermon.uid, 
                  block.text, 
                  block.order, 
                  block.type || null, 
                  block.indented || false
                ], function(err) {
                  if (err) reject(err);
                  else resolve(this.lastID);
                });
              });

              // Insert italic segments if any
              if (block.italicSegments) {
                for (const segment of block.italicSegments) {
                  await new Promise((resolve, reject) => {
                    italicStmt.run([blockUid, segment.text, segment.index], (err) => {
                      if (err) reject(err);
                      else resolve();
                    });
                  });
                }
              }
            }
          }
        }
      }

      // Finalize prepared statements
      sermonStmt.finalize();
      sectionStmt.finalize();
      paragraphStmt.finalize();
      blockStmt.finalize();
      italicStmt.finalize();

    } catch (error) {
      console.error(`Error converting sermon ${sermon.uid}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate and display database statistics
   */
  async generateStatistics() {
    const queries = [
      { name: 'Total Sermons', sql: 'SELECT COUNT(*) as count FROM sermons' },
      { name: 'Total Sections', sql: 'SELECT COUNT(*) as count FROM sections' },
      { name: 'Total Paragraphs', sql: 'SELECT COUNT(*) as count FROM paragraphs' },
      { name: 'Total Blocks', sql: 'SELECT COUNT(*) as count FROM blocks' },
      { name: 'Total Italic Segments', sql: 'SELECT COUNT(*) as count FROM italic_segments' },
      { name: 'Date Range', sql: 'SELECT MIN(date) as earliest, MAX(date) as latest FROM sermons' },
      { name: 'Block Types', sql: 'SELECT type, COUNT(*) as count FROM blocks WHERE type IS NOT NULL GROUP BY type' }
    ];

    console.log('\n=== Database Statistics ===');
    
    for (const query of queries) {
      try {
        const result = await new Promise((resolve, reject) => {
          if (query.name === 'Block Types') {
            this.db.all(query.sql, (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            });
          } else {
            this.db.get(query.sql, (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          }
        });

        if (query.name === 'Block Types') {
          console.log(`${query.name}:`);
          result.forEach(row => {
            console.log(`  ${row.type}: ${row.count}`);
          });
        } else if (query.name === 'Date Range') {
          console.log(`${query.name}: ${result.earliest} to ${result.latest}`);
        } else {
          console.log(`${query.name}: ${result.count || result.earliest || 'N/A'}`);
        }
      } catch (error) {
        console.error(`Error running query ${query.name}:`, error.message);
      }
    }
  }

  /**
   * Close database connection
   */
  async closeDatabase() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database connection closed');
          resolve();
        }
      });
    });
  }
}

/**
 * Main conversion function
 */
async function main() {
  const args = process.argv.slice(2);
  const sermonsDir = args.find(arg => arg.startsWith('--dir='))?.split('=')[1] || './sermon_data';
  const dbPath = args.find(arg => arg.startsWith('--db='))?.split('=')[1] || './sermon_data/sermons.db';

  console.log(`Converting JSON sermons from ${sermonsDir} to SQLite database ${dbPath}`);

  const converter = new SermonJsonToSqliteConverter(dbPath);

  try {
    await converter.initDatabase();
    await converter.createSchema();
    await converter.convertAllSermons(sermonsDir);
    
    console.log('\nConversion completed successfully!');
    console.log(`SQLite database saved to: ${dbPath}`);
    
  } catch (error) {
    console.error('Conversion failed:', error.message);
    console.error(error.stack);
  } finally {
    await converter.closeDatabase();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { SermonJsonToSqliteConverter };
