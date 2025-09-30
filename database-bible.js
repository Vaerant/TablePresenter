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
          
          this.initialized = true;
          console.log(`Connected to Bible SQLite database: ${dbPath}`);
          resolve();
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
      const sql = `SELECT * FROM book_names ORDER BY id`;
      this.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  searchVerses(query, limit = 50) {
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
        WHERE LOWER(v.text) LIKE LOWER(?)
        ORDER BY v.book, v.chapter, v.verse
        ${limit ? 'LIMIT ?' : ''}
      `;
      
      const params = limit ? [`%${query}%`, limit] : [`%${query}%`];
      
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  searchByBook(query, bookId, limit = 50) {
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
        ${limit ? 'LIMIT ?' : ''}
      `;
      
      const params = limit ? [bookId, `%${query}%`, limit] : [bookId, `%${query}%`];
      
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
}

module.exports = { BibleDatabase };
