export class SermonSearchEngine {
  constructor() {
    this.initialized = false;
    this._loadId = 0; // Incremented per loadSermon call for stale-load detection
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
    return window.electronAPI.database.getAllSermons();
  }

  /**
   * Load a sermon via streaming: the backend worker thread pushes
   * the skeleton structure first, then section-data chunks via events.
   * This avoids multiple IPC round-trips and keeps the main process free.
   *
   * @param {string}   uid          Sermon UID
   * @param {Function} [onProgress] Optional callback invoked after each chunk
   *                                with a shallow copy of the sermon-so-far.
   */
  async loadSermon(uid, onProgress = null) {
    const loadId = ++this._loadId;

    try {
      await this.initialize();

      return await new Promise((resolve, reject) => {
        let sermon = null;
        let resolved = false;
        let removeStructure, removeChunk;

        const cleanup = () => {
          if (removeStructure) removeStructure();
          if (removeChunk) removeChunk();
        };

        const finish = (value) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          resolve(value);
        };

        const isStale = () => this._loadId !== loadId;

        // --- Listen for the skeleton structure ---
        removeStructure = window.electronAPI.database.onSermonStructure(({ uid: sUid, structure }) => {
          if (sUid !== uid) return;
          if (isStale()) { cleanup(); return; }

          if (!structure) {
            finish(null);
            return;
          }
          sermon = { ...structure, blockIndex: {} };
          if (onProgress) onProgress({ ...sermon });
        });

        // --- Listen for section-data chunks ---
        removeChunk = window.electronAPI.database.onSermonChunk(({ uid: cUid, data, done }) => {
          if (cUid !== uid || !sermon) return;
          if (isStale()) { if (done) cleanup(); return; }

          // Merge chunk data into the sermon
          for (const [sectionUid, sectionData] of Object.entries(data || {})) {
            const sec = sermon.sections[sectionUid];
            if (!sec) continue;
            for (const [parId, parData] of Object.entries(sectionData.paragraphs || {})) {
              if (sec.paragraphs[parId]) {
                sec.paragraphs[parId].blocks = parData.blocks;
                sec.paragraphs[parId].orderedBlockIds = parData.orderedBlockIds;

                // Build flat blockIndex entries
                for (const [blockId, block] of Object.entries(parData.blocks || {})) {
                  sermon.blockIndex[blockId] = {
                    text: block.text,
                    type: block.type,
                    sectionId: sectionUid,
                    paragraphId: parId,
                    order: block.order,
                    indented: block.indented
                  };
                }
              }
            }
          }

          if (onProgress) onProgress({ ...sermon });

          if (done) {
            finish(sermon);
          }
        });

        // Kick off the streaming load (main process forwards worker events)
        window.electronAPI.database.loadSermonStreaming(uid).catch((err) => {
          if (!resolved) {
            cleanup();
            reject(err);
          }
        });

        // Safety timeout: resolve with null if no response in 15 s
        setTimeout(() => finish(null), 15000);
      });
    } catch (error) {
      console.error(`Failed to load sermon ${uid}:`, error);
      return null;
    }
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