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
  async search(query, limit = 50, type = 'phrase', sermonUid = null) {
    await this.initialize();
    let preparedQuery = query?.trim() || '';

    const results = await window.electronAPI.database.search(preparedQuery, limit, type, sermonUid);
    return results.map(result => ({
      uid: result.uid,
      text: result.text,
      type: result.type,
      section_uid: result.section_uid,
      paragraph_uid: result.paragraph_uid,
      sermon_uid: result.sermon_uid,
      title: result.title,
      date: result.date
    }));
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