const db = require('../config/db');
const { log } = require('../utils/logger');

async function list(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'gallery', 'Entry: list', { requestId: req.requestId, industry: req.query.industry, client: req.query.client, sort: req.query.sort });
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = (page - 1) * limit;
    const { industry, client, status, type, sort } = req.query;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const dateFrom = req.query.date_from || thirtyDaysAgo;
    const dateTo = req.query.date_to || today;

    let query = db('ads as a')
      .select(
        'a.id', 'a.name', 'a.status', 'a.image_url', 'a.local_image',
        'a.video_url', 'a.local_video', 'a.thumbnail_url', 'a.body_text', 'a.cta_type',
        'c.name as campaign_name', 'c.objective',
        db.raw('COALESCE(aa.account_name, cl.client_name) as client_name'), 'cl.id as client_id',
        'i.name as industry_name',
        'i.id as industry_id'
      )
      .select(
        db.raw('COALESCE(stats.total_spend, 0)::numeric as total_spend'),
        db.raw('COALESCE(stats.total_impressions, 0)::bigint as total_impressions'),
        db.raw('COALESCE(stats.total_clicks, 0)::bigint as total_clicks'),
        db.raw('COALESCE(stats.total_leads, 0)::int as total_leads'),
        db.raw('COALESCE(stats.avg_ctr, 0)::numeric as avg_ctr'),
        db.raw('COALESCE(stats.avg_cpc, 0)::numeric as avg_cpc')
      )
      .leftJoin('campaigns as c', 'a.campaign_id', 'c.id')
      .leftJoin('ad_accounts as aa', 'c.ad_account_id', 'aa.id')
      .leftJoin('clients as cl', 'a.client_id', 'cl.id')
      .leftJoin('industries as i', 'cl.industry_id', 'i.id')
      .leftJoin(
        db('performance_snapshots')
          .where('level', 'ad')
          .whereBetween('date', [dateFrom, dateTo])
          .groupBy('ad_id')
          .select(
            'ad_id',
            db.raw('SUM(spend) as total_spend'),
            db.raw('SUM(impressions) as total_impressions'),
            db.raw('SUM(clicks) as total_clicks'),
            db.raw('SUM(leads) as total_leads'),
            db.raw('CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) * 100 ELSE 0 END as avg_ctr'),
            db.raw('CASE WHEN SUM(clicks) > 0 THEN SUM(spend)::float / SUM(clicks) ELSE 0 END as avg_cpc')
          )
          .as('stats'),
        'a.id', 'stats.ad_id'
      );

    // Only ads with some visual (image or video)
    query = query.where(function () {
      this.whereNotNull('a.image_url')
          .orWhereNotNull('a.local_image')
          .orWhereNotNull('a.thumbnail_url')
          .orWhereNotNull('a.video_url');
    });

    if (industry) {
      query = query.where('cl.industry_id', industry);
    }
    if (client) query = query.where('cl.id', client);
    if (status) query = query.where('a.status', status);
    if (type === 'video') {
      query = query.whereNotNull('a.video_url');
    }

    const [{ count: total }] = await query.clone().clearSelect().clearOrder().count('a.id as count');

    const sortMap = { spend: 'total_spend', ctr: 'avg_ctr', cpc: 'avg_cpc', leads: 'total_leads' };
    const orderBy = sortMap[sort] || 'total_spend';
    const data = await query.orderBy(orderBy, 'desc').limit(limit).offset(offset);

    log('INFO', 'gallery', 'Exit: list', { requestId: req.requestId, total: parseInt(total), returned: data.length, duration: Date.now() - startTime });
    res.json({ data, meta: { page, limit, total: parseInt(total) } });
  } catch (err) {
    log('ERROR', 'gallery', 'Error in list', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function getByAdId(req, res, next) {
  const startTime = Date.now();
  const { ad_id } = req.params;
  log('DEBUG', 'gallery', 'Entry: getByAdId', { requestId: req.requestId, adId: ad_id });
  try {
    const ad = await db('ads as a')
      .select('a.*', 'c.name as campaign_name', 'c.objective', 'c.status as campaign_status',
        'cl.client_name', 'i.name as industry_name')
      .leftJoin('campaigns as c', 'a.campaign_id', 'c.id')
      .leftJoin('clients as cl', 'a.client_id', 'cl.id')
      .leftJoin('industries as i', 'cl.industry_id', 'i.id')
      .where('a.id', ad_id)
      .first();

    if (!ad) {
      log('WARN', 'gallery', 'getByAdId: not found', { requestId: req.requestId, adId: ad_id, duration: Date.now() - startTime });
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ad not found' } });
    }

    const [stats] = await db('performance_snapshots')
      .where({ ad_id, level: 'ad' })
      .select(
        db.raw('SUM(spend)::numeric as total_spend'),
        db.raw('SUM(impressions)::bigint as total_impressions'),
        db.raw('SUM(clicks)::bigint as total_clicks'),
        db.raw('SUM(leads)::int as total_leads'),
        db.raw('MIN(date) as first_date'),
        db.raw('MAX(date) as last_date')
      );

    ad.stats = stats;
    log('INFO', 'gallery', 'Exit: getByAdId', { requestId: req.requestId, adId: ad_id, duration: Date.now() - startTime });
    res.json({ data: ad });
  } catch (err) {
    log('ERROR', 'gallery', 'Error in getByAdId', { requestId: req.requestId, adId: ad_id, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

module.exports = { list, getByAdId };
