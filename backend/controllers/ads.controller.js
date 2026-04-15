const db = require('../config/db');
const { log } = require('../utils/logger');

async function getById(req, res, next) {
  const startTime = Date.now();
  const { id } = req.params;
  log('DEBUG', 'ads', 'Entry: getById', { requestId: req.requestId, id });
  try {
    const ad = await db('ads')
      .select(
        'ads.*',
        'campaigns.name as campaign_name', 'campaigns.objective',
        'clients.client_name',
        db.raw('COALESCE(ad_industries.name, client_industries.name) as industry_name'),
        db.raw('COALESCE(ads.industry_id, clients.industry_id) as resolved_industry_id')
      )
      .leftJoin('campaigns', 'ads.campaign_id', 'campaigns.id')
      .leftJoin('clients', 'ads.client_id', 'clients.id')
      .leftJoin('industries as ad_industries', 'ads.industry_id', 'ad_industries.id')
      .leftJoin('industries as client_industries', 'clients.industry_id', 'client_industries.id')
      .where('ads.id', id)
      .first();

    if (!ad) {
      log('WARN', 'ads', 'getById: not found', { requestId: req.requestId, id, duration: Date.now() - startTime });
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ad not found' } });
    }

    log('INFO', 'ads', 'Exit: getById', { requestId: req.requestId, id, duration: Date.now() - startTime });
    res.json({ data: ad });
  } catch (err) {
    log('ERROR', 'ads', 'Error in getById', { requestId: req.requestId, id, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function getPerformance(req, res, next) {
  const startTime = Date.now();
  const { id } = req.params;
  log('DEBUG', 'ads', 'Entry: getPerformance', { requestId: req.requestId, id });
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const dateFrom = req.query.date_from || thirtyDaysAgo;
    const dateTo = req.query.date_to || today;

    const snapshots = await db('performance_snapshots')
      .where({ ad_id: id })
      .whereBetween('date', [dateFrom, dateTo])
      .orderBy('date', 'asc');

    log('INFO', 'ads', 'Exit: getPerformance', { requestId: req.requestId, id, count: snapshots.length, duration: Date.now() - startTime });
    res.json({ data: snapshots });
  } catch (err) {
    log('ERROR', 'ads', 'Error in getPerformance', { requestId: req.requestId, id, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function updateIndustry(req, res, next) {
  const startTime = Date.now();
  const { id } = req.params;
  const { industry_id } = req.body;
  log('DEBUG', 'ads', 'Entry: updateIndustry', { requestId: req.requestId, id, industry_id });
  try {
    await db('ads').where({ id }).update({ industry_id: industry_id || null });
    const industry = industry_id ? await db('industries').where({ id: industry_id }).first() : null;
    log('INFO', 'ads', 'Exit: updateIndustry', { requestId: req.requestId, id, industry_id, duration: Date.now() - startTime });
    res.json({ data: { industry_id: industry_id || null, industry_name: industry?.name || null } });
  } catch (err) {
    log('ERROR', 'ads', 'Error in updateIndustry', { requestId: req.requestId, id, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function classifyIndustry(req, res, next) {
  const startTime = Date.now();
  const { id } = req.params;
  log('DEBUG', 'ads', 'Entry: classifyIndustry', { requestId: req.requestId, id });
  try {
    const { classifyAndSaveAdIndustry } = require('../services/ai-industry.service');
    const result = await classifyAndSaveAdIndustry(id);
    if (!result) {
      return res.status(422).json({ error: { code: 'CLASSIFICATION_FAILED', message: 'Could not classify this ad' } });
    }
    log('INFO', 'ads', 'Exit: classifyIndustry', { requestId: req.requestId, id, result, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'ads', 'Error in classifyIndustry', { requestId: req.requestId, id, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

module.exports = { getById, getPerformance, updateIndustry, classifyIndustry };
