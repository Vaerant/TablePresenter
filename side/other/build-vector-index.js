const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
// const { HierarchicalNSW } = require('hnswlib-node'); // Remove this
const fs = require('fs');

// Simple in-memory vector index (for development/testing)
class SimpleVectorIndex {
  constructor() {
    this.vectors = [];
    this.metadata = {};
  }

  addPoint(vector, id) {
    this.vectors.push({ vector, id });
  }

  search(queryVector, k = 10) {
    const similarities = this.vectors.map(({ vector, id }) => ({
      id,
      similarity: this.cosineSimilarity(queryVector, vector)
    }));
    
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  writeIndex(filename) {
    fs.writeFileSync(filename, JSON.stringify(this.vectors));
  }
}

async function buildVectorIndex() {
  console.log('🚀 Building persistent vector index...');
  
  const db = await open({
    filename: "sermons.db",
    driver: sqlite3.Database,
  });

  // Get all blocks with embeddings
  const blocks = await db.all(`
    SELECT b.uid, b.text, b.embedding, b.sermon_uid, b.section_uid, b.paragraph_uid,
           s.title as sermon_title, s.date as sermon_date,
           sec.number as section_number
    FROM blocks b
    JOIN sermons s ON b.sermon_uid = s.uid
    LEFT JOIN sections sec ON b.section_uid = sec.uid
    WHERE b.embedding IS NOT NULL
  `);

  if (blocks.length === 0) {
    console.log('❌ No embeddings found in database');
    return;
  }

  console.log(`📊 Building vector index for ${blocks.length} blocks...`);

  // Initialize simple index
  const index = new SimpleVectorIndex();

  // Build metadata file
  const metadata = {};

  // Add all embeddings
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const embedding = JSON.parse(block.embedding);
    
    index.addPoint(embedding, i);
    
    metadata[i] = {
      uid: block.uid,
      text: block.text,
      sermon_uid: block.sermon_uid,
      section_uid: block.section_uid,
      paragraph_uid: block.paragraph_uid,
      sermon_title: block.sermon_title,
      sermon_date: block.sermon_date,
      section_number: block.section_number
    };

    if ((i + 1) % 10000 === 0) {
      console.log(`   📈 Processed ${i + 1}/${blocks.length} embeddings`);
    }
  }

  // Save index and metadata
  console.log('💾 Saving index to disk...');
  index.writeIndex('sermon_vectors.json');
  fs.writeFileSync('sermon_metadata.json', JSON.stringify(metadata, null, 2));

  console.log('✅ Vector index built and saved!');
  console.log(`   • Index file: sermon_vectors.json`);
  console.log(`   • Metadata file: sermon_metadata.json`);
  console.log(`   • Total vectors: ${blocks.length}`);
  
  await db.close();
}

buildVectorIndex().catch(console.error);