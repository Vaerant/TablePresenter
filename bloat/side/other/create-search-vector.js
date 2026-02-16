const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const OpenAI = require("openai");
const fs = require("fs");

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: 'key' });

async function saveEmbeddingToFile(query, filename) {
  try {
    // Get embedding from OpenAI
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });

    const vector = response.data[0].embedding;

    // Convert to string
    const vectorText = vector.join(",");

    // Save to file
    fs.writeFileSync(filename, vectorText);
    console.log(`✅ Embedding saved to ${filename}`);
  } catch (err) {
    console.error("Error generating embedding:", err);
  }
}

// Example usage
const query = "the substance being faith";
const filename = "./queries/query_vector.txt";

saveEmbeddingToFile(query, filename);
