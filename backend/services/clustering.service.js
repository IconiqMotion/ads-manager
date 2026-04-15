const db = require('../config/db');
const { log, generateId } = require('../utils/logger');

/**
 * Find ads similar to a given ad based on:
 * - Same client or same industry
 * - Similar CTA type
 * - Similar AI tags (mood, style, categories)
 * - Good performance (high CTR)
 */
async function findSimilarAds(adId, { limit = 10 } = {}) {
  const startTime = Date.now();
  log('DEBUG', 'clustering', 'Entry: findSimilarAds', { adId, limit });

  try {
    const ad = await db('ads')
      .select('ads.*', 'clients.industry_id', 'clients.id as client_id_ref')
      .leftJoin('clients', 'ads.client_id', 'clients.id')
      .where('ads.id', adId)
      .first();

    if (!ad) {
      log('WARN', 'clustering', 'Ad not found', { adId });
      return [];
    }

    const tags = typeof ad.ai_tags === 'string' ? JSON.parse(ad.ai_tags) : (ad.ai_tags || {});

    // Find similar ads by industry + CTA + performance
    let query = db('ads as a')
      .select(
        'a.id', 'a.name', 'a.image_url', 'a.local_image', 'a.cta_type', 'a.ai_tags', 'a.status',
        'c.name as campaign_name', 'cl.client_name',
        db.raw('COALESCE(stats.total_spend, 0)::numeric as total_spend'),
        db.raw('COALESCE(stats.avg_ctr, 0)::numeric as avg_ctr'),
        db.raw('COALESCE(stats.total_clicks, 0)::bigint as total_clicks')
      )
      .leftJoin('campaigns as c', 'a.campaign_id', 'c.id')
      .leftJoin('clients as cl', 'a.client_id', 'cl.id')
      .leftJoin(
        db('performance_snapshots')
          .where('level', 'ad')
          .groupBy('ad_id')
          .select(
            'ad_id',
            db.raw('SUM(spend) as total_spend'),
            db.raw('SUM(clicks) as total_clicks'),
            db.raw('CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) * 100 ELSE 0 END as avg_ctr')
          )
          .as('stats'),
        'a.id', 'stats.ad_id'
      )
      .where('a.id', '!=', adId)
      .whereNotNull('a.image_url');

    // Score similarity: same industry > same CTA > performance
    if (ad.industry_id) {
      query = query.where('cl.industry_id', ad.industry_id);
    }

    query = query
      .orderByRaw('CASE WHEN a.cta_type = ? THEN 0 ELSE 1 END', [ad.cta_type])
      .orderBy('avg_ctr', 'desc')
      .limit(limit);

    const similar = await query;

    const duration = Date.now() - startTime;
    log('INFO', 'clustering', 'Exit: findSimilarAds', { adId, found: similar.length, duration });

    return similar;
  } catch (err) {
    log('ERROR', 'clustering', 'Error in findSimilarAds', { adId, error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

/**
 * Get best performing creative styles per industry.
 */
async function getBestStylesByIndustry(industryId) {
  const startTime = Date.now();
  log('DEBUG', 'clustering', 'Entry: getBestStylesByIndustry', { industryId });

  try {
    const results = await db('ads as a')
      .join('clients as cl', 'a.client_id', 'cl.id')
      .leftJoin(
        db('performance_snapshots')
          .where('level', 'ad')
          .groupBy('ad_id')
          .select('ad_id',
            db.raw('SUM(spend) as total_spend'),
            db.raw('CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) * 100 ELSE 0 END as avg_ctr')
          ).as('stats'),
        'a.id', 'stats.ad_id'
      )
      .where('cl.industry_id', industryId)
      .whereNotNull('a.ai_tags')
      .select('a.id', 'a.name', 'a.image_url', 'a.local_image', 'a.cta_type', 'a.ai_tags',
        'cl.client_name',
        db.raw('COALESCE(stats.avg_ctr, 0)::numeric as avg_ctr'),
        db.raw('COALESCE(stats.total_spend, 0)::numeric as total_spend'))
      .orderBy('avg_ctr', 'desc')
      .limit(20);

    // Group by style/mood from ai_tags
    const byStyle = {};
    for (const ad of results) {
      const tags = typeof ad.ai_tags === 'string' ? JSON.parse(ad.ai_tags) : (ad.ai_tags || {});
      const key = tags.style || tags.mood || 'unknown';
      if (!byStyle[key]) byStyle[key] = [];
      byStyle[key].push(ad);
    }

    const duration = Date.now() - startTime;
    log('INFO', 'clustering', 'Exit: getBestStylesByIndustry', { industryId, adCount: results.length, styleCount: Object.keys(byStyle).length, duration });

    return { ads: results, byStyle };
  } catch (err) {
    log('ERROR', 'clustering', 'Error in getBestStylesByIndustry', { industryId, error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

module.exports = { findSimilarAds, getBestStylesByIndustry };
