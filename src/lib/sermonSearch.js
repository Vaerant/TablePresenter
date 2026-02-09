export class SermonSearchEngine {
  constructor() {
    this.initialized = false;
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
   * Load a full sermon in a single call.
   * The DB query runs in a worker thread so it never blocks the UI.
   */
  async loadSermon(uid) {
    try {
      await this.initialize();

      const sermon = await window.electronAPI.database.getSermonFull(uid);
      if (!sermon) return null;

      // Build flat blockIndex for compatibility
      const sermonStructure = { ...sermon, blockIndex: {} };

      for (const [sectionId, section] of Object.entries(sermon.sections || {})) {
        for (const [paragraphId, paragraph] of Object.entries(section.paragraphs || {})) {
          for (const [blockId, block] of Object.entries(paragraph.blocks || {})) {
            sermonStructure.blockIndex[blockId] = {
              text: block.text,
              type: block.type,
              sectionId,
              paragraphId,
              order: block.order,
              indented: block.indented
            };
          }
        }
      }

      return sermonStructure;
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