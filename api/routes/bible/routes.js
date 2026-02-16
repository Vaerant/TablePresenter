const express = require('express');

function parseIntOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function createBibleRoutes(db) {
  const router = express.Router();

  router.get('/books', (req, res) => {
    res.json(db.getAllBooks());
  });

  router.get('/books/:bookId', (req, res) => {
    const bookId = parseIntOrNull(req.params.bookId);
    if (!bookId) return res.status(400).json({ error: 'Invalid book id' });
    return res.json(db.getBook(bookId));
  });

  router.get('/books/:bookId/chapters/:chapter', (req, res) => {
    const bookId = parseIntOrNull(req.params.bookId);
    const chapter = parseIntOrNull(req.params.chapter);
    if (!bookId || !chapter) return res.status(400).json({ error: 'Invalid book id or chapter' });
    return res.json(db.getChapter(bookId, chapter));
  });

  router.get('/books/:bookId/chapters/:chapter/verses/:verse', (req, res) => {
    const bookId = parseIntOrNull(req.params.bookId);
    const chapter = parseIntOrNull(req.params.chapter);
    const verse = parseIntOrNull(req.params.verse);
    if (!bookId || !chapter || !verse) return res.status(400).json({ error: 'Invalid book id, chapter, or verse' });

    const row = db.getVerse(bookId, chapter, verse);
    if (!row) return res.status(404).json({ error: 'Verse not found' });
    return res.json(row);
  });

  router.get('/search', (req, res) => {
    const query = String(req.query.query || '').trim();
    if (!query) return res.status(400).json({ error: 'query is required' });

    const limit = parseIntOrNull(req.query.limit) || 50;
    const offset = parseIntOrNull(req.query.offset) || 0;
    const bookId = parseIntOrNull(req.query.bookId);

    const results = bookId
      ? db.searchByBook(query, bookId)
      : db.searchVerses(query, limit, offset);

    return res.json(results);
  });

  return router;
}

module.exports = createBibleRoutes;
