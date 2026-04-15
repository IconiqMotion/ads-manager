const dashboardService = require('../services/dashboard.service');
const { log } = require('../utils/logger');

async function overview(req, res, next) {
  try {
    const startTime = Date.now();
    log('INFO', 'dashboard', 'Overview requested', { requestId: req.requestId, dateFrom: req.query.date_from, dateTo: req.query.date_to });
    const data = await dashboardService.getOverview(req.query);
    log('INFO', 'dashboard', 'Overview complete', { requestId: req.requestId, duration: Date.now() - startTime });
    res.json({ data });
  } catch (err) {
    log('ERROR', 'dashboard', 'Overview failed', { requestId: req.requestId, error: err.message });
    next(err);
  }
}

async function byIndustry(req, res, next) {
  try {
    const startTime = Date.now();
    log('INFO', 'dashboard', 'By-industry requested', { requestId: req.requestId });
    const data = await dashboardService.getByIndustry(req.query);
    log('INFO', 'dashboard', 'By-industry complete', { requestId: req.requestId, rowCount: data.length, duration: Date.now() - startTime });
    res.json({ data });
  } catch (err) {
    log('ERROR', 'dashboard', 'By-industry failed', { requestId: req.requestId, error: err.message });
    next(err);
  }
}

async function byClient(req, res, next) {
  try {
    const startTime = Date.now();
    const clientId = req.params.id;
    log('INFO', 'dashboard', 'By-client requested', { requestId: req.requestId, clientId });
    const data = await dashboardService.getByClient(clientId, req.query);
    log('INFO', 'dashboard', 'By-client complete', { requestId: req.requestId, clientId, duration: Date.now() - startTime });
    res.json({ data });
  } catch (err) {
    log('ERROR', 'dashboard', 'By-client failed', { requestId: req.requestId, error: err.message });
    next(err);
  }
}

async function topAds(req, res, next) {
  try {
    const startTime = Date.now();
    const params = { sortBy: req.query.sort_by, limit: parseInt(req.query.limit) || 20, dateFrom: req.query.date_from, dateTo: req.query.date_to };
    log('INFO', 'dashboard', 'Top-ads requested', { requestId: req.requestId, ...params });
    const data = await dashboardService.getTopAds(params);
    log('INFO', 'dashboard', 'Top-ads complete', { requestId: req.requestId, rowCount: data.length, duration: Date.now() - startTime });
    res.json({ data });
  } catch (err) {
    log('ERROR', 'dashboard', 'Top-ads failed', { requestId: req.requestId, error: err.message });
    next(err);
  }
}

async function trends(req, res, next) {
  try {
    const startTime = Date.now();
    const params = { campaignId: req.query.campaign_id, adAccountId: req.query.ad_account_id, metric: req.query.metric, granularity: req.query.granularity, dateFrom: req.query.date_from, dateTo: req.query.date_to };
    log('INFO', 'dashboard', 'Trends requested', { requestId: req.requestId, ...params });
    const data = await dashboardService.getTrends(params);
    log('INFO', 'dashboard', 'Trends complete', { requestId: req.requestId, rowCount: data.length, duration: Date.now() - startTime });
    res.json({ data });
  } catch (err) {
    log('ERROR', 'dashboard', 'Trends failed', { requestId: req.requestId, error: err.message });
    next(err);
  }
}

async function trendsComparison(req, res, next) {
  try {
    const startTime = Date.now();
    const params = { campaignId: req.query.campaign_id, adAccountId: req.query.ad_account_id, metric: req.query.metric, granularity: req.query.granularity, dateFrom: req.query.date_from, dateTo: req.query.date_to };
    log('INFO', 'dashboard', 'Trends comparison requested', { requestId: req.requestId, ...params });
    const data = await dashboardService.getTrendsComparison(params);
    log('INFO', 'dashboard', 'Trends comparison complete', { requestId: req.requestId, duration: Date.now() - startTime });
    res.json({ data });
  } catch (err) {
    log('ERROR', 'dashboard', 'Trends comparison failed', { requestId: req.requestId, error: err.message });
    next(err);
  }
}

async function benchmarks(req, res, next) {
  try {
    const startTime = Date.now();
    const params = { industryId: req.query.industry_id, dateFrom: req.query.date_from, dateTo: req.query.date_to };
    log('INFO', 'dashboard', 'Benchmarks requested', { requestId: req.requestId, ...params });
    const data = await dashboardService.getBenchmarks(params);
    log('INFO', 'dashboard', 'Benchmarks complete', { requestId: req.requestId, duration: Date.now() - startTime });
    res.json({ data });
  } catch (err) {
    log('ERROR', 'dashboard', 'Benchmarks failed', { requestId: req.requestId, error: err.message });
    next(err);
  }
}

module.exports = { overview, byIndustry, byClient, topAds, trends, trendsComparison, benchmarks };
