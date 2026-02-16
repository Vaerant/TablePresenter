const express = require('express');

const { SystemDatabase } = require('./api/database-system');
const { BibleDatabase } = require('./api/database-bible');
const { SermonDatabase } = require('./api/database-table');

const createSystemRoutes = require('./api/routes/system/routes');
const createBibleRoutes = require('./api/routes/bible/routes');
const createTableRoutes = require('./api/routes/table/routes');

const systemDb = new SystemDatabase();
const bibleDb = new BibleDatabase();
const sermonDb = new SermonDatabase();

async function startServer() {
  await systemDb.initialize();
  await bibleDb.initialize();
  sermonDb.initialize();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/system', createSystemRoutes(systemDb));
  app.use('/api/bible', createBibleRoutes(bibleDb));
  app.use('/api/message', createTableRoutes(sermonDb));

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Server error' });
  });

  const port = Number(process.env.PORT) || 3001;
  app.listen(port, () => {
    console.log(`Express server listening on port ${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
