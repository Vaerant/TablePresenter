const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const OpenAI = require("openai");

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: 'key' });

function cosineSimilarity(vecA, vecB) {
  let dot = 0.0, normA = 0.0, normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function hybridSearch(db, query, topN = 10) {
  console.log(`🔍 Searching for: "${query}"`);
  
  // Step 1: Keyword search with FTS5
  console.log('📝 Performing keyword search...');
  const keywordHits = await db.all(
    `SELECT b.uid, b.text, b.sermon_uid, b.section_uid, b.paragraph_uid,
            s.title as sermon_title, s.date as sermon_date,
            sec.number as section_number
     FROM blocks_fts f
     JOIN blocks b ON f.rowid = b.rowid
     JOIN sermons s ON b.sermon_uid = s.uid
     LEFT JOIN sections sec ON b.section_uid = sec.uid
     WHERE f.text MATCH ? 
     ORDER BY rank`,
    [query]
  );

  console.log(`✅ Found ${keywordHits.length} keyword matches`);

  // Display keyword results immediately
  const keywordResults = keywordHits.map(h => ({ 
    ...h, 
    score: 2.0,
    type: 'keyword'
  }));
  
  console.log('\n🎯 Keyword Results (showing immediately):');
  formatResultsBrief(keywordResults.slice(0, 5));

  // Step 2: Semantic search with batching and progressive display
  console.log('\n🧠 Starting semantic search with batching...');
  
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryEmbedding = response.data[0].embedding;

  // Get total count for progress tracking
  const keywordUids = keywordHits.map(h => h.uid);
  let countQuery = `SELECT COUNT(*) as count FROM blocks WHERE embedding IS NOT NULL`;
  if (keywordUids.length > 0) {
    const placeholders = keywordUids.map(() => '?').join(',');
    countQuery += ` AND uid NOT IN (${placeholders})`;
  }
  const totalCount = await db.get(countQuery, keywordUids);
  
  console.log(`📊 Processing ${totalCount.count} blocks with embeddings in batches...`);

  // Batch processing
  const batchSize = 5000;
  const allSemanticResults = [];
  let processedCount = 0;
  
  // Keep track of top results across batches
  let topResults = [...keywordResults];
  
  for (let offset = 0; offset < totalCount.count; offset += batchSize) {
    const batchStartTime = Date.now();
    
    // Get batch of blocks
    let batchQuery = `
      SELECT b.uid, b.text, b.embedding, b.sermon_uid, b.section_uid, b.paragraph_uid,
             s.title as sermon_title, s.date as sermon_date,
             sec.number as section_number
      FROM blocks b
      JOIN sermons s ON b.sermon_uid = s.uid
      LEFT JOIN sections sec ON b.section_uid = sec.uid
      WHERE b.embedding IS NOT NULL`;
    
    if (keywordUids.length > 0) {
      const placeholders = keywordUids.map(() => '?').join(',');
      batchQuery += ` AND b.uid NOT IN (${placeholders})`;
    }
    
    batchQuery += ` LIMIT ${batchSize} OFFSET ${offset}`;
    
    const batchBlocks = await db.all(batchQuery, keywordUids);
    
    if (batchBlocks.length === 0) break;

    // Process batch
    const batchResults = batchBlocks.map(b => {
      const embedding = JSON.parse(b.embedding);
      return {
        uid: b.uid,
        text: b.text,
        sermon_uid: b.sermon_uid,
        section_uid: b.section_uid,
        paragraph_uid: b.paragraph_uid,
        sermon_title: b.sermon_title,
        sermon_date: b.sermon_date,
        section_number: b.section_number,
        score: cosineSimilarity(queryEmbedding, embedding),
        type: 'semantic'
      };
    });

    allSemanticResults.push(...batchResults);
    processedCount += batchBlocks.length;
    
    // Update top results with this batch
    topResults = [...topResults, ...batchResults];
    topResults.sort((a, b) => {
      if (a.type === 'keyword' && b.type === 'semantic') return -1;
      if (a.type === 'semantic' && b.type === 'keyword') return 1;
      return b.score - a.score;
    });
    
    // Keep only top results to avoid memory issues
    topResults = topResults.slice(0, topN * 3);
    
    const batchTime = Date.now() - batchStartTime;
    const progress = ((processedCount / totalCount.count) * 100).toFixed(1);
    
    // Show batch progress and current top semantic result
    const topSemantic = batchResults.sort((a, b) => b.score - a.score)[0];
    console.log(`⚡ Batch ${Math.floor(offset / batchSize) + 1}: ${batchBlocks.length} blocks, ${batchTime}ms | Progress: ${progress}% | Top: ${(topSemantic.score * 100).toFixed(1)}%`);
    
    // Show current top 3 results every few batches or on last batch
    if ((offset / batchSize + 1) % 5 === 0 || processedCount >= totalCount.count) {
      console.log(`\n📊 Current Top 3 Results (${progress}% complete):`);
      formatResultsBrief(topResults.slice(0, 3));
      console.log(''); // Add spacing
    }
  }

  // Final ranking and results
  console.log('🔄 Performing final ranking...');
  
  const finalResults = [...keywordResults, ...allSemanticResults];
  finalResults.sort((a, b) => {
    if (a.type === 'keyword' && b.type === 'semantic') return -1;
    if (a.type === 'semantic' && b.type === 'keyword') return 1;
    return b.score - a.score;
  });

  console.log(`✅ Semantic search complete! Processed ${processedCount} blocks.`);
  return finalResults.slice(0, topN);
}

function formatResultsBrief(results) {
  results.forEach((result, index) => {
    const scoreDisplay = result.type === 'keyword' ? 'EXACT' : `${(result.score * 100).toFixed(1)}%`;
    const typeIcon = result.type === 'keyword' ? '🎯' : '🧠';
    
    console.log(`   ${index + 1}. ${typeIcon} ${scoreDisplay} | ${result.sermon_title} - ${result.text.substring(0, 80)}...`);
  });
}

function formatResults(results) {
  console.log('\n📋 Search Results:');
  console.log('=' .repeat(80));
  
  results.forEach((result, index) => {
    const scoreDisplay = result.type === 'keyword' ? 'EXACT MATCH' : `${(result.score * 100).toFixed(1)}%`;
    const typeIcon = result.type === 'keyword' ? '🎯' : '🧠';
    
    console.log(`\n${index + 1}. ${typeIcon} ${scoreDisplay} | ${result.sermon_title} (${result.sermon_date})`);
    if (result.section_number) {
      console.log(`   📖 Section ${result.section_number}`);
    }
    console.log(`   📝 ${result.text.substring(0, 200)}${result.text.length > 200 ? '...' : ''}`);
    console.log(`   🔗 Block ID: ${result.uid}`);
  });
}

async function searchSermons() {
  console.log('🚀 Starting sermon search...');
  
  // Open SQLite DB
  const db = await open({
    filename: "sermons.db",
    driver: sqlite3.Database,
  });

  // Interactive search loop
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function askQuery() {
    rl.question('\nEnter search query (or "quit" to exit): ', async (query) => {
      if (query.toLowerCase() === 'quit') {
        console.log('👋 Goodbye!');
        rl.close();
        await db.close();
        return;
      }

      if (query.trim() === '') {
        console.log('❌ Please enter a search query');
        askQuery();
        return;
      }

      try {
        const startTime = Date.now();
        const results = await hybridSearch(db, query, 10);
        const endTime = Date.now();
        
        console.log('\n🏆 FINAL RESULTS:');
        formatResults(results);
        
        console.log(`\n⏱️  Total search completed in ${endTime - startTime}ms`);
        console.log(`📊 Found ${results.length} total results`);
        
        const keywordCount = results.filter(r => r.type === 'keyword').length;
        const semanticCount = results.filter(r => r.type === 'semantic').length;
        console.log(`   • ${keywordCount} keyword matches`);
        console.log(`   • ${semanticCount} semantic matches`);
        
      } catch (error) {
        console.error('❌ Search error:', error.message);
      }
      
      askQuery();
    });
  }

  // Check database status
  const blockCount = await db.get('SELECT COUNT(*) as count FROM blocks');
  const embeddingCount = await db.get('SELECT COUNT(*) as count FROM blocks WHERE embedding IS NOT NULL');
  
  console.log(`📊 Database status:`);
  console.log(`   • ${blockCount.count} total blocks`);
  console.log(`   • ${embeddingCount.count} blocks with embeddings (${((embeddingCount.count / blockCount.count) * 100).toFixed(1)}%)`);
  
  if (embeddingCount.count === 0) {
    console.log('⚠️  Warning: No embeddings found. Semantic search will not work.');
    console.log('   Run create-embeddings.js first to generate embeddings.');
  }

  askQuery();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

// Start the search interface
searchSermons().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});