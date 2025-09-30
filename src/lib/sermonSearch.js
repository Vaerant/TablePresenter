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
      
      let sermon, blocks;
      
      sermon = await window.electronAPI.database.getSermon(uid);
      blocks = await window.electronAPI.database.getSermonBlocks(uid);
      
      if (!sermon) return null;

      // Build sermon structure similar to original JSON format
      const sermonStructure = {
        ...sermon,
        blockIndex: {}
      };

      // Create blockIndex for compatibility
      blocks.forEach(block => {
        sermonStructure.blockIndex[block.uid] = {
          text: block.text,
          type: block.type,
          sectionId: block.section_uid,
          paragraphId: block.paragraph_uid,
          order: block.order_index,
          indented: block.indented
        };
      });

      return sermonStructure;
    } catch (error) {
      console.error(`Failed to load sermon ${uid}:`, error);
      return null;
    }
  }

  // Basic text search - return raw results for easier processing
  async searchText(query, limit = null) {
    await this.initialize();
    
    // Get raw search results from database
    const results = await window.electronAPI.database.searchText(query, limit);
    
    // Return results directly with all the database fields
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

  // 3. Advanced phrase search (using FTS5 phrase syntax)
  async searchPhrase(phrase, options = {}) {
    await this.initialize();
    
    const {
      exactPhrase = false,
      limit = 50
    } = options;

    // Use FTS5 phrase syntax for exact phrases
    const ftsQuery = exactPhrase ? `"${phrase}"` : phrase;
    
    return this.searchText(ftsQuery, { limit, includeContext: true });
  }

  // 4. Multi-term search with boolean operators (using FTS5 syntax)
  async searchBoolean(query, options = {}) {
    await this.initialize();
    
    const { limit = 50 } = options;
    
    // Convert simple boolean syntax to FTS5 syntax
    const ftsQuery = this.convertToFtsQuery(query);
    
    return this.searchText(ftsQuery, { limit, includeContext: true });
  }

  // 5. Search within specific block types using SQLite
  async searchByBlockType(query, blockType, options = {}) {
    await this.initialize();
    
    const { limit = null } = options;
    
    let results;
    results = await window.electronAPI.database.searchByBlockType(query, blockType, limit);

    // Group results by sermon
    const groupedResults = new Map();
    
    for (const result of results) {
      if (!groupedResults.has(result.sermon_uid)) {
        groupedResults.set(result.sermon_uid, {
          sermon: {
            uid: result.sermon_uid,
            title: result.title,
            date: result.date
          },
          matches: [],
          totalMatches: 0
        });
      }
      
      groupedResults.get(result.sermon_uid).matches.push({
        blockId: result.uid,
        text: result.text,
        type: result.type,
        sectionId: result.section_uid,
        paragraphId: result.paragraph_uid,
        context: await this.getBlockContext(result.sermon_uid, result.uid)
      });
      
      groupedResults.get(result.sermon_uid).totalMatches++;
    }

    return Array.from(groupedResults.values())
      .sort((a, b) => b.totalMatches - a.totalMatches);
  }

  // 6. Get sermon statistics using SQLite
  async getSermonStats(uid) {
    await this.initialize();
    
    if (this.isElectron) {
      return window.electronAPI.database.getSermonStats(uid);
    }
    return this.database.getSermonStats(uid);
  }

  // Helper methods
  async getBlockContext(sermonUid, blockUid) {
    try {
      await this.initialize();
      
      if (this.isElectron) {
        return await window.electronAPI.database.getBlockContext(sermonUid, blockUid);
      } else {
        return this.database.getBlockContext(sermonUid, blockUid);
      }
    } catch (error) {
      console.error('Error getting block context:', error);
      return { paragraphBlocks: [] };
    }
  }

  convertToFtsQuery(query) {
    // Convert simple boolean syntax (+term, -term) to FTS5 syntax
    return query
      .replace(/\+(\w+)/g, '"$1"')  // +term -> "term" (required)
      .replace(/-(\w+)/g, 'NOT $1'); // -term -> NOT term (excluded)
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Export singleton instance
export const sermonSearch = new SermonSearchEngine();