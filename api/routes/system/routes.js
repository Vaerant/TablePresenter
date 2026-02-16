const express = require('express');

function parseIntOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function createSystemRoutes(db) {
  const router = express.Router();

  router.get('/screens', (req, res) => {
    res.json(db.getAllScreens());
  });

  router.get('/screens/:id', (req, res) => {
    const id = parseIntOrNull(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid screen id' });
    const screen = db.getScreen(id);
    if (!screen) return res.status(404).json({ error: 'Screen not found' });
    return res.json(screen);
  });

  router.post('/screens', (req, res) => {
    const { screen_name, resolution, aspect_ratio } = req.body || {};
    if (!screen_name || !resolution || !aspect_ratio) {
      return res.status(400).json({ error: 'screen_name, resolution, and aspect_ratio are required' });
    }
    const created = db.createScreen({ screen_name, resolution, aspect_ratio });
    return res.status(201).json(created);
  });

  router.put('/screens/:id', (req, res) => {
    const id = parseIntOrNull(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid screen id' });

    const { screen_name, resolution, aspect_ratio } = req.body || {};
    if (!screen_name || !resolution || !aspect_ratio) {
      return res.status(400).json({ error: 'screen_name, resolution, and aspect_ratio are required' });
    }

    const updated = db.updateScreen(id, { screen_name, resolution, aspect_ratio });
    return res.json(updated);
  });

  router.delete('/screens/:id', (req, res) => {
    const id = parseIntOrNull(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid screen id' });
    db.deleteScreen(id);
    return res.status(204).send();
  });

  router.get('/screens/:id/spaces', (req, res) => {
    const id = parseIntOrNull(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid screen id' });
    return res.json(db.getScreenSpaces(id));
  });

  router.post('/spaces', (req, res, next) => {
    try {
      const spaceData = req.body || {};
      if (!spaceData.screen_id) {
        return res.status(400).json({ error: 'screen_id is required' });
      }
      const created = db.createScreenSpace(spaceData);
      return res.status(201).json(created);
    } catch (err) {
      return next(err);
    }
  });

  router.put('/spaces/:id', (req, res, next) => {
    try {
      const id = parseIntOrNull(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid space id' });
      const updated = db.updateScreenSpace(id, req.body || {});
      return res.json(updated);
    } catch (err) {
      return next(err);
    }
  });

  router.delete('/spaces/:id', (req, res, next) => {
    try {
      const id = parseIntOrNull(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid space id' });
      db.deleteScreenSpace(id);
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  router.put('/spaces/:id/settings', (req, res, next) => {
    try {
      const id = parseIntOrNull(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid space id' });
      const updated = db.updateScreenSpaceSettings(id, req.body || {});
      return res.json(updated);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = createSystemRoutes;
