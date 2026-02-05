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

  // Load individual sermon structure (converted from blocks)
  async loadSermon(uid) {
    try {
      await this.initialize();
      
      const sermon = await window.electronAPI.database.getSermon(uid);
      
      if (!sermon) return null;

      // The sermon already contains all blocks in its hierarchical structure
      // Build blockIndex for compatibility if needed
      const sermonStructure = {
        ...sermon,
        blockIndex: {}
      };

      // Extract blocks from the hierarchical structure if you need the flat blockIndex
      Object.values(sermon.sections).forEach(section => {
        Object.entries(section.paragraphs).forEach(([paragraphId, paragraph]) => {
          Object.entries(paragraph.blocks).forEach(([blockId, block]) => {
            sermonStructure.blockIndex[blockId] = {
              text: block.text,
              type: block.type,
              sectionId: section.uid || Object.keys(sermon.sections).find(sId => sermon.sections[sId] === section),
              paragraphId: paragraphId,
              order: block.order,
              indented: block.indented
            };
          });
        });
      });

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