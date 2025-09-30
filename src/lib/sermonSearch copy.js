import allSermons from '@/data/sermon_data/all_sermons.json';
import globalIndex from '@/data/sermon_data/indices/global_index.json';

export class SermonSearchEngine {
  constructor() {
    this.sermons = [];
    this.globalIndex = {};
    this.initialized = false;
    this.sermonCache = new Map(); // Cache for loaded sermons
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Load sermon list and global index from imports
      this.sermons = allSermons;
      this.globalIndex = globalIndex;

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize sermon search engine:', error);
      throw error;
    }
  }

  // Load individual sermon data
  async loadSermon(uid) {
    try {
      // Check cache first
      if (this.sermonCache.has(uid)) {
        return this.sermonCache.get(uid);
      }

      // Dynamically import sermon data
      const sermonData = await import(`@/data/sermon_data/${uid}.json`);
      const sermon = sermonData.default || sermonData;
      
      // Cache the result
      this.sermonCache.set(uid, sermon);
      
      return sermon;
    } catch (error) {
      console.error(`Failed to load sermon ${uid}:`, error);
      return null;
    }
  }

  // 1. Basic text search across all sermons
  async searchText(query, options = {}) {
    await this.initialize();
    
    const {
      caseSensitive = false,
      wholeWords = false,
      includeContext = true
    } = options;

    const results = [];
    const searchTerm = caseSensitive ? query : query.toLowerCase();
    const wordBoundary = wholeWords ? '\\b' : '';
    const regex = new RegExp(`${wordBoundary}${this.escapeRegex(searchTerm)}${wordBoundary}`, caseSensitive ? 'g' : 'gi');

    for (const sermon of this.sermons) {
      const sermonData = await this.loadSermon(sermon.uid);
      if (!sermonData) continue;

      const matches = this.searchInSermon(sermonData, regex, includeContext);
      
      if (matches.length > 0) {
        results.push({
          sermon: {
            id: sermon.id,
            uid: sermon.uid,
            title: sermon.title,
            date: sermon.date
          },
          matches,
          totalMatches: matches.length
        });
      }
    }

    return results.sort((a, b) => b.totalMatches - a.totalMatches);
  }

  // 2. Search by sermon metadata
  async searchSermons(filters = {}) {
    await this.initialize();
    
    const {
      title,
      date,
      dateRange,
      id,
      uid
    } = filters;

    let results = [...this.sermons];

    if (title) {
      const titleRegex = new RegExp(this.escapeRegex(title), 'i');
      results = results.filter(sermon => titleRegex.test(sermon.title));
    }

    if (date) {
      results = results.filter(sermon => sermon.date === date);
    }

    if (dateRange && dateRange.start && dateRange.end) {
      results = results.filter(sermon => {
        return sermon.date >= dateRange.start && sermon.date <= dateRange.end;
      });
    }

    if (id) {
      results = results.filter(sermon => sermon.id === parseInt(id));
    }

    if (uid) {
      results = results.filter(sermon => sermon.uid === uid);
    }

    return results;
  }

  // 3. Advanced phrase search with proximity
  async searchPhrase(phrase, options = {}) {
    await this.initialize();
    
    const {
      proximity = 5, // words between phrase parts
      exactPhrase = false
    } = options;

    const results = [];
    
    for (const sermon of this.sermons) {
      const sermonData = await this.loadSermon(sermon.uid);
      if (!sermonData) continue;

      const matches = exactPhrase 
        ? this.searchExactPhrase(sermonData, phrase)
        : this.searchProximityPhrase(sermonData, phrase, proximity);

      if (matches.length > 0) {
        results.push({
          sermon: {
            id: sermon.id,
            uid: sermon.uid,
            title: sermon.title,
            date: sermon.date
          },
          matches,
          totalMatches: matches.length
        });
      }
    }

    return results.sort((a, b) => b.totalMatches - a.totalMatches);
  }

  // 4. Multi-term search with boolean operators
  async searchBoolean(query, options = {}) {
    await this.initialize();
    
    const { limit = 50 } = options;
    const terms = this.parseBooleanQuery(query);
    const results = [];

    for (const sermon of this.sermons) {
      const sermonData = await this.loadSermon(sermon.uid);
      if (!sermonData) continue;

      const score = this.calculateBooleanScore(sermonData, terms);
      
      if (score > 0) {
        const matches = this.findTermMatches(sermonData, terms.required.concat(terms.optional));
        
        results.push({
          sermon: {
            id: sermon.id,
            uid: sermon.uid,
            title: sermon.title,
            date: sermon.date
          },
          matches,
          score,
          totalMatches: matches.length
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // 5. Search within specific block types
  async searchByBlockType(query, blockType, options = {}) {
    await this.initialize();
    
    const { limit = 50 } = options;
    const results = [];
    const regex = new RegExp(this.escapeRegex(query), 'gi');

    for (const sermon of this.sermons) {
      const sermonData = await this.loadSermon(sermon.uid);
      if (!sermonData) continue;

      const matches = [];
      
      Object.entries(sermonData.blockIndex).forEach(([blockId, blockData]) => {
        if (blockData.type === blockType && blockData.text && regex.test(blockData.text)) {
          matches.push({
            blockId,
            text: blockData.text,
            type: blockData.type,
            sectionId: blockData.sectionId,
            paragraphId: blockData.paragraphId,
            context: this.getBlockContext(sermonData, blockId)
          });
        }
      });

      if (matches.length > 0) {
        results.push({
          sermon: {
            id: sermon.id,
            uid: sermon.uid,
            title: sermon.title,
            date: sermon.date
          },
          matches,
          totalMatches: matches.length
        });
      }
    }

    return results
      .sort((a, b) => b.totalMatches - a.totalMatches)
      .slice(0, limit);
  }

  // 6. Get sermon statistics
  async getSermonStats(uid) {
    await this.initialize();
    
    const sermonData = await this.loadSermon(uid);
    if (!sermonData) return null;

    const stats = {
      totalSections: Object.keys(sermonData.sections).length,
      totalParagraphs: 0,
      totalBlocks: Object.keys(sermonData.blockIndex).length,
      wordCount: 0,
      blockTypes: {},
      averageParagraphLength: 0
    };

    // Count paragraphs and analyze block types
    Object.values(sermonData.sections).forEach(section => {
      stats.totalParagraphs += Object.keys(section.paragraphs).length;
    });

    // Analyze blocks
    Object.values(sermonData.blockIndex).forEach(block => {
      stats.wordCount += block.text.split(/\s+/).length;
      stats.blockTypes[block.type || 'normal'] = (stats.blockTypes[block.type || 'normal'] || 0) + 1;
    });

    stats.averageParagraphLength = stats.totalParagraphs > 0 ? stats.wordCount / stats.totalParagraphs : 0;

    return stats;
  }

  // Helper methods
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  searchInSermon(sermonData, regex, includeContext) {
    const matches = [];
    
    Object.entries(sermonData.blockIndex).forEach(([blockId, blockData]) => {
      if (!blockData.text) return; // Add this check
      const blockMatches = [...blockData.text.matchAll(regex)];
      
      blockMatches.forEach(match => {
        matches.push({
          blockId,
          text: blockData.text,
          match: match[0],
          index: match.index,
          type: blockData.type,
          sectionId: blockData.sectionId,
          paragraphId: blockData.paragraphId,
          context: includeContext ? this.getBlockContext(sermonData, blockId) : null
        });
      });
    });

    return matches;
  }

  getBlockContext(sermonData, blockId) {
    const blockData = sermonData.blockIndex[blockId];
    if (!blockData) return null;

    const paragraph = sermonData.sections[blockData.sectionId]?.paragraphs[blockData.paragraphId];
    if (!paragraph) return null;

    return {
      paragraphBlocks: paragraph.orderedBlockIds.map(id => ({
        id,
        text: sermonData.blockIndex[id]?.text || '',
        type: sermonData.blockIndex[id]?.type
      }))
    };
  }

  searchExactPhrase(sermonData, phrase) {
    const regex = new RegExp(this.escapeRegex(phrase), 'gi');
    return this.searchInSermon(sermonData, regex, true);
  }

  searchProximityPhrase(sermonData, phrase, proximity) {
    const words = phrase.split(/\s+/);
    if (words.length < 2) return this.searchExactPhrase(sermonData, phrase);

    const matches = [];
    
    Object.entries(sermonData.blockIndex).forEach(([blockId, blockData]) => {
      const text = blockData.text.toLowerCase();
      const textWords = text.split(/\s+/);
      
      for (let i = 0; i < textWords.length - words.length + 1; i++) {
        if (this.checkProximity(textWords, i, words, proximity)) {
          matches.push({
            blockId,
            text: blockData.text,
            type: blockData.type,
            sectionId: blockData.sectionId,
            paragraphId: blockData.paragraphId,
            context: this.getBlockContext(sermonData, blockId)
          });
          break;
        }
      }
    });

    return matches;
  }

  checkProximity(textWords, startIndex, searchWords, proximity) {
    let foundWords = 0;
    let currentIndex = startIndex;
    
    for (const word of searchWords) {
      let found = false;
      const endIndex = Math.min(currentIndex + proximity + 1, textWords.length);
      
      for (let i = currentIndex; i < endIndex; i++) {
        if (textWords[i].includes(word.toLowerCase())) {
          foundWords++;
          currentIndex = i + 1;
          found = true;
          break;
        }
      }
      
      if (!found) return false;
    }
    
    return foundWords === searchWords.length;
  }

  parseBooleanQuery(query) {
    const terms = {
      required: [],
      optional: [],
      excluded: []
    };

    // Simple boolean parsing - can be enhanced
    const parts = query.split(/\s+/);
    
    for (const part of parts) {
      if (part.startsWith('+')) {
        terms.required.push(part.substring(1));
      } else if (part.startsWith('-')) {
        terms.excluded.push(part.substring(1));
      } else if (part.trim()) {
        terms.optional.push(part);
      }
    }

    return terms;
  }

  calculateBooleanScore(sermonData, terms) {
    const text = Object.values(sermonData.blockIndex)
      .map(block => block.text.toLowerCase())
      .join(' ');

    // Check required terms
    for (const term of terms.required) {
      if (!text.includes(term.toLowerCase())) {
        return 0;
      }
    }

    // Check excluded terms
    for (const term of terms.excluded) {
      if (text.includes(term.toLowerCase())) {
        return 0;
      }
    }

    // Calculate score based on optional terms
    let score = terms.required.length * 10; // Base score for required terms
    
    for (const term of terms.optional) {
      const matches = (text.match(new RegExp(this.escapeRegex(term.toLowerCase()), 'gi')) || []).length;
      score += matches;
    }

    return score;
  }

  findTermMatches(sermonData, terms) {
    const matches = [];
    
    for (const term of terms) {
      const regex = new RegExp(this.escapeRegex(term), 'gi');
      matches.push(...this.searchInSermon(sermonData, regex, true));
    }

    return matches;
  }
}

// Export singleton instance
export const sermonSearch = new SermonSearchEngine();