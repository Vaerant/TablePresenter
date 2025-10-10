const Database = require('better-sqlite3');
const path = require('path');

class BibleDatabase {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.regexSupported = false;
  }

  async initialize() {
    console.log('Initializing Bible database connection...');
    if (this.initialized) return;

    try {
      const dbPath = path.join(__dirname, 'kjv.sqlite');
      console.log('Bible database path:', dbPath);

      // Open database with better-sqlite3
      this.db = new Database(dbPath, { readonly: true });
      
      // Try to load PCRE extension
      try {
        const pcrePath = path.join(__dirname, 'pcre.dll');
        this.db.loadExtension(pcrePath);
        this.regexSupported = true;
        console.log('PCRE extension loaded successfully from:', pcrePath);
      } catch (err) {
        console.warn('PCRE extension not available, using LIKE fallback:', err.message);
        this.regexSupported = false;
      }
      
      this.initialized = true;
      console.log(`Connected to Bible SQLite database: ${dbPath}`);
    } catch (error) {
      console.error('Failed to initialize Bible database:', error);
      throw error;
    }
  }

  getAllBooks() {
    this.ensureInitialized();
    
    const sql = `
      SELECT b.*, v.chapter, COUNT(v.verse) as verses
      FROM book_names b
      JOIN verses v ON b.id = v.book
      GROUP BY b.id, v.chapter
      ORDER BY b.id, v.chapter
    `;
    
    const rows = this.db.prepare(sql).all();
    
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
    
    return Object.values(books);
  }

  // Helper method to remove punctuation from text
  removePunctuation(text) {
    // Remove common punctuation but keep spaces and word characters
    return text.replace(/[.,;:!?'"(){}\[\]\-—–]/g, '');
  }

  // Build whole word regex pattern
  buildWholeWordPattern(query) {
    // Remove punctuation from query
    const cleanQuery = this.removePunctuation(query);
    
    // Escape special regex characters except spaces
    const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Split by spaces and create word boundary pattern
    const words = escaped.split(/\s+/).filter(word => word.length > 0);
    
    if (words.length === 1) {
      // Single word - strict word boundary match
      return `(?i)\\b${words[0]}\\b`;
    } else {
      // Multiple words - each word must have boundaries, connected by any whitespace/punctuation
      const wordPatterns = words.map(word => `\\b${word}\\b`);
      return `(?i)${wordPatterns.join('\\s+.*?\\s+')}`;
    }
  }

  searchVerses(query, limit = 50, offset = 0) {
    this.ensureInitialized();
    
    let sql;
    let params = {};

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
        ${limit ? 'LIMIT @limit' : ''}
        ${offset ? 'OFFSET @offset' : ''}
      `;
      params = { ...sqlParams };
      if (limit) params.limit = limit;
      if (offset) params.offset = offset;
    } else {
      // Simple whole word search (use REGEXP if available, otherwise LIKE)
      const useRegex = this.regexSupported;
      
      if (useRegex) {
        const searchPattern = this.buildWholeWordPattern(query);
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
          WHERE REGEXP_REPLACE(v.text, '[.,;:!?''"(){}\\[\\]\\-—–]', '', 'g') REGEXP @pattern
          ORDER BY v.book, v.chapter, v.verse
          ${limit ? 'LIMIT @limit' : ''}
          ${offset ? 'OFFSET @offset' : ''}
        `;
        params = { pattern: searchPattern };
      } else {
        // Fallback to LIKE for basic search - remove punctuation from both query and text
        const cleanQuery = this.removePunctuation(query);
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
          WHERE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(v.text, 
            ',', ''), '.', ''), ';', ''), ':', ''), '!', ''), '?', ''), '''', ''), '"', ''), '(', ''), ')', ''), '-', '')) 
            LIKE LOWER(@pattern)
          ORDER BY v.book, v.chapter, v.verse
          ${limit ? 'LIMIT @limit' : ''}
          ${offset ? 'OFFSET @offset' : ''}
        `;
        params = { pattern: `%${cleanQuery}%` };
      }
      
      if (limit) params.limit = limit;
      if (offset) params.offset = offset;
    }
    
    const stmt = this.db.prepare(sql);
    return stmt.all(params);
  }

  searchByBook(query, bookId) {
    this.ensureInitialized();
    
    const cleanQuery = this.removePunctuation(query);
    
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
      WHERE v.book = @bookId AND 
        LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(v.text, 
          ',', ''), '.', ''), ';', ''), ':', ''), '!', ''), '?', ''), '''', ''), '"', ''), '(', ''), ')', ''), '-', '')) 
        LIKE LOWER(@pattern)
      ORDER BY v.chapter, v.verse
    `;
    
    const stmt = this.db.prepare(sql);
    return stmt.all({ 
      bookId: bookId, 
      pattern: `%${cleanQuery}%` 
    });
  }

  getChapter(bookId, chapter) {
    this.ensureInitialized();
    
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
      WHERE v.book = @bookId AND v.chapter = @chapter
      ORDER BY v.verse
    `;
    
    const stmt = this.db.prepare(sql);
    return stmt.all({ bookId, chapter });
  }

  getVerse(bookId, chapter, verse) {
    this.ensureInitialized();
    
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
      WHERE v.book = @bookId AND v.chapter = @chapter AND v.verse = @verse
    `;
    
    const stmt = this.db.prepare(sql);
    return stmt.get({ bookId, chapter, verse });
  }

  getBook(bookId) {
    this.ensureInitialized();
    
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
      WHERE v.book = @bookId
      ORDER BY v.chapter, v.verse
    `;
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all({ bookId });
    
    // Transform rows into nested object format
    const bookData = {};
    rows.forEach(row => {
      if (!bookData[row.chapter]) {
        bookData[row.chapter] = {};
      }
      bookData[row.chapter][row.verse] = row;
    });
    
    return bookData;
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
      this.regexSupported = false;
    }
  }

  // Helper method to detect if search contains advanced patterns
  isAdvancedSearch(query) {
    // Check for wildcards, quotes, operators
    return /[*?]|"[^"]*"|AND|OR|NOT|\+|\-/.test(query);
  }

  // Build advanced search SQL with wildcards and operators
  buildAdvancedSearchSQL(query) {
    let conditions = [];
    let params = {};
    let paramCounter = 0;
    
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
      const termConditions = this.processSearchTerm(token, quotedPhrases, paramCounter);
      paramCounter += Object.keys(termConditions.params).length;
      
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
        Object.assign(params, termConditions.params);
      }
      
      currentOperator = 'AND'; // Reset to default
    }
    
    const finalCondition = conditions.length > 0 ? conditions.join(' ') : 'LOWER(v.text) LIKE LOWER(@pattern0)';
    const finalParams = Object.keys(params).length > 0 ? params : { pattern0: `%${query}%` };
    
    return {
      sqlCondition: finalCondition,
      sqlParams: finalParams
    };
  }

  // Process individual search terms with wildcards
  processSearchTerm(term, quotedPhrases, paramOffset) {
    // Restore quoted phrases
    term = term.replace(/__QUOTED_(\d+)__/g, (match, index) => {
      return quotedPhrases[parseInt(index)];
    });
    
    // Remove punctuation from search term
    const cleanTerm = this.removePunctuation(term);
    
    const paramName = `pattern${paramOffset}`;
    
    // Handle multi-word terms with wildcards as a single phrase
    if (cleanTerm.includes(' ') && (cleanTerm.includes('*') || cleanTerm.includes('?'))) {
      // Multi-word phrase with wildcards - treat as single pattern
      if (this.regexSupported) {
        // Convert to regex pattern maintaining word order
        let regexPattern = cleanTerm
          .split(' ')
          .map(word => {
            if (word.includes('*') || word.includes('?')) {
              return word
                .replace(/\*/g, '[a-zA-Z0-9]*')
                .replace(/\?/g, '[a-zA-Z0-9]');
            } else {
              return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
          })
          .join('\\s+.*?\\s+');
        
        regexPattern = `(?i)\\b${regexPattern}\\b`;
        
        return {
          condition: `REGEXP_REPLACE(v.text, '[.,;:!?''"(){}\\[\\]\\-—–]', '', 'g') REGEXP @${paramName}`,
          params: { [paramName]: regexPattern }
        };
      } else {
        // Fallback to LIKE with wildcards converted
        let likePattern = cleanTerm
          .replace(/\*/g, '%')
          .replace(/\?/g, '_');
        
        return {
          condition: `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(v.text, 
            ',', ''), '.', ''), ';', ''), ':', ''), '!', ''), '?', ''), '''', ''), '"', ''), '(', ''), ')', ''), '-', '')) 
            LIKE LOWER(@${paramName})`,
          params: { [paramName]: `%${likePattern}%` }
        };
      }
    }
    // Handle different wildcard patterns
    else if (cleanTerm.includes('*') || cleanTerm.includes('?')) {
      // Convert wildcards to SQL LIKE pattern
      let likePattern = cleanTerm
        .replace(/\*/g, '%')  // * becomes %
        .replace(/\?/g, '_'); // ? becomes _
      
      // For whole words with wildcards, use REGEXP if available
      if (this.regexSupported && cleanTerm.match(/^\w+\*|\*\w+$|\w+\*\w+/)) {
        // Word boundaries with wildcards
        let regexPattern = cleanTerm
          .replace(/\*/g, '[a-zA-Z0-9]*')
          .replace(/\?/g, '[a-zA-Z0-9]');
        regexPattern = `(?i)\\b${regexPattern}\\b`;
        
        return {
          condition: `REGEXP_REPLACE(v.text, '[.,;:!?''"(){}\\[\\]\\-—–]', '', 'g') REGEXP @${paramName}`,
          params: { [paramName]: regexPattern }
        };
      } else {
        return {
          condition: `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(v.text, 
            ',', ''), '.', ''), ';', ''), ':', ''), '!', ''), '?', ''), '''', ''), '"', ''), '(', ''), ')', ''), '-', '')) 
            LIKE LOWER(@${paramName})`,
          params: { [paramName]: likePattern }
        };
      }
    } else {
      // Exact phrase or whole word search
      if (cleanTerm.includes(' ')) {
        // Multi-word phrase
        return {
          condition: `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(v.text, 
            ',', ''), '.', ''), ';', ''), ':', ''), '!', ''), '?', ''), '''', ''), '"', ''), '(', ''), ')', ''), '-', '')) 
            LIKE LOWER(@${paramName})`,
          params: { [paramName]: `%${cleanTerm}%` }
        };
      } else {
        // Single whole word
        if (this.regexSupported) {
          return {
            condition: `REGEXP_REPLACE(v.text, '[.,;:!?''"(){}\\[\\]\\-—–]', '', 'g') REGEXP @${paramName}`,
            params: { [paramName]: `(?i)\\b${cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b` }
          };
        } else {
          return {
            condition: `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(v.text, 
              ',', ''), '.', ''), ';', ''), ':', ''), '!', ''), '?', ''), '''', ''), '"', ''), '(', ''), ')', ''), '-', '')) 
              LIKE LOWER(@${paramName})`,
            params: { [paramName]: `%${cleanTerm}%` }
          };
        }
      }
    }
  }
}

module.exports = { BibleDatabase };