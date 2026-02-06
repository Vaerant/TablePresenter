export class SermonSearchEngine {
  constructor() {
    this.initialized = false;
    this._activeStreamCancel = null;
  }

  async initialize() {
    if (this.initialized) return;
    
    // Check if running in Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      this.isElectron = true;
      this.initialized = true;
    }
  }

  async getSermons() {
    await this.initialize();
    if (!window?.electronAPI?.database?.getAllSermons) return [];
    return window.electronAPI.database.getAllSermons();
  }

  // Load individual sermon structure
  async loadSermon(uid) {
    try {
      await this.initialize();
      if (!window?.electronAPI?.database?.getSermon) return null;

      // Prefer streaming (reduces renderer lag on huge sermons)
      if (window?.electronAPI?.database?.startSermonStream) {
        const { promise } = this.streamSermon(uid);
        const sermon = await promise;
        return sermon;
      }

      // Fallback to one-shot IPC
      const sermon = await window.electronAPI.database.getSermon(uid);
      return sermon || null;
    } catch (error) {
      console.error(`Failed to load sermon ${uid}:`, error);
      return null;
    }
  }

  /**
   * Stream a sermon in chunks (paragraph batches).
   * 
   * Events (from main):
   * - db:sermonStreamStart { requestId, sermon, totalParagraphs }
   * - db:sermonStreamChunk { requestId, sectionId, paragraphIds, paragraphs, sentParagraphs, totalParagraphs }
   * - db:sermonStreamDone  { requestId }
   * - db:sermonStreamError { requestId, message }
   */
  streamSermon(uid, { paragraphBatchSize = 25, onUpdate } = {}) {
    // Cancel any in-flight stream started by this instance.
    if (typeof this._activeStreamCancel === 'function') {
      this._activeStreamCancel();
      this._activeStreamCancel = null;
    }

    let settled = false;
    let requestId = null;
    let sermon = null;

    const listeners = [];
    const addListener = (channel, fn) => {
      window.electronAPI.on(channel, fn);
      listeners.push([channel, fn]);
    };
    const removeAllListeners = () => {
      for (const [channel, fn] of listeners) {
        window.electronAPI.off(channel, fn);
      }
      listeners.length = 0;
    };

    const cancel = async () => {
      if (settled) return;
      settled = true;
      removeAllListeners();
      if (requestId && window?.electronAPI?.database?.cancelSermonStream) {
        try {
          await window.electronAPI.database.cancelSermonStream(requestId);
        } catch {
          // ignore
        }
      }
    };

    this._activeStreamCancel = cancel;

    const promise = new Promise(async (resolve, reject) => {
      try {
        await this.initialize();
        if (!window?.electronAPI?.database?.startSermonStream) {
          throw new Error('Sermon streaming API not available');
        }

        // Register listeners BEFORE starting the stream to avoid missing early events.

        const safeUpdate = (delta) => {
          if (typeof onUpdate === 'function' && sermon) {
            // Pass the current sermon plus a small delta so renderers can update incrementally.
            onUpdate(sermon, delta);
          }
        };

        addListener('db:sermonStreamStart', (_event, payload) => {
          if (settled) return;
          if (!payload) return;
          // requestId is assigned after invoke resolves; ignore other streams.
          if (requestId && payload.requestId !== requestId) return;
          sermon = payload.sermon;
          // Build blockIndex incrementally in renderer as chunks arrive.
          if (!sermon.blockIndex) sermon.blockIndex = {};
          sermon.__stream = {
            totalParagraphs: payload.totalParagraphs ?? null,
            sentParagraphs: 0,
          };
          safeUpdate({ type: 'start' });
        });

        addListener('db:sermonStreamChunk', (_event, payload) => {
          if (settled) return;
          if (!payload) return;
          if (requestId && payload.requestId !== requestId) return;

          // If we somehow missed the start event, initialize sermon shell from chunk.
          if (!sermon && payload.sermon) {
            sermon = payload.sermon;
            if (!sermon.blockIndex) sermon.blockIndex = {};
          }
          if (!sermon) return;

          // New sections may be introduced dynamically.
          if (!sermon.sections) sermon.sections = {};
          if (!Array.isArray(sermon.orderedSectionIds)) sermon.orderedSectionIds = [];

          if (payload.sections && typeof payload.sections === 'object') {
            for (const [sid, meta] of Object.entries(payload.sections)) {
              if (!sermon.sections[sid]) {
                sermon.sections[sid] = {
                  number: meta.number,
                  order: meta.order,
                  orderedParagraphIds: [],
                  paragraphs: {},
                };
              }
              if (!sermon.orderedSectionIds.includes(sid)) {
                sermon.orderedSectionIds.push(sid);
              }
            }
          }

          const { sectionId, paragraphs } = payload;
          const section = sermon.sections?.[sectionId];
          if (!section) return;

          if (!section.paragraphs) section.paragraphs = {};
          if (!Array.isArray(section.orderedParagraphIds)) section.orderedParagraphIds = [];

          for (const [pid, paragraph] of Object.entries(paragraphs || {})) {
            section.paragraphs[pid] = paragraph;
            if (!section.orderedParagraphIds.includes(pid)) section.orderedParagraphIds.push(pid);
            // Incremental blockIndex
            const orderedBlockIds = paragraph?.orderedBlockIds || [];
            for (const bid of orderedBlockIds) {
              const b = paragraph?.blocks?.[bid];
              if (!b) continue;
              sermon.blockIndex[bid] = {
                text: b.text,
                type: b.type,
                sectionId,
                paragraphId: pid,
                order: b.order,
                indented: !!b.indented,
              };
            }
          }

          if (!sermon.__stream) sermon.__stream = {};
          sermon.__stream.sentParagraphs = payload.sentParagraphs ?? sermon.__stream.sentParagraphs;
          sermon.__stream.totalParagraphs = payload.totalParagraphs ?? sermon.__stream.totalParagraphs;

          safeUpdate({
            type: 'chunk',
            sectionId,
            paragraphIds: Array.isArray(payload.paragraphIds)
              ? payload.paragraphIds
              : Object.keys(paragraphs || {}),
            sentParagraphs: sermon.__stream.sentParagraphs,
            totalParagraphs: sermon.__stream.totalParagraphs,
          });
        });

        addListener('db:sermonStreamDone', (_event, payload) => {
          if (settled) return;
          if (!payload) return;
          if (requestId && payload.requestId !== requestId) return;
          settled = true;
          removeAllListeners();
          resolve(sermon);
        });

        addListener('db:sermonStreamError', (_event, payload) => {
          if (settled) return;
          if (!payload) return;
          if (requestId && payload.requestId !== requestId) return;
          settled = true;
          removeAllListeners();
          reject(new Error(payload.message || 'Unknown streaming error'));
        });

        const startResp = await window.electronAPI.database.startSermonStream(uid, {
          paragraphBatchSize,
        });
        requestId = startResp?.requestId;
        if (!requestId) throw new Error('Failed to start sermon stream (no requestId)');
      } catch (err) {
        if (!settled) {
          settled = true;
          removeAllListeners();
        }
        reject(err);
      }
    });

    return { promise, cancel };
  }

  // Basic text search - return raw results for easier processing
  async search(query, limit = 50, type = 'phrase', sermonUid = null, page = 1) {
    await this.initialize();
    let preparedQuery = query?.trim() || '';

    const resp = await window.electronAPI.database.search(preparedQuery, limit, type, sermonUid, page);
    const rows = resp?.data || [];
    const data = rows.map(result => ({
      uid: result.uid,
      paragraph_uid: result.uid || result.paragraph_uid,
      section_uid: result.section_uid,
      sermon_uid: result.sermon_uid,
      section_number: result.section_number,
      text: result.paragraph_text ?? result.text ?? '',
      paragraph_text: result.paragraph_text,
      rank: result.rank,
      distance: result.distance,
      block_uid: result.block_uid,
      title: result.sermon_title ?? result.title,
      sermon_title: result.sermon_title,
      date: result.sermon_date ?? result.date,
      sermon_date: result.sermon_date,
    }));

    return { data, pagination: resp?.pagination || null };
  }

  // Back-compat name used by SearchModal and API routes.
  // Returns { data, pagination }.
  async searchText(query, limit = 50, searchMode = 'phrase', sermonUid = null, page = 1) {
    const type = (searchMode === 'general' || searchMode === 'phrase' || searchMode === 'similar')
      ? searchMode
      : 'phrase';
    return this.search(query, limit, type, sermonUid, page);
  }

  // 2. Search by sermon metadata using SQLite
  async searchSermons(filters = {}) {
    await this.initialize();
    
    if (this.isElectron) {
      return window.electronAPI.database.searchSermons(filters);
    }
    return this.database.searchSermons(filters);
  }
}

// Export singleton instance
export const sermonSearch = new SermonSearchEngine();