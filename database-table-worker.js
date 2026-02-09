/**
 * Worker thread for sermon database operations.
 * Runs all synchronous better-sqlite3 queries off the main Electron thread
 * so the UI never freezes during heavy DB reads.
 */
const { parentPort } = require('worker_threads');
const { SermonDatabase } = require('./database-table');

const db = new SermonDatabase();
const STREAM_CHUNK_SIZE = 3; // sections per chunk when streaming

try {
  db.initialize();
  parentPort.postMessage({ type: 'ready' });
} catch (err) {
  parentPort.postMessage({ type: 'init-error', error: err.message });
  process.exit(1);
}

parentPort.on('message', async ({ id, method, args }) => {
  try {
    // Special streaming method for loading a full sermon in chunks
    if (method === 'loadSermonStreaming') {
      handleStreamingLoad(id, args[0]);
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

/**
 * Loads a sermon in a streaming fashion:
 * 1. Send the lightweight structure (UIDs only, no text) immediately
 * 2. Send section data in small chunks so the main process can forward
 *    each chunk to the renderer without blocking
 */
function handleStreamingLoad(id, uid) {
  const structure = db.getSermonStructure(uid);
  if (!structure) {
    // Sermon not found — signal done with null structure
    parentPort.postMessage({ id, type: 'sermon:structure', data: null, done: true });
    return;
  }

  // Push structure to main process (renderer can start showing title/skeleton)
  parentPort.postMessage({ id, type: 'sermon:structure', data: structure });

  const sectionIds = structure.orderedSectionIds || [];
  if (sectionIds.length === 0) {
    parentPort.postMessage({ id, type: 'sermon:chunk', data: {}, done: true });
    return;
  }

  for (let i = 0; i < sectionIds.length; i += STREAM_CHUNK_SIZE) {
    const batch = sectionIds.slice(i, i + STREAM_CHUNK_SIZE);
    const data = db.getSermonSectionData(uid, batch);
    const done = (i + STREAM_CHUNK_SIZE) >= sectionIds.length;
    parentPort.postMessage({ id, type: 'sermon:chunk', data, done });
  }
}
