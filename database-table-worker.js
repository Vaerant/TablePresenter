/**
 * Worker thread for sermon database operations.
 * Runs all synchronous better-sqlite3 queries off the main Electron thread
 * so the UI never freezes during heavy DB reads.
 *
 * Key optimisation: sermon data is transferred as JSON *strings* rather than
 * nested objects.  Strings are memcpy'd across the worker/IPC boundaries
 * instead of being deep-cloned via the structured-clone algorithm, making
 * transfers near-instant even for large sermons.
 */
const { parentPort } = require('worker_threads');
const { SermonDatabase } = require('./database-table');

const db = new SermonDatabase();

try {
  db.initialize();
  parentPort.postMessage({ type: 'ready' });
} catch (err) {
  parentPort.postMessage({ type: 'init-error', error: err.message });
  process.exit(1);
}

parentPort.on('message', async ({ id, method, args }) => {
  try {
    // Fast path: return pre-cached JSON string (no structured clone overhead)
    if (method === 'getSermonFast') {
      const json = db.getSermonJson(args[0]);
      parentPort.postMessage({ id, type: 'result', result: json });
      return;
    }

    // Generic method call (works for both sync and async methods)
    const fn = db[method];
    if (typeof fn !== 'function') {
      throw new Error(`Unknown database method: ${method}`);
    }
    const result = await fn.call(db, ...(args || []));
    parentPort.postMessage({ id, type: 'result', result });
  } catch (err) {
    parentPort.postMessage({ id, type: 'error', error: err.message });
  }
});
