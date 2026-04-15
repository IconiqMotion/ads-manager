const db = require('../config/db');
const { log, generateId } = require('../utils/logger');

/**
 * Recommend budget allocation based on historical ROAS per campaign.
 * Returns campaigns sorted by efficiency with suggested budget shifts.
 */
async function getBudgetRecommendations(clientId) {
  const startTime = Date.now();
  log('DEBUG', 'recommendations', 'Entry: getBudgetRecommendations', { clientId });

  try {
    const campaigns = await db('performance_snapshots as ps')
      .join('campaigns as c', 'ps.campaign_id', 'c.id')
      .where('c.client_id', clientId)
      .where('ps.level', 'ad')
      .where('ps.date', '>=', new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
      .groupBy('c.id', 'c.name', 'c.status', 'c.daily_budget')
      .having(db.raw('SUM(ps.spend) > 0'))
      .select(
        'c.id', 'c.name', 'c.status', 'c.daily_budget',
        db.raw('SUM(ps.spend)::numeric as total_spend'),
        db.raw('SUM(ps.leads)::int as total_leads'),
        db.raw('SUM(ps.clicks)::bigint as total_clicks'),
        db.raw('SUM(ps.impressions)::bigint as total_impressions'),
        db.raw('CASE WHEN SUM(ps.impressions) > 0 THEN SUM(ps.clicks)::float / SUM(ps.impressions) * 100 ELSE 0 END as ctr'),
        db.raw('CASE WHEN SUM(ps.clicks) > 0 THEN SUM(ps.spend)::float / SUM(ps.clicks) ELSE 0 END as cpc'),
        db.raw('CASE WHEN SUM(ps.leads) > 0 THEN SUM(ps.spend)::float / SUM(ps.leads) ELSE 0 END as cpl')
      )
      .orderBy('cpl', 'asc');

    // Generate recommendations
    const recommendations = campaigns.map((c, i) => {
      const spend = parseFloat(c.total_spend) || 0;
      const leads = parseInt(c.total_leads) || 0;
      const cpl = parseFloat(c.cpl) || 0;
      const ctr = parseFloat(c.ctr) || 0;

      let action = 'maintain';
      let reason = '';

      if (leads > 0 && cpl > 0 && i < campaigns.length / 3) {
        action = 'increase';
        reason = `Best CPL (${cpl.toFixed(2)}) — increase budget to get more leads`;
      } else if (ctr < 0.5 && spend > 100) {
        action = 'decrease';
        reason = `Low CTR (${ctr.toFixed(2)}%) with high spend — reduce or pause`;
      } else if (leads === 0 && spend > 50) {
        action = 'review';
        reason = `Spending ${spend.toFixed(2)} with 0 leads — review targeting/creative`;
      } else if (ctr > 2 && leads > 0) {
        action = 'increase';
        reason = `Good CTR (${ctr.toFixed(2)}%) and generating leads — scale up`;
      }

      return { ...c, total_spend: spend, cpl, action, reason };
    });

    const duration = Date.now() - startTime;
    log('INFO', 'recommendations', 'Exit: getBudgetRecommendations', { clientId, campaigns: campaigns.length, duration });

    return recommendations;
  } catch (err) {
    log('ERROR', 'recommendations', 'Error in getBudgetRecommendations', { clientId, error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

/**
 * Get best performing creative styles/patterns for an industry.
 */
async function getCreativeRecommendations(industryId) {
  const startTime = Date.now();
  log('DEBUG', 'recommendations', 'Entry: getCreativeRecommendations', { industryId });

  try {
    // Top ads in this industry by CTR
    const topAds = await db('ads as a')
      .join('clients as cl', 'a.client_id', 'cl.id')
      .leftJoin(
        db('performance_snapshots').where('level', 'ad').groupBy('ad_id')
          .select('ad_id',
            db.raw('SUM(spend) as total_spend'),
            db.raw('SUM(clicks) as total_clicks'),
            db.raw('SUM(impressions) as total_impressions'),
            db.raw('CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) * 100 ELSE 0 END as avg_ctr')
          ).as('stats'),
        'a.id', 'stats.ad_id'
      )
      .where('cl.industry_id', industryId)
      .where(db.raw('COALESCE(stats.total_impressions, 0) > 100'))
      .select('a.id', 'a.name', 'a.image_url', 'a.local_image', 'a.cta_type', 'a.body_text', 'a.ai_tags',
        'cl.client_name',
        db.raw('COALESCE(stats.avg_ctr, 0) as avg_ctr'),
        db.raw('COALESCE(stats.total_spend, 0) as total_spend'))
      .orderBy('avg_ctr', 'desc')
      .limit(10);

    // Analyze patterns
    const ctaDistribution = {};
    const moodDistribution = {};
    for (const ad of topAds) {
      if (ad.cta_type) ctaDistribution[ad.cta_type] = (ctaDistribution[ad.cta_type] || 0) + 1;
      const tags = typeof ad.ai_tags === 'string' ? JSON.parse(ad.ai_tags || '{}') : (ad.ai_tags || {});
      if (tags.mood) moodDistribution[tags.mood] = (moodDistribution[tags.mood] || 0) + 1;
    }

    const duration = Date.now() - startTime;
    log('INFO', 'recommendations', 'Exit: getCreativeRecommendations', { industryId, topAdsCount: topAds.length, duration });

    return {
      topAds,
      patterns: {
        bestCta: Object.entries(ctaDistribution).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        ctaDistribution,
        bestMood: Object.entries(moodDistribution).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        moodDistribution
      }
    };
  } catch (err) {
    log('ERROR', 'recommendations', 'Error in getCreativeRecommendations', { industryId, error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

module.exports = { getBudgetRecommendations, getCreativeRecommendations };
