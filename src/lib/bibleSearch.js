class BibleSearch {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  async getAllBooks() {
    const resp = await fetch(`${this.baseUrl}/api/bible/books`);
    if (!resp.ok) throw new Error('Failed to fetch books');
    return resp.json();
  }

  async searchVerses(query, limit = 50, offset = 0) {
    const params = new URLSearchParams({
      query: String(query ?? '').trim(),
      limit: String(limit),
      offset: String(offset)
    });
    const resp = await fetch(`${this.baseUrl}/api/bible/search?${params.toString()}`);
    if (!resp.ok) throw new Error('Failed to search verses');
    return resp.json();
  }

  async searchByBook(query, bookId) {
    const params = new URLSearchParams({
      query: String(query ?? '').trim(),
      bookId: String(bookId)
    });
    const resp = await fetch(`${this.baseUrl}/api/bible/search?${params.toString()}`);
    if (!resp.ok) throw new Error('Failed to search by book');
    return resp.json();
  }

  async getChapter(bookId, chapter) {
    const resp = await fetch(`${this.baseUrl}/api/bible/books/${bookId}/chapters/${chapter}`);
    if (!resp.ok) throw new Error('Failed to fetch chapter');
    return resp.json();
  }

  async getVerse(bookId, chapter, verse) {
    const resp = await fetch(`${this.baseUrl}/api/bible/books/${bookId}/chapters/${chapter}/verses/${verse}`);
    if (!resp.ok) throw new Error('Failed to fetch verse');
    return resp.json();
  }

  async getBook(bookId) {
    const resp = await fetch(`${this.baseUrl}/api/bible/books/${bookId}`);
    if (!resp.ok) throw new Error('Failed to fetch book');
    return resp.json();
  }
}

export const bibleSearch = new BibleSearch();
