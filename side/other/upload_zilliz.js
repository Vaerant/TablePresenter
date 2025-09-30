require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const { MilvusClient, DataType } = require('@zilliz/milvus2-sdk-node');

const OUTPUT_DIR = path.join(__dirname, 'page_json'); // same as generator script
const COLLECTION_NAME = process.env.ZILLIZ_COLLECTION || 'blocks_embeddings';
const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM || '1536', 10);

function buildClient() {
	// Prefer token, fallback to username/password
	const address = process.env.ZILLIZ_ADDRESS;
	if (!address) {
		throw new Error('Missing ZILLIZ_ADDRESS (e.g. xxx.api.zillizcloud.com:19530)');
	}
	const ssl = process.env.ZILLIZ_SSL ? process.env.ZILLIZ_SSL !== 'false' : true;
	const opts = { address, ssl };
	if (process.env.ZILLIZ_TOKEN) {
		opts.token = process.env.ZILLIZ_TOKEN;
	} else if (process.env.ZILLIZ_USERNAME && process.env.ZILLIZ_PASSWORD) {
		opts.username = process.env.ZILLIZ_USERNAME;
		opts.password = process.env.ZILLIZ_PASSWORD;
	}
	return new MilvusClient(opts);
}

async function ensureCollection(client) {
	const has = await client.hasCollection({ collection_name: COLLECTION_NAME });
	if (has.value) return;

	console.log(`Creating collection '${COLLECTION_NAME}'...`);
	await client.createCollection({
		collection_name: COLLECTION_NAME,
		fields: [
			{ name: 'id', data_type: DataType.Int64, is_primary_key: true, autoID: false },
			{ name: 'block_uid', data_type: DataType.VarChar, max_length: 128 },
			{ name: 'embedding', data_type: DataType.FloatVector, dim: EMBEDDING_DIM },
		],
	});

	// Create vector index (AUTOINDEX lets Zilliz choose a good index)
	await client.createIndex({
		collection_name: COLLECTION_NAME,
		field_name: 'embedding',
		index_name: 'emb_idx',
		index_type: 'AUTOINDEX',
		metric_type: 'COSINE',
		params: {},
	});

	// Load for future search (not required for insert but harmless)
	await client.loadCollectionSync({ collection_name: COLLECTION_NAME });
	console.log(`Collection '${COLLECTION_NAME}' is ready.`);
}

async function uploadPages() {
	const client = buildClient();
	await ensureCollection(client);

	// Read all page JSON files
	const files = (await fs.readdir(OUTPUT_DIR))
		.filter(f => f.toLowerCase().endsWith('.json'))
		.sort();

	let total = 0;
	for (const file of files) {
		const full = path.join(OUTPUT_DIR, file);
		const json = JSON.parse(await fs.readFile(full, 'utf8'));
		const rows = Array.isArray(json.rows) ? json.rows : [];
		if (!rows.length) {
			console.log(`Skip ${file} (no rows)`);
			continue;
		}

		const fields_data = rows.map(r => ({
			id: r.id,
			block_uid: r.block_uid,
			embedding: Array.isArray(r.embedding) ? r.embedding : JSON.parse(r.embedding),
		}));

		const res = await client.insert({
			collection_name: COLLECTION_NAME,
			fields_data,
		});

		total += rows.length;
		console.log(`Inserted ${rows.length} from ${file}. Total inserted: ${total}. Result: ${res.insert_cnt || ''}`);
	}

	// Ensure data is persisted
	await client.flushSync({ collection_names: [COLLECTION_NAME] });
	console.log(`✅ Upload complete. Total entities: ${total}`);

	await client.closeConnection();
}

uploadPages().catch(err => {
	console.error('Upload failed:', err);
	process.exit(1);
});
