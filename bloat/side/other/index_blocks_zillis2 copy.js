// scripts/index_blocks.js
require('dotenv').config();
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const fs = require("fs/promises");
const path = require("path");

const DB_PAGE_LIMIT = 1000; // Page size for SQLite SELECTs
const OUTPUT_DIR = path.join(__dirname, "page_json");

async function main() {
  // Open SQLite
  const db = await open({ filename: "sermons.db", driver: sqlite3.Database });

  // Ensure output dir exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Load pages using LIMIT/OFFSET and write JSON per page
  let page = 0;
  let totalProcessed = 0;
  while (true) {
    const rows = await db.all(
      "SELECT rowid AS id, uid, embedding FROM blocks WHERE embedding IS NOT NULL LIMIT ? OFFSET ?",
      DB_PAGE_LIMIT,
      page * DB_PAGE_LIMIT
    );
    if (rows.length === 0) break;

    const formatted = rows.map(r => ({
      id: r.id,
      block_uid: r.uid,
      embedding: typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding
    }));

    const payload = { rows: formatted };
    const outPath = path.join(OUTPUT_DIR, `page_${page + 1}.json`);
    await fs.writeFile(outPath, JSON.stringify(payload));

    totalProcessed += rows.length;
    console.log(`Wrote page ${page + 1} (${rows.length} rows) to ${outPath}. Total: ${totalProcessed}`);
    page += 1;
  }

  await db.close();
  console.log("✅ Done generating page JSON files.");
}

main().catch(console.error);
