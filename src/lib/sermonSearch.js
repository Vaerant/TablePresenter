export class SermonSearchEngine {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  async getSermons() {
    const resp = await fetch(`${this.baseUrl}/api/message/sermons`);
    if (!resp.ok) throw new Error('Failed to fetch sermons');
    return resp.json();
  }

  async loadSermon(uid) {
    try {
      const resp = await fetch(`${this.baseUrl}/api/message/sermons/${encodeURIComponent(uid)}`);
      if (!resp.ok) return null;
      const sermon = await resp.json();
      if (!sermon) return null;

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

  async search(query, limit = 50, type = 'phrase', sermonUid = null, page = 1) {
    const resp = await fetch(`${this.baseUrl}/api/message/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: String(query ?? '').trim(),
        limit,
        type,
        sermonUid,
        page
      })
    });

    if (!resp.ok) throw new Error('Failed to search sermons');
    const result = await resp.json();

    const rows = result?.data || [];
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

    return { data, pagination: result?.pagination || null };
  }

  async searchText(query, limit = 50, searchMode = 'phrase', sermonUid = null, page = 1) {
    const type = (searchMode === 'general' || searchMode === 'phrase' || searchMode === 'similar')
      ? searchMode
      : 'phrase';
    return this.search(query, limit, type, sermonUid, page);
  }

  async searchSermons(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });

    const resp = await fetch(`${this.baseUrl}/api/message/sermon-summaries${params.toString() ? `?${params.toString()}` : ''}`);
    if (!resp.ok) throw new Error('Failed to search sermon summaries');
    return resp.json();
  }
}

export const sermonSearch = new SermonSearchEngine();