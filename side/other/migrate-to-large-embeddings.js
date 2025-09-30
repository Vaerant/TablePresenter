const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

async function migrateToLargeEmbeddings() {
  console.log('🔄 Migrating to text-embedding-3-large...');
  
  const db = await open({
    filename: "sermons.db",
    driver: sqlite3.Database,
  });

  try {
    // Clear all existing embeddings and progress
    console.log('🧹 Clearing existing paragraph embeddings...');
    await db.run('UPDATE paragraphs SET paragraph_embedding = NULL');
    
    console.log('🧹 Clearing progress table...');
    await db.run('DELETE FROM paragraph_embedding_progress');
    
    // Get stats
    const [stats] = await db.all('SELECT COUNT(*) as total FROM paragraphs');
    console.log(`✅ Migration complete! Ready to re-embed ${stats.total} paragraphs with text-embedding-3-large`);
    
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    await db.close();
  }
}

migrateToLargeEmbeddings().catch(console.error);