const db = require('../config/db');
const { log } = require('../utils/logger');

async function list(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'campaigns', 'Entry: list', { requestId: req.requestId, page: req.query.page, client_id: req.query.client_id, status: req.query.status });
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const { client_id, status, objective, date_from, date_to } = req.query;

    let query = db('campaigns')
      .select('campaigns.*', 'clients.client_name', 'ad_accounts.account_name')
      .leftJoin('clients', 'campaigns.client_id', 'clients.id')
      .leftJoin('ad_accounts', 'campaigns.ad_account_id', 'ad_accounts.id');

    if (client_id) query = query.where('campaigns.client_id', client_id);
    if (status) query = query.where('campaigns.status', status);
    if (objective) query = query.where('campaigns.objective', objective);
    if (date_from) query = query.where('campaigns.start_date', '>=', date_from);
    if (date_to) query = query.where(function () {
      this.where('campaigns.end_date', '<=', date_to).orWhereNull('campaigns.end_date');
    });

    const [{ count: total }] = await query.clone().clearSelect().clearOrder().count('campaigns.id as count');
    const data = await query.orderBy('campaigns.updated_at', 'desc').limit(limit).offset(offset);

    log('INFO', 'campaigns', 'Exit: list', { requestId: req.requestId, total: parseInt(total), returned: data.length, duration: Date.now() - startTime });
    res.json({ data, meta: { page, limit, total: parseInt(total) } });
  } catch (err) {
    log('ERROR', 'campaigns', 'Error in list', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function getById(req, res, next) {
  const startTime = Date.now();
  const { id } = req.params;
  log('DEBUG', 'campaigns', 'Entry: getById', { requestId: req.requestId, id });
  try {
    const campaign = await db('campaigns')
      .select('campaigns.*', 'clients.client_name', 'ad_accounts.account_name')
      .leftJoin('clients', 'campaigns.client_id', 'clients.id')
      .leftJoin('ad_accounts', 'campaigns.ad_account_id', 'ad_accounts.id')
      .where('campaigns.id', id)
      .first();

    if (!campaign) {
      log('WARN', 'campaigns', 'getById: not found', { requestId: req.requestId, id, duration: Date.now() - startTime });
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
    }

    const [stats] = await db('performance_snapshots')
      .where({ campaign_id: id })
      .select(
        db.raw('SUM(spend) as total_spend'),
        db.raw('SUM(impressions) as total_impressions'),
        db.raw('SUM(clicks) as total_clicks'),
        db.raw('SUM(leads) as total_leads')
      );

    campaign.stats = {
      total_spend: parseFloat(stats.total_spend) || 0,
      total_impressions: parseInt(stats.total_impressions) || 0,
      total_clicks: parseInt(stats.total_clicks) || 0,
      total_leads: parseInt(stats.total_leads) || 0
    };

    log('INFO', 'campaigns', 'Exit: getById', { requestId: req.requestId, id, duration: Date.now() - startTime });
    res.json({ data: campaign });
  } catch (err) {
    log('ERROR', 'campaigns', 'Error in getById', { requestId: req.requestId, id, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function getAdSets(req, res, next) {
  const startTime = Date.now();
  const { id } = req.params;
  log('DEBUG', 'campaigns', 'Entry: getAdSets', { requestId: req.requestId, campaignId: id });
  try {
    const adsets = await db('adsets')
      .where({ campaign_id: id })
      .orderBy('name');

    log('INFO', 'campaigns', 'Exit: getAdSets', { requestId: req.requestId, campaignId: id, count: adsets.length, duration: Date.now() - startTime });
    res.json({ data: adsets });
  } catch (err) {
    log('ERROR', 'campaigns', 'Error in getAdSets', { requestId: req.requestId, campaignId: id, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

module.exports = { list, getById, getAdSets };
