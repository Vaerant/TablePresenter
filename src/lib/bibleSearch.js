class BibleSearch {
  async getAllBooks() {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return await window.electronAPI.bible.getAllBooks();
    }
    throw new Error('Bible search is only available in Electron environment');
  }

  async searchVerses(query, limit = 50, offset = 0) {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return await window.electronAPI.bible.searchVerses(query, limit, offset);
    }
    throw new Error('Bible search is only available in Electron environment');
  }

  async searchByBook(query, bookId) {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return await window.electronAPI.bible.searchByBook(query, bookId);
    }
    throw new Error('Bible search is only available in Electron environment');
  }

  async getChapter(bookId, chapter) {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return await window.electronAPI.bible.getChapter(bookId, chapter);
    }
    throw new Error('Bible search is only available in Electron environment');
  }

  async getVerse(bookId, chapter, verse) {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return await window.electronAPI.bible.getVerse(bookId, chapter, verse);
    }
    throw new Error('Bible search is only available in Electron environment');
  }

  async getBook(bookId) {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return await window.electronAPI.bible.getBook(bookId);
    }
    throw new Error('Bible search is only available in Electron environment');
  }
}

export const bibleSearch = new BibleSearch();
