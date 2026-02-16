const express = require('express');

function parseIntOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => String(item).split(',')).map((item) => item.trim()).filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function createTableRoutes(db) {
  const router = express.Router();

  router.get('/sermons', (req, res) => {
    res.json(db.getAllSermons());
  });

  router.get('/sermon-summaries', (req, res) => {
    res.json(db.getSermonSummaries());
  });

  router.get('/sermons/:uid', (req, res) => {
    const sermon = db.getSermon(req.params.uid);
    if (!sermon) return res.status(404).json({ error: 'Sermon not found' });
    return res.json(sermon);
  });

  router.get('/blocks', (req, res) => {
    const uids = parseList(req.query.uids);
    if (uids.length === 0) return res.status(400).json({ error: 'uids is required' });
    return res.json(db.getBlocksByUids(uids));
  });

  router.get('/paragraphs', (req, res) => {
    const blockUids = parseList(req.query.blockUids);
    if (blockUids.length === 0) return res.status(400).json({ error: 'blockUids is required' });
    return res.json(db.getParagraphsByBlockUids(blockUids));
  });

  router.post('/search', asyncHandler(async (req, res) => {
    const query = String(req.body.query || '').trim();
    if (!query) return res.status(400).json({ error: 'query is required' });

    const limit = parseIntOrNull(req.body.limit) ?? 20;
    const page = parseIntOrNull(req.body.page) ?? 1;
    const type = String(req.body.type || 'general');
    const sermonUid = req.body.sermonUid ? String(req.body.sermonUid) : null;

    const result = await db.search(query, limit, type, sermonUid, page);
    return res.json(result);
  }));

  return router;
}

module.exports = createTableRoutes;
