const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class BibleDatabase {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async initialize() {
    console.log('Initializing Bible database connection...');
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      try {
        const dbPath = path.join(__dirname, 'kjv.sqlite');
        console.log('Bible database path:', dbPath);

        this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            console.error('Failed to initialize Bible database:', err);
            reject(err);
            return;
          }
          
          // Load PCRE extension for REGEXP support
          this.db.loadExtension('sqlite3-pcre', (err) => {
            if (err) {
              console.warn('REGEXP extension not available, using LIKE fallback:', err.message);
            } else {
              console.log('REGEXP extension loaded successfully');
            }
            
            this.initialized = true;
            console.log(`Connected to Bible SQLite database: ${dbPath}`);
            resolve();
          });
        });
      } catch (error) {
        console.error('Failed to initialize Bible database:', error);
        reject(error);
      }
    });
  }

  getAllBooks() {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT b.*, v.chapter, COUNT(v.verse) as verses
        FROM book_names b
        JOIN verses v ON b.id = v.book
        GROUP BY b.id, v.chapter
        ORDER BY b.id, v.chapter
      `;
      this.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else {
          // Transform rows into nested object format per book
          const books = {};
          rows.forEach(row => {
            if (!books[row.id]) {
              books[row.id] = {
                id: row.id,
                name: row.name,
                short_name: row.short_name,
                chapters: {}
              };
            }
            books[row.id].chapters[row.chapter] = row.verses;
          });
          resolve(Object.values(books));
        }
      });
    });
  }

  searchVerses(query, limit = 50, offset = 0) {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      let sql;
      let searchPattern;
      let params;

      // Detect search type and prepare appropriate SQL
      if (this.isAdvancedSearch(query)) {
        // Advanced search with wildcards and operators
        const { sqlCondition, sqlParams } = this.buildAdvancedSearchSQL(query);
        sql = `
          SELECT 
            v.id,
            v.book,
            v.chapter,
            v.verse,
            v.text,
            b.name as book_name,
            b.short_name
          FROM verses v
          JOIN book_names b ON v.book = b.id
          WHERE ${sqlCondition}
          ORDER BY v.book, v.chapter, v.verse
          ${limit ? 'LIMIT ?' : ''}
          ${offset ? 'OFFSET ?' : ''}
        `;
        params = [];
        if (limit) params.push(...sqlParams, limit);
        if (offset) params.push(offset);
        if (!limit && offset) params = [...sqlParams, offset];
        if (!limit && !offset) params = sqlParams;
      } else {
        // Simple whole word search (default behavior)
        searchPattern = this.buildWholeWordPattern(query);
        sql = `
          SELECT 
            v.id,
            v.book,
            v.chapter,
            v.verse,
            v.text,
            b.name as book_name,
            b.short_name
          FROM verses v
          JOIN book_names b ON v.book = b.id
          WHERE v.text REGEXP ?
          ORDER BY v.book, v.chapter, v.verse
          ${limit ? 'LIMIT ?' : ''}
          ${offset ? 'OFFSET ?' : ''}
        `;
        params = [searchPattern];
        if (limit) params.push(limit);
        if (offset) params.push(offset);
      }
      
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  searchByBook(query, bookId) {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          v.id,
          v.book,
          v.chapter,
          v.verse,
          v.text,
          b.name as book_name,
          b.short_name
        FROM verses v
        JOIN book_names b ON v.book = b.id
        WHERE v.book = ? AND LOWER(v.text) LIKE LOWER(?)
        ORDER BY v.chapter, v.verse
      `;
      
      const params = [bookId, `%${query}%`];
      
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  getChapter(bookId, chapter) {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          v.id,
          v.book,
          v.chapter,
          v.verse,
          v.text,
          b.name as book_name,
          b.short_name
        FROM verses v
        JOIN book_names b ON v.book = b.id
        WHERE v.book = ? AND v.chapter = ?
        ORDER BY v.verse
      `;
      
      this.db.all(sql, [bookId, chapter], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  getVerse(bookId, chapter, verse) {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          v.id,
          v.book,
          v.chapter,
          v.verse,
          v.text,
          b.name as book_name,
          b.short_name
        FROM verses v
        JOIN book_names b ON v.book = b.id
        WHERE v.book = ? AND v.chapter = ? AND v.verse = ?
      `;
      
      this.db.get(sql, [bookId, chapter, verse], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  getBook(bookId) {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          v.id,
          v.book,
          v.chapter,
          v.verse,
          v.text,
          b.name as book_name,
          b.short_name
        FROM verses v
        JOIN book_names b ON v.book = b.id
        WHERE v.book = ?
        ORDER BY v.chapter, v.verse
      `;
      
      this.db.all(sql, [bookId], (err, rows) => {
        if (err) reject(err);
        else {
          // Transform rows into nested object format
          const bookData = {};
          rows.forEach(row => {
            if (!bookData[row.chapter]) {
              bookData[row.chapter] = {};
            }
            bookData[row.chapter][row.verse] = row;
          });
          resolve(bookData);
        }
      });
    });
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Bible database not initialized. Call initialize() first.');
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  // Helper method to detect if search contains advanced patterns
  isAdvancedSearch(query) {
    // Check for wildcards, quotes, operators
    return /[*?]|"[^"]*"|AND|OR|NOT|\+|\-/.test(query);
  }

  // Build whole word regex pattern
  buildWholeWordPattern(query) {
    // Escape special regex characters except spaces
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Split by spaces and create word boundary pattern
    const words = escaped.split(/\s+/).filter(word => word.length > 0);
    const wordPatterns = words.map(word => `\\b${word}\\b`);
    return `(?i).*${wordPatterns.join('.*')}.*`;
  }

  // Build advanced search SQL with wildcards and operators
  buildAdvancedSearchSQL(query) {
    let conditions = [];
    let params = [];
    
    // Handle quoted phrases first
    const quotedPhrases = [];
    let processedQuery = query.replace(/"([^"]+)"/g, (match, phrase) => {
      quotedPhrases.push(phrase);
      return `__QUOTED_${quotedPhrases.length - 1}__`;
    });
    
    // Split by AND/OR operators while preserving them
    const tokens = processedQuery.split(/\s+(AND|OR|NOT)\s+/i);
    let currentOperator = 'AND';
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].trim();
      
      if (['AND', 'OR', 'NOT'].includes(token.toUpperCase())) {
        currentOperator = token.toUpperCase();
        continue;
      }
      
      if (token.length === 0) continue;
      
      // Process individual search terms
      const termConditions = this.processSearchTerm(token, quotedPhrases);
      
      if (termConditions.condition) {
        if (conditions.length > 0) {
          if (currentOperator === 'NOT') {
            conditions.push(`AND NOT (${termConditions.condition})`);
          } else {
            conditions.push(`${currentOperator} (${termConditions.condition})`);
          }
        } else {
          if (currentOperator === 'NOT') {
            conditions.push(`NOT (${termConditions.condition})`);
          } else {
            conditions.push(`(${termConditions.condition})`);
          }
        }
        params.push(...termConditions.params);
      }
      
      currentOperator = 'AND'; // Reset to default
    }
    
    const finalCondition = conditions.length > 0 ? conditions.join(' ') : 'v.text LIKE ?';
    const finalParams = params.length > 0 ? params : [`%${query}%`];
    
    return {
      sqlCondition: finalCondition,
      sqlParams: finalParams
    };
  }

  // Process individual search terms with wildcards
  processSearchTerm(term, quotedPhrases) {
    // Restore quoted phrases
    term = term.replace(/__QUOTED_(\d+)__/g, (match, index) => {
      return quotedPhrases[parseInt(index)];
    });
    
    // Handle different wildcard patterns
    if (term.includes('*') || term.includes('?')) {
      // Convert wildcards to SQL LIKE pattern
      let likePattern = term
        .replace(/\*/g, '%')  // * becomes %
        .replace(/\?/g, '_'); // ? becomes _
      
      // For whole words with wildcards, we need REGEXP
      if (term.match(/^\w+\*|\*\w+$|\w+\*\w+/)) {
        // Word boundaries with wildcards
        let regexPattern = term
          .replace(/\*/g, '[a-zA-Z0-9]*')
          .replace(/\?/g, '[a-zA-Z0-9]');
        regexPattern = `(?i)\\b${regexPattern}\\b`;
        
        return {
          condition: 'v.text REGEXP ?',
          params: [regexPattern]
        };
      } else {
        return {
          condition: 'LOWER(v.text) LIKE LOWER(?)',
          params: [likePattern]
        };
      }
    } else {
      // Exact phrase or whole word search
      if (term.includes(' ')) {
        // Multi-word phrase
        return {
          condition: 'LOWER(v.text) LIKE LOWER(?)',
          params: [`%${term}%`]
        };
      } else {
        // Single whole word
        return {
          condition: 'v.text REGEXP ?',
          params: [`(?i)\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`]
        };
      }
    }
  }
}

module.exports = { BibleDatabase };
