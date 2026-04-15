const { tagAd, tagUntaggedAds } = require('../services/ai-tagging.service');
const { generateInsights } = require('../services/insights.service');
const { findSimilarAds, getBestStylesByIndustry } = require('../services/clustering.service');
const { getBudgetRecommendations, getCreativeRecommendations } = require('../services/recommendations.service');
const { findSimilarByImage, backfillEmbeddings } = require('../services/image-similarity.service');
const { removeLogo, detectAllElements } = require('../services/logo-removal.service');
const db = require('../config/db');
const { log } = require('../utils/logger');

// --- AI Tagging ---
async function tagSingleAd(req, res, next) {
  const startTime = Date.now();
  log('INFO', 'intelligence', 'Entry: tagSingleAd', { requestId: req.requestId, adId: req.params.id });
  try {
    const tags = await tagAd(req.params.id);
    log('INFO', 'intelligence', 'Exit: tagSingleAd', { requestId: req.requestId, duration: Date.now() - startTime });
    res.json({ data: tags });
  } catch (err) {
    log('ERROR', 'intelligence', 'Error in tagSingleAd', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function tagBatch(req, res, next) {
  const startTime = Date.now();
  log('INFO', 'intelligence', 'Entry: tagBatch', { requestId: req.requestId });
  try {
    const result = await tagUntaggedAds({ limit: parseInt(req.query.limit) || 200 });
    log('INFO', 'intelligence', 'Exit: tagBatch', { requestId: req.requestId, ...result, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'intelligence', 'Error in tagBatch', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

// --- Insights ---
async function generateInsightsHandler(req, res, next) {
  const startTime = Date.now();
  log('INFO', 'intelligence', 'Entry: generateInsights', { requestId: req.requestId, period: req.query.period });
  try {
    const result = await generateInsights({ period: req.query.period || 'daily' });
    log('INFO', 'intelligence', 'Exit: generateInsights', { requestId: req.requestId, ...result, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'intelligence', 'Error in generateInsights', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function listInsights(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'intelligence', 'Entry: listInsights', { requestId: req.requestId });
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    let query = db('insights').orderBy('created_at', 'desc');
    if (req.query.type) query = query.where('type', req.query.type);
    if (req.query.severity) query = query.where('severity', req.query.severity);
    if (req.query.unread === 'true') query = query.where('is_read', false);

    const [{ count: total }] = await query.clone().clearOrder().count('* as count');
    const data = await query.limit(limit).offset(offset);

    log('INFO', 'intelligence', 'Exit: listInsights', { requestId: req.requestId, count: data.length, duration: Date.now() - startTime });
    res.json({ data, meta: { page, limit, total: parseInt(total) } });
  } catch (err) {
    log('ERROR', 'intelligence', 'Error in listInsights', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function markInsightsRead(req, res, next) {
  try {
    const ids = req.body.ids;
    if (!Array.isArray(ids)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'ids array required' } });
    await db('insights').whereIn('id', ids).update({ is_read: true });
    res.json({ data: { message: `${ids.length} insights marked as read` } });
  } catch (err) { next(err); }
}

// --- Clustering ---
async function similarAds(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'intelligence', 'Entry: similarAds', { requestId: req.requestId, adId: req.params.id });
  try {
    const data = await findSimilarAds(req.params.id, { limit: parseInt(req.query.limit) || 10 });
    log('INFO', 'intelligence', 'Exit: similarAds', { requestId: req.requestId, count: data.length, duration: Date.now() - startTime });
    res.json({ data });
  } catch (err) {
    log('ERROR', 'intelligence', 'Error in similarAds', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function industryStyles(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'intelligence', 'Entry: industryStyles', { requestId: req.requestId, industryId: req.params.id });
  try {
    const data = await getBestStylesByIndustry(req.params.id);
    log('INFO', 'intelligence', 'Exit: industryStyles', { requestId: req.requestId, adCount: data.ads.length, duration: Date.now() - startTime });
    res.json({ data });
  } catch (err) {
    log('ERROR', 'intelligence', 'Error in industryStyles', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

// --- Image Similarity ---
async function similarByImage(req, res, next) {
  const startTime = Date.now();
  log('INFO', 'intelligence', 'Entry: similarByImage', { requestId: req.requestId });
  try {
    const { image, limit } = req.body;
    if (!image || !image.startsWith('data:')) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'image must be a base64 data URL' } });
    }
    const result = await findSimilarByImage(image, { limit: parseInt(limit) || 12 });
    log('INFO', 'intelligence', 'Exit: similarByImage', { requestId: req.requestId, count: result.results.length, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'intelligence', 'Error in similarByImage', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function backfillEmbeddingsHandler(req, res, next) {
  const startTime = Date.now();
  log('INFO', 'intelligence', 'Entry: backfillEmbeddings', { requestId: req.requestId });
  try {
    const result = await backfillEmbeddings({ limit: parseInt(req.query.limit) || 100 });
    log('INFO', 'intelligence', 'Exit: backfillEmbeddings', { requestId: req.requestId, ...result, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'intelligence', 'Error in backfillEmbeddings', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

// --- Recommendations ---
async function budgetRecommendations(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'intelligence', 'Entry: budgetRecommendations', { requestId: req.requestId, clientId: req.params.id });
  try {
    const data = await getBudgetRecommendations(req.params.id);
    log('INFO', 'intelligence', 'Exit: budgetRecommendations', { requestId: req.requestId, count: data.length, duration: Date.now() - startTime });
    res.json({ data });
  } catch (err) {
    log('ERROR', 'intelligence', 'Error in budgetRecommendations', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function creativeRecommendations(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'intelligence', 'Entry: creativeRecommendations', { requestId: req.requestId, industryId: req.params.id });
  try {
    const data = await getCreativeRecommendations(req.params.id);
    log('INFO', 'intelligence', 'Exit: creativeRecommendations', { requestId: req.requestId, duration: Date.now() - startTime });
    res.json({ data });
  } catch (err) {
    log('ERROR', 'intelligence', 'Error in creativeRecommendations', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}


// --- Logo Removal ---
async function removeLogoHandler(req, res, next) {
  const startTime = Date.now();
  const { ad_id } = req.params;
  log('INFO', 'intelligence', 'Entry: removeLogo', { requestId: req.requestId, adId: ad_id });
  try {
    const ad = await db('ads').where({ id: ad_id }).select('id','name','image_url','local_image').first();
    if (!ad) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ad not found' } });
    const result = await removeLogo(ad);
    if (result.found && result.outputPath) {
      await db('ads').where({ id: ad_id }).update({ local_image: result.outputPath });
    }
    log('INFO', 'intelligence', 'Exit: removeLogo', { requestId: req.requestId, adId: ad_id, found: result.found, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'intelligence', 'Error in removeLogo', { requestId: req.requestId, adId: ad_id, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}


async function batchRemoveLogoHandler(req, res, next) {
  const startTime = Date.now();
  const concurrency = parseInt(req.query.concurrency) || 2;
  const limit = parseInt(req.query.limit) || 0;
  log('INFO', 'intelligence', 'Entry: batchRemoveLogo', { requestId: req.requestId, concurrency, limit });

  try {
    let query = db('ads')
      .whereNotNull('local_image')
      .where('local_image', 'not like', '%nologo%')
      .whereNull('video_url')
      .select('id', 'name', 'image_url', 'local_image');
    if (limit > 0) query = query.limit(limit);
    const ads = await query;

    log('INFO', 'intelligence', 'batchRemoveLogo: found candidates', { count: ads.length });
    res.json({ data: { message: 'Batch logo removal started', total: ads.length, concurrency } });

    let processed = 0, found = 0, failed = 0;
    const queue = [...ads];

    async function worker() {
      while (queue.length > 0) {
        const ad = queue.shift();
        try {
          const result = await removeLogo(ad);
          processed++;
          if (result.found && result.outputPath) {
            await db('ads').where({ id: ad.id }).update({ local_image: result.outputPath });
            found++;
          }
          if (processed % 10 === 0) {
            log('INFO', 'intelligence', 'batchRemoveLogo progress', { processed, found, failed, remaining: queue.length });
          }
        } catch (err) {
          processed++;
          failed++;
          log('ERROR', 'intelligence', 'batchRemoveLogo: ad failed', { adId: ad.id, error: err.message });
        }
      }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) workers.push(worker());
    Promise.all(workers).then(() => {
      log('INFO', 'intelligence', 'batchRemoveLogo COMPLETE', { processed, found, failed, duration: Date.now() - startTime });
    });

  } catch (err) {
    log('ERROR', 'intelligence', 'Error in batchRemoveLogo', { requestId: req.requestId, error: err.message });
    if (!res.headersSent) next(err);
  }
}

module.exports = {
  tagSingleAd, tagBatch,
  generateInsightsHandler, listInsights, markInsightsRead,
  similarAds, industryStyles,
  similarByImage, backfillEmbeddingsHandler,
  budgetRecommendations, creativeRecommendations,
  removeLogoHandler,
  batchRemoveLogoHandler
};
