const Database = require('better-sqlite3');
const path = require('path');
const OpenAI = require('openai');
const axios = require('axios');
require('dotenv').config();

async function createQueryEmbedding(query, model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small') {
  if (!process.env.OPENAI_API_KEY) {
    console.error('---------OPENAI_API_KEY is not set in environment variables.');
    throw new Error('OPENAI_API_KEY env var is required for embeddings.');
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const resp = await openai.embeddings.create({
    model,
    input: query,
  });

  const embedding = resp?.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('No embedding returned from OpenAI.');
  }
  return embedding;
}

async function performSimilaritySearch(queryEmbedding, limit = 500) {
  const { ZILLIZ_API_KEY, ZILLIZ_COLLECTION_NAME, ZILLIZ_METRIC_TYPE, ZILLIZ_URL } = process.env;
  if (!ZILLIZ_API_KEY) throw new Error('ZILLIZ_API_KEY env var is required for similarity search.');

  const payload = {
    collectionName: ZILLIZ_COLLECTION_NAME || 'sermon_blocks',
    vector: queryEmbedding,                  // single vector
    limit,
    outputFields: ['id', 'block_uid'],
    data: [queryEmbedding],          // 2D array for multiple vectors
    searchParams: {
      metricType: ZILLIZ_METRIC_TYPE || 'COSINE',
      params: { nprobe: 64, ef: Math.min(limit * 2, 2000) }
    }
  };

  let response;
  try {
    response = await axios.post(`${ZILLIZ_URL}/v2/vectordb/entities/search`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ZILLIZ_API_KEY}`
      },
      timeout: 30000,
      validateStatus: () => true
    });
  } catch (err) {
    if (err.code === 'ECONNABORTED') throw new Error('Zilliz similarity search request timed out.');
    throw new Error(`Network error contacting Zilliz: ${err.message}`);
  }

  if (response.status < 200 || response.status >= 300) {
    const snippet = typeof response.data === 'object' ? JSON.stringify(response.data).slice(0, 400) : String(response.data).slice(0, 400);
    throw new Error(`Zilliz HTTP ${response.status}: ${response.statusText}. Body: ${snippet}`);
  }

  const result = response.data;
  if (result?.code && result.code !== 0) {
    throw new Error(`Zilliz API error (${result.code}): ${result.message || 'Unknown error'}`);
  }
  const hits = result?.data;
  if (!Array.isArray(hits)) return [];

  return hits.map(hit => ({
    block_uid: hit.block_uid,
    id: hit.id,
    distance: hit.distance
  }));
}

class SermonDatabase {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.generalSearchCache = new Map(); // key -> { ts, results }
  }

  buildPagination({ page, pageSize, total, returnedCount }) {
    const safePageSize = typeof pageSize === 'number' ? pageSize : null;
    const safePage = typeof page === 'number' ? page : 1;

    // If pageSize is -1 (meaning "all"), pagination is mostly informational.
    if (safePageSize === -1) {
      const safeTotal = typeof total === 'number' ? total : (typeof returnedCount === 'number' ? returnedCount : null);
      return {
        page: 1,
        pageSize: -1,
        total: safeTotal,
        totalPages: safeTotal != null ? 1 : null,
        hasPrev: false,
        hasNext: false,
      };
    }

    const safeTotal = typeof total === 'number' ? total : null;
    const totalPages = safeTotal != null && safePageSize > 0 ? Math.max(1, Math.ceil(safeTotal / safePageSize)) : null;
    const hasPrev = safePage > 1;
    const hasNext = totalPages != null
      ? safePage < totalPages
      : (typeof returnedCount === 'number' && safePageSize > 0 ? returnedCount === safePageSize : false);

    return {
      page: safePage,
      pageSize: safePageSize,
      total: safeTotal,
      totalPages,
      hasPrev,
      hasNext,
    };
  }

  normalizePage(page) {
    const p = Number(page);
    if (!Number.isFinite(p) || p < 1) return 1;
    return Math.floor(p);
  }

  initialize() {
    console.log('Initializing database connection in Electron main process...');
    if (this.initialized) return;

    try {
      const dbPath = path.join(__dirname, 'sermons.db');
      console.log('Database path:', dbPath);

      this.db = new Database(dbPath, { readonly: true });

      this.initialized = true;
      console.log(`Connected to SQLite database: ${dbPath}`);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  ensureInitialized() {
    if (!this.initialized) {
      this.initialize();
    }
  }

  getBlocksByUids(blockUids) {
    this.ensureInitialized();
    if (!blockUids || blockUids.length === 0) return [];
    
    const placeholders = blockUids.map(() => '?').join(',');
    const query = this.db.prepare(`
      SELECT 
        b.*,
        s.number as section_number,
        ser.title as sermon_title,
        ser.date as sermon_date
      FROM blocks b
      JOIN sections s ON s.uid = b.section_uid
      JOIN sermons ser ON ser.uid = b.sermon_uid
      WHERE b.uid IN (${placeholders})
    `);
    return query.all(...blockUids);
  }

  getParagraphsByBlockUids(blockUids) {
    this.ensureInitialized();
    if (!blockUids || blockUids.length === 0) return [];

    const placeholders = blockUids.map(() => '?').join(',');
    const sql = `
      SELECT
        b.uid AS block_uid,
        p.uid AS paragraph_uid,
        p.section_uid AS section_uid,
        sec.sermon_uid AS sermon_uid,
        COALESCE(pt.text, '') AS paragraph_text,
        sec.number AS section_number,
        ser.title AS sermon_title,
        ser.date AS sermon_date
      FROM blocks b
      JOIN paragraphs p ON p.uid = b.paragraph_uid
      JOIN sections sec ON sec.uid = p.section_uid
      JOIN sermons ser ON ser.uid = sec.sermon_uid
      LEFT JOIN paragraphs_text pt ON pt.uid = p.uid
      WHERE b.uid IN (${placeholders})
    `;

    return this.db.prepare(sql).all(...blockUids);
  }

  getAllSermons() {
    this.ensureInitialized();
    const sql = `
      SELECT 
        s.id,
        s.uid,
        s.title,
        s.date,
        COALESCE(pc.paragraph_count, 0) AS paragraph_count
      FROM sermons s
      LEFT JOIN (
        SELECT sec.sermon_uid, COUNT(p.uid) AS paragraph_count
        FROM sections sec
        JOIN paragraphs p ON p.section_uid = sec.uid
        GROUP BY sec.sermon_uid
      ) pc ON pc.sermon_uid = s.uid
      ORDER BY s.date ASC
    `;
    return this.db.prepare(sql).all();
  }

  getSermon(uid) {
    this.ensureInitialized();
    
    // Check cache first
    if (this.sermonCache && this.sermonCache.has(uid)) {
      return this.sermonCache.get(uid);
    }

    // Single optimized query to get all sermon data at once
    const sermonWithData = this.db.prepare(`
      SELECT 
        s.id, s.uid, s.title, s.date,
        sec.uid as section_uid, sec.number as section_number, sec.order_index as section_order,
        p.uid as paragraph_uid, p.order_index as paragraph_order,
        b.uid as block_uid, b.text as block_text, b.type as block_type, 
        b.order_index as block_order, b.indented as block_indented
      FROM sermons s
      LEFT JOIN sections sec ON sec.sermon_uid = s.uid
      LEFT JOIN paragraphs p ON p.section_uid = sec.uid
      LEFT JOIN blocks b ON b.paragraph_uid = p.uid
      WHERE s.uid = ?
      ORDER BY sec.order_index, p.order_index, b.order_index
    `).all(uid);

    if (!sermonWithData || sermonWithData.length === 0) {
      return null;
    }

    // Build structure more efficiently
    const structuredSermon = this.buildSermonHierarchyOptimized(sermonWithData);
    
    // Cache the result
    if (!this.sermonCache) {
      this.sermonCache = new Map();
    }
    this.sermonCache.set(uid, structuredSermon);
    
    return structuredSermon;
  }

  buildSermonHierarchyOptimized(rows) {
    if (!rows || rows.length === 0) return null;
    
    const firstRow = rows[0];
    const sermon = {
      id: firstRow.id,
      uid: firstRow.uid,
      title: firstRow.title,
      date: firstRow.date,
      sections: {},
      orderedSectionIds: []
    };

    // Use Maps for O(1) lookup instead of arrays
    const sectionMap = new Map();
    const paragraphMap = new Map();
    
    for (const row of rows) {
      if (!row.section_uid) continue;
      
      // Process section
      if (!sectionMap.has(row.section_uid)) {
        sectionMap.set(row.section_uid, {
          number: row.section_number,
          order: row.section_order,
          paragraphs: {},
          orderedParagraphIds: []
        });
        sermon.orderedSectionIds.push(row.section_uid);
      }
      
      if (!row.paragraph_uid) continue;
      
      // Process paragraph
      const paragraphKey = `${row.section_uid}:${row.paragraph_uid}`;
      if (!paragraphMap.has(paragraphKey)) {
        paragraphMap.set(paragraphKey, {
          order: row.paragraph_order,
          blocks: {},
          orderedBlockIds: []
        });
        sectionMap.get(row.section_uid).orderedParagraphIds.push(row.paragraph_uid);
      }
      
      if (!row.block_uid) continue;
      
      // Process block
      const paragraph = paragraphMap.get(paragraphKey);
      paragraph.blocks[row.block_uid] = {
        text: row.block_text,
        type: row.block_type,
        order: row.block_order,
        indented: !!row.block_indented,
      };
      paragraph.orderedBlockIds.push(row.block_uid);
    }
    
    // Convert Maps back to objects
    for (const [sectionId, section] of sectionMap) {
      for (const paragraphId of section.orderedParagraphIds) {
        const paragraphKey = `${sectionId}:${paragraphId}`;
        section.paragraphs[paragraphId] = paragraphMap.get(paragraphKey);
      }
      sermon.sections[sectionId] = section;
    }
    
    return sermon;
  }

  // Add method to preload sermon summaries
  getSermonSummaries() {
    this.ensureInitialized();
    return this.db.prepare(`
      SELECT 
        s.id, s.uid, s.title, s.date,
        COUNT(DISTINCT sec.uid) as section_count,
        COUNT(DISTINCT p.uid) as paragraph_count,
        COUNT(DISTINCT b.uid) as block_count
      FROM sermons s
      LEFT JOIN sections sec ON sec.sermon_uid = s.uid
      LEFT JOIN paragraphs p ON p.section_uid = sec.uid  
      LEFT JOIN blocks b ON b.paragraph_uid = p.uid
      GROUP BY s.id, s.uid, s.title, s.date
      ORDER BY s.date ASC
    `).all();
  }

  buildSermonHierarchy(sermon, sections, paragraphs, blocks) {
    // Group data by parent IDs for efficient lookup
    const paragraphsBySection = {};
    const blocksByParagraph = {};
    
    // Group paragraphs by section
    paragraphs.forEach(paragraph => {
      if (!paragraphsBySection[paragraph.section_uid]) {
        paragraphsBySection[paragraph.section_uid] = [];
      }
      paragraphsBySection[paragraph.section_uid].push(paragraph);
    });
    
    // Group blocks by paragraph
    blocks.forEach(block => {
      if (!blocksByParagraph[block.paragraph_uid]) {
        blocksByParagraph[block.paragraph_uid] = [];
      }
      blocksByParagraph[block.paragraph_uid].push(block);
    });
    
    // Build the hierarchical structure more efficiently
    const structuredSections = {};
    const orderedSectionIds = sections.map(s => s.uid);
    
    sections.forEach(section => {
      const sectionParagraphs = paragraphsBySection[section.uid] || [];
      const structuredParagraphs = {};
      const orderedParagraphIds = sectionParagraphs.map(p => p.uid);
      
      sectionParagraphs.forEach(paragraph => {
        const paragraphBlocks = blocksByParagraph[paragraph.uid] || [];
        const structuredBlocks = {};
        const orderedBlockIds = paragraphBlocks.map(b => b.uid);
        
        paragraphBlocks.forEach(block => {
          structuredBlocks[block.uid] = {
            text: block.text,
            type: block.type,
            order: block.order_index,
            indented: !!block.indented,
          };
        });
        
        structuredParagraphs[paragraph.uid] = {
          order: paragraph.order_index,
          blocks: structuredBlocks,
          orderedBlockIds: orderedBlockIds
        };
      });
      
      structuredSections[section.uid] = {
        number: section.number,
        order: section.order_index,
        paragraphs: structuredParagraphs,
        orderedParagraphIds: orderedParagraphIds
      };
    });
    
    return {
      id: sermon.id,
      uid: sermon.uid,
      title: sermon.title,
      date: sermon.date,
      sections: structuredSections,
      orderedSectionIds: orderedSectionIds
    };
  }

  searchParagraphs(query, limit = 20, sermonUid = null, page = 1) {
    let search;
    this.ensureInitialized();

    const safePage = this.normalizePage(page);
    const safeLimit = typeof limit === 'number' ? limit : 20;
    const offset = safeLimit > 0 ? (safePage - 1) * safeLimit : 0;

    const makeCountQuery = (withSermon) => {
      if (withSermon) {
        return this.db.prepare(`
          SELECT COUNT(*) AS total
          FROM paragraphs_fts
          JOIN paragraphs_text pt ON pt.rowid = paragraphs_fts.rowid
          WHERE paragraphs_fts MATCH ? AND pt.sermon_uid = ?
        `);
      }
      return this.db.prepare(`
        SELECT COUNT(*) AS total
        FROM paragraphs_fts
        JOIN paragraphs_text pt ON pt.rowid = paragraphs_fts.rowid
        WHERE paragraphs_fts MATCH ?
      `);
    };

    if (safeLimit === -1) {
      if (sermonUid) {
        search = this.db.prepare(`
        SELECT 
          pt.uid,
          pt.section_uid,
          pt.sermon_uid,
          pt.text as paragraph_text,
          bm25(paragraphs_fts) as rank,
          s.number as section_number,
          ser.title as sermon_title,
          ser.date as sermon_date,
          ser.uid as sermon_uid
        FROM paragraphs_fts
        JOIN paragraphs_text pt ON pt.rowid = paragraphs_fts.rowid
        JOIN sections s ON s.uid = pt.section_uid
        JOIN sermons ser ON ser.uid = pt.sermon_uid
        WHERE paragraphs_fts MATCH ? AND pt.sermon_uid = ?
        ORDER BY rank
      `);
        const data = search.all(query, sermonUid);
        const pagination = this.buildPagination({ page: 1, pageSize: -1, total: data.length, returnedCount: data.length });
        return { data, pagination };
      } else {
        search = this.db.prepare(`
        SELECT 
          pt.uid,
          pt.section_uid,
          pt.sermon_uid,
          pt.text as paragraph_text,
          bm25(paragraphs_fts) as rank,
          s.number as section_number,
          ser.title as sermon_title,
          ser.date as sermon_date
        FROM paragraphs_fts
        JOIN paragraphs_text pt ON pt.rowid = paragraphs_fts.rowid
        JOIN sections s ON s.uid = pt.section_uid
        JOIN sermons ser ON ser.uid = pt.sermon_uid
        WHERE paragraphs_fts MATCH ?
        ORDER BY rank
      `);
        const data = search.all(query);
        const pagination = this.buildPagination({ page: 1, pageSize: -1, total: data.length, returnedCount: data.length });
        return { data, pagination };
      }
    } else {
      if (sermonUid) {
        const totalRow = makeCountQuery(true).get(query, sermonUid);
        const total = totalRow?.total ?? null;
        search = this.db.prepare(`
        SELECT 
          pt.uid,
          pt.section_uid,
          pt.sermon_uid,
          pt.text as paragraph_text,
          bm25(paragraphs_fts) as rank,
          s.number as section_number,
          ser.title as sermon_title,
          ser.date as sermon_date
        FROM paragraphs_fts
        JOIN paragraphs_text pt ON pt.rowid = paragraphs_fts.rowid
        JOIN sections s ON s.uid = pt.section_uid
        JOIN sermons ser ON ser.uid = pt.sermon_uid
        WHERE paragraphs_fts MATCH ? AND pt.sermon_uid = ?
        ORDER BY rank
        LIMIT ?
        OFFSET ?
      `);
        const data = search.all(query, sermonUid, safeLimit, offset);
        const pagination = this.buildPagination({ page: safePage, pageSize: safeLimit, total, returnedCount: data.length });
        return { data, pagination };
      } else {
        const totalRow = makeCountQuery(false).get(query);
        const total = totalRow?.total ?? null;
        search = this.db.prepare(`
        SELECT 
          pt.uid,
          pt.section_uid,
          pt.sermon_uid,
          pt.text as paragraph_text,
          bm25(paragraphs_fts) as rank,
          s.number as section_number,
          ser.title as sermon_title,
          ser.date as sermon_date
        FROM paragraphs_fts
        JOIN paragraphs_text pt ON pt.rowid = paragraphs_fts.rowid
        JOIN sections s ON s.uid = pt.section_uid
        JOIN sermons ser ON ser.uid = pt.sermon_uid
        WHERE paragraphs_fts MATCH ?
        ORDER BY rank
        LIMIT ?
        OFFSET ?
      `);
        const data = search.all(query, safeLimit, offset);
        const pagination = this.buildPagination({ page: safePage, pageSize: safeLimit, total, returnedCount: data.length });
        return { data, pagination };
      }
    }
  }

  generalSearch(word, limit = 20, sermonUid = null, page = 1) {
    let query;
    if (word.includes('*')) {
      query = word;
    } else {
      const words = word.trim().split(/\s+/);
      query = words.map(w => `"${w}"`).join(' ');
    }
    return this.searchParagraphs(query, limit, sermonUid, page);
  }

  searchParagraphsExactPhrase(phrase, limit = 20, sermonUid = null, page = 1) {
    return this.searchParagraphs(`"${phrase}"`, limit, sermonUid, page);
  }

  async searchSimilar(query, limit = 20, page = 1) {
    const embedding = await createQueryEmbedding(query);
    this.ensureInitialized();

    const safePage = this.normalizePage(page);
    const safeLimit = typeof limit === 'number' ? limit : 20;
    const start = safeLimit > 0 ? (safePage - 1) * safeLimit : 0;
    const end = safeLimit > 0 ? start + safeLimit : undefined;

    // Fetch extra candidates so we can de-dupe at paragraph level.
    const candidateLimit = Math.min(Math.max(safeLimit * 8 * safePage, safeLimit), 500);
    const hits = await performSimilaritySearch(embedding, candidateLimit);
    if (!hits || hits.length === 0) {
      return { data: [], pagination: this.buildPagination({ page: safePage, pageSize: safeLimit, total: 0, returnedCount: 0 }) };
    }

    const blockUids = hits.map(h => h.block_uid).filter(Boolean);
    const rows = this.getParagraphsByBlockUids(blockUids);
    const byBlockUid = new Map(rows.map(r => [r.block_uid, r]));

    // De-dupe by paragraph_uid, keeping the best (highest) distance.
    const bestByParagraph = new Map();
    for (const hit of hits) {
      const row = byBlockUid.get(hit.block_uid);
      if (!row || !row.paragraph_uid) continue;

      const prev = bestByParagraph.get(row.paragraph_uid);
      if (!prev || (typeof hit.distance === 'number' && hit.distance > prev.distance)) {
        bestByParagraph.set(row.paragraph_uid, {
          uid: row.paragraph_uid,
          section_uid: row.section_uid,
          sermon_uid: row.sermon_uid,
          paragraph_text: row.paragraph_text,
          rank: null,
          section_number: row.section_number,
          sermon_title: row.sermon_title,
          sermon_date: row.sermon_date,
          block_uid: hit.block_uid,
          id: hit.id,
          distance: hit.distance
        });
      }
    }

    const all = Array.from(bestByParagraph.values())
      .sort((a, b) => (b.distance ?? -Infinity) - (a.distance ?? -Infinity))
    const total = all.length;
    const data = safeLimit === -1 ? all : all.slice(start, end);

    const pagination = this.buildPagination({
      page: safeLimit === -1 ? 1 : safePage,
      pageSize: safeLimit,
      total,
      returnedCount: data.length,
    });

    return { data, pagination };
  }

  async search(query, limit = 20, type = 'general', sermonUid = null, page = 1) {
    // console.log(`Performing ${type} search for query: "${query}" with limit ${limit} (page ${page})`);
    switch (type) {
      case 'general':
        return this.generalSearch(query, limit, sermonUid, page);
      case 'phrase':
        return this.searchParagraphsExactPhrase(query, limit, sermonUid, page);
      case 'similar':
        return this.searchSimilar(query, limit, page);
      default:
        throw new Error(`Unknown search type: ${type}`);
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

// if (require.main === module) {
//   const sermonDb = new SermonDatabase();
//   sermonDb.initialize();
  
//   // sample search for each type
//   (async () => {
//     console.log('General Search Results:', sermonDb.generalSearch('faith hope love', 5));
//     console.log('Phrase Search Results:', sermonDb.searchParagraphsExactPhrase('faith hope love', 5));
//     console.log('Similarity Search Results:', await sermonDb.searchSimilar('faith hope love', 5));
//     sermonDb.close();
//   })();
// }

module.exports = { SermonDatabase };