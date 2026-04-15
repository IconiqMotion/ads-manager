const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { log } = require('../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MEDIA_DIR = path.join(__dirname, '../data/media');

/**
 * Generate a text description of an image using GPT-4o-mini vision.
 * Accepts: base64 data URL, http(s) URL, or local file path.
 */
async function describeImage(imageInput) {
  let imageUrl;

  if (imageInput.startsWith('data:') || imageInput.startsWith('http')) {
    imageUrl = imageInput;
  } else {
    // local_image path — read from disk and convert to base64
    const fullPath = path.join(MEDIA_DIR, imageInput);
    const data = fs.readFileSync(fullPath);
    const ext = path.extname(imageInput).slice(1).toLowerCase() || 'jpeg';
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    imageUrl = `data:${mime};base64,${data.toString('base64')}`;
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageUrl, detail: 'low' }
          },
          {
            type: 'text',
            text: 'Describe this advertisement image in detail: the visual style, colors, mood, subject matter, composition, and any text visible. Be concise but specific (2-4 sentences).'
          }
        ]
      }
    ],
    max_tokens: 200
  });

  return response.choices[0].message.content.trim();
}

/**
 * Generate embedding vector for a text string.
 */
async function embedText(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });
  return response.data[0].embedding; // float[]
}

/**
 * Compute cosine similarity between two equal-length arrays.
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Ensure an ad has an embedding stored. If not, generate and save it.
 */
async function ensureAdEmbedding(ad) {
  if (ad.embedding) return ad.embedding;

  const tags = typeof ad.ai_tags === 'string'
    ? JSON.parse(ad.ai_tags || '{}')
    : (ad.ai_tags || {});

  let description = '';

  // Try to build description from ai_tags first (cheap, no vision API call)
  if (tags.style || tags.mood || tags.subject) {
    description = [tags.style, tags.mood, tags.subject, tags.colors, tags.cta_tone]
      .filter(Boolean).join(', ');
  } else {
    // Try vision: local file first, then remote URL
    const tried = [];
    if (ad.local_image) {
      try {
        description = await describeImage(ad.local_image);
      } catch (err) {
        tried.push(`local: ${err.message}`);
      }
    }
    if (!description && ad.image_url) {
      try {
        description = await describeImage(ad.image_url);
      } catch (err) {
        tried.push(`url: ${err.message}`);
      }
    }
    if (!description) {
      log('WARN', 'image-similarity', 'Vision failed for ad', { adId: ad.id, tried });
      description = ad.name || 'advertisement';
    }
  }

  const embedding = await embedText(description);
  await db('ads').where({ id: ad.id }).update({
    embedding: db.raw(`ARRAY[${embedding.join(',')}]::real[]`)
  });
  return embedding;
}

/**
 * Find ads similar to an uploaded image (base64 data URL).
 */
async function findSimilarByImage(imageDataUrl, { limit = 12, excludeAdId = null } = {}) {
  log('INFO', 'image-similarity', 'Finding similar ads by image');

  const description = await describeImage(imageDataUrl);
  log('DEBUG', 'image-similarity', 'Image description', { description });

  const queryEmbedding = await embedText(description);

  let query = db('ads as a')
    .select(
      'a.id', 'a.name', 'a.image_url', 'a.local_image', 'a.ai_tags', 'a.embedding',
      db.raw('COALESCE(aa.account_name, cl.client_name) as client_name'),
      db.raw('COALESCE(stats.avg_ctr, 0)::numeric as avg_ctr')
    )
    .leftJoin('campaigns as c', 'a.campaign_id', 'c.id')
    .leftJoin('ad_accounts as aa', 'c.ad_account_id', 'aa.id')
    .leftJoin('clients as cl', 'a.client_id', 'cl.id')
    .leftJoin(
      db('performance_snapshots')
        .where('level', 'ad')
        .groupBy('ad_id')
        .select('ad_id', db.raw('CASE WHEN SUM(impressions)>0 THEN SUM(clicks)::float/SUM(impressions)*100 ELSE 0 END as avg_ctr'))
        .as('stats'),
      'a.id', 'stats.ad_id'
    )
    .whereNotNull('a.embedding')
    .where(function () {
      this.whereNotNull('a.image_url').orWhereNotNull('a.local_image');
    });

  if (excludeAdId) query = query.whereNot('a.id', excludeAdId);

  const ads = await query;

  if (ads.length === 0) {
    return { description, results: [] };
  }

  const scored = ads.map(ad => {
    const emb = Array.isArray(ad.embedding) ? ad.embedding : JSON.parse(ad.embedding);
    return { ...ad, score: cosineSimilarity(queryEmbedding, emb) };
  });

  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, limit).map(({ embedding, ...rest }) => rest);

  return { description, results };
}

/**
 * Backfill embeddings for ads that don't have one yet.
 */
async function backfillEmbeddings({ limit = 100 } = {}) {
  const ads = await db('ads')
    .whereNull('embedding')
    .where(function () {
      this.whereNotNull('image_url').orWhereNotNull('local_image').orWhereNotNull('ai_tags');
    })
    .select('id', 'name', 'image_url', 'local_image', 'ai_tags')
    .limit(limit);

  let done = 0, errors = 0;
  for (const ad of ads) {
    try {
      await ensureAdEmbedding(ad);
      done++;
      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      log('WARN', 'image-similarity', 'Backfill failed for ad', { adId: ad.id, error: err.message });
      errors++;
    }
  }
  return { processed: ads.length, done, errors };
}

module.exports = { findSimilarByImage, backfillEmbeddings, describeImage, embedText };
