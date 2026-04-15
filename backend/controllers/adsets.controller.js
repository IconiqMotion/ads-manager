const db = require('../config/db');
const { log } = require('../utils/logger');

async function getAds(req, res, next) {
  const startTime = Date.now();
  const { id } = req.params;
  log('DEBUG', 'adsets', 'Entry: getAds', { requestId: req.requestId, adsetId: id });
  try {
    const ads = await db('ads')
      .select(
        'ads.*',
        db.raw('COALESCE(SUM(ps.spend), 0) as total_spend'),
        db.raw('COALESCE(SUM(ps.impressions), 0) as total_impressions'),
        db.raw('COALESCE(SUM(ps.clicks), 0) as total_clicks'),
        db.raw('COALESCE(SUM(ps.leads), 0) as total_leads'),
        db.raw('CASE WHEN SUM(ps.impressions) > 0 THEN ROUND((SUM(ps.clicks)::numeric / SUM(ps.impressions)) * 100, 2) ELSE 0 END as ctr'),
        db.raw('CASE WHEN SUM(ps.clicks) > 0 THEN ROUND(SUM(ps.spend)::numeric / SUM(ps.clicks), 2) ELSE 0 END as cpc')
      )
      .leftJoin('performance_snapshots as ps', 'ps.ad_id', 'ads.id')
      .where('ads.adset_id', id)
      .groupBy('ads.id')
      .orderBy('total_spend', 'desc');

    log('INFO', 'adsets', 'Exit: getAds', { requestId: req.requestId, adsetId: id, count: ads.length, duration: Date.now() - startTime });
    res.json({ data: ads });
  } catch (err) {
    log('ERROR', 'adsets', 'Error in getAds', { requestId: req.requestId, adsetId: id, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

module.exports = { getAds };
