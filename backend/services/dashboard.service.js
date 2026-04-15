const db = require('../config/db');
const { log } = require('../utils/logger');

function defaultDateRange() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  return {
    dateFrom: thirtyDaysAgo.toISOString().split('T')[0],
    dateTo: now.toISOString().split('T')[0]
  };
}

async function getOverview({ dateFrom, dateTo } = {}) {
  const startTime = Date.now();
  log('DEBUG', 'dashboard', 'Entry: getOverview', { dateFrom, dateTo });

  try {
    const range = dateFrom && dateTo ? { dateFrom, dateTo } : defaultDateRange();

    const [result] = await db('performance_snapshots')
      .where('level', 'ad')
      .whereBetween('date', [range.dateFrom, range.dateTo])
      .select(
        db.raw('SUM(spend)::numeric as total_spend'),
        db.raw('SUM(impressions)::bigint as total_impressions'),
        db.raw('SUM(clicks)::bigint as total_clicks'),
        db.raw('SUM(reach)::bigint as total_reach'),
        db.raw('SUM(leads)::int as total_leads'),
        db.raw('SUM(purchases)::int as total_purchases'),
        db.raw('SUM(conversions)::int as total_conversions'),
        db.raw('COUNT(DISTINCT ad_account_id)::int as active_accounts'),
        db.raw('COUNT(DISTINCT campaign_id)::int as active_campaigns')
      );

    const totalSpend = parseFloat(result.total_spend) || 0;
    const totalClicks = parseInt(result.total_clicks) || 0;
    const totalImpressions = parseInt(result.total_impressions) || 0;

    const duration = Date.now() - startTime;
    log('INFO', 'dashboard', 'Exit: getOverview', { activeAccounts: result.active_accounts, activeCampaigns: result.active_campaigns, totalSpend, duration });

    return {
      ...result,
      total_spend: totalSpend,
      avg_ctr: totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : 0,
      avg_cpc: totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : 0,
      avg_cpm: totalImpressions > 0 ? (totalSpend / totalImpressions * 1000).toFixed(2) : 0,
      date_range: range
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'dashboard', 'Error in getOverview', { dateFrom, dateTo, error: err.message, stack: err.stack, duration });
    throw err;
  }
}

async function getByIndustry({ dateFrom, dateTo } = {}) {
  const startTime = Date.now();
  log('DEBUG', 'dashboard', 'Entry: getByIndustry', { dateFrom, dateTo });

  try {
    const range = dateFrom && dateTo ? { dateFrom, dateTo } : defaultDateRange();

    const rows = await db('performance_snapshots as ps')
      .join('campaigns as c', 'ps.campaign_id', 'c.id')
      .join('clients as cl', 'c.client_id', 'cl.id')
      .join('industries as i', 'cl.industry_id', 'i.id')
      .where('ps.level', 'ad')
      .whereBetween('ps.date', [range.dateFrom, range.dateTo])
      .groupBy('i.id', 'i.name')
      .select(
        'i.id as industry_id',
        'i.name as industry_name',
        db.raw('SUM(ps.spend)::numeric as total_spend'),
        db.raw('SUM(ps.impressions)::bigint as total_impressions'),
        db.raw('SUM(ps.clicks)::bigint as total_clicks'),
        db.raw('SUM(ps.leads)::int as total_leads'),
        db.raw('COUNT(DISTINCT cl.id)::int as client_count'),
        db.raw('COUNT(DISTINCT c.id)::int as campaign_count')
      )
      .orderBy('total_spend', 'desc');

    const result = rows.map(r => ({
      ...r,
      total_spend: parseFloat(r.total_spend) || 0,
      avg_ctr: parseInt(r.total_impressions) > 0
        ? (parseInt(r.total_clicks) / parseInt(r.total_impressions) * 100).toFixed(2)
        : 0
    }));

    const duration = Date.now() - startTime;
    log('INFO', 'dashboard', 'Exit: getByIndustry', { industryCount: result.length, duration });
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'dashboard', 'Error in getByIndustry', { dateFrom, dateTo, error: err.message, stack: err.stack, duration });
    throw err;
  }
}

async function getByClient(clientId, { dateFrom, dateTo } = {}) {
  const startTime = Date.now();
  log('DEBUG', 'dashboard', 'Entry: getByClient', { clientId, dateFrom, dateTo });

  try {
    const range = dateFrom && dateTo ? { dateFrom, dateTo } : defaultDateRange();

    const [result] = await db('performance_snapshots as ps')
      .join('campaigns as c', 'ps.campaign_id', 'c.id')
      .where('c.client_id', clientId)
      .where('ps.level', 'ad')
      .whereBetween('ps.date', [range.dateFrom, range.dateTo])
      .select(
        db.raw('SUM(ps.spend)::numeric as total_spend'),
        db.raw('SUM(ps.impressions)::bigint as total_impressions'),
        db.raw('SUM(ps.clicks)::bigint as total_clicks'),
        db.raw('SUM(ps.leads)::int as total_leads'),
        db.raw('SUM(ps.purchases)::int as total_purchases'),
        db.raw('COUNT(DISTINCT c.id)::int as campaign_count')
      );

    const duration = Date.now() - startTime;
    log('INFO', 'dashboard', 'Exit: getByClient', { clientId, campaignCount: result.campaign_count, totalSpend: parseFloat(result.total_spend) || 0, duration });

    return { ...result, total_spend: parseFloat(result.total_spend) || 0, date_range: range };
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'dashboard', 'Error in getByClient', { clientId, dateFrom, dateTo, error: err.message, stack: err.stack, duration });
    throw err;
  }
}

async function getTopAds({ sortBy = 'spend', limit = 20, dateFrom, dateTo } = {}) {
  const startTime = Date.now();
  log('DEBUG', 'dashboard', 'Entry: getTopAds', { sortBy, limit, dateFrom, dateTo });

  try {
    const range = dateFrom && dateTo ? { dateFrom, dateTo } : defaultDateRange();

    const validSorts = { spend: 'total_spend', ctr: 'avg_ctr', cpc: 'avg_cpc', leads: 'total_leads', roas: 'avg_roas' };
    const orderCol = validSorts[sortBy] || 'total_spend';

    const rows = await db('performance_snapshots as ps')
      .join('ads as a', 'ps.ad_id', 'a.id')
      .join('campaigns as c', 'a.campaign_id', 'c.id')
      .join('clients as cl', 'a.client_id', 'cl.id')
      .leftJoin('industries as i', 'cl.industry_id', 'i.id')
      .where('ps.level', 'ad')
      .whereBetween('ps.date', [range.dateFrom, range.dateTo])
      .groupBy('a.id', 'a.name', 'a.image_url', 'a.local_image', 'a.status',
        'c.name', 'c.objective', 'cl.client_name', 'i.name')
      .select(
        'a.id', 'a.name', 'a.image_url', 'a.local_image', 'a.status',
        db.raw('c.name as campaign_name'),
        db.raw('c.objective'),
        db.raw('cl.client_name'),
        db.raw('i.name as industry_name'),
        db.raw('SUM(ps.spend)::numeric as total_spend'),
        db.raw('SUM(ps.impressions)::bigint as total_impressions'),
        db.raw('SUM(ps.clicks)::bigint as total_clicks'),
        db.raw('SUM(ps.leads)::int as total_leads'),
        db.raw('CASE WHEN SUM(ps.impressions) > 0 THEN (SUM(ps.clicks)::float / SUM(ps.impressions) * 100) ELSE 0 END as avg_ctr'),
        db.raw('CASE WHEN SUM(ps.clicks) > 0 THEN (SUM(ps.spend)::float / SUM(ps.clicks)) ELSE 0 END as avg_cpc'),
        db.raw('CASE WHEN SUM(ps.spend) > 0 THEN (SUM(ps.purchases)::float / SUM(ps.spend)) ELSE 0 END as avg_roas')
      )
      .orderBy(orderCol, 'desc')
      .limit(Math.min(limit, 100));

    const duration = Date.now() - startTime;
    log('INFO', 'dashboard', 'Exit: getTopAds', { adCount: rows.length, sortBy, duration });
    return rows;
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'dashboard', 'Error in getTopAds', { sortBy, limit, dateFrom, dateTo, error: err.message, stack: err.stack, duration });
    throw err;
  }
}

async function getTrends({ campaignId, adAccountId, metric = 'spend', granularity = 'day', dateFrom, dateTo } = {}) {
  const startTime = Date.now();
  log('DEBUG', 'dashboard', 'Entry: getTrends', { campaignId, adAccountId, metric, granularity, dateFrom, dateTo });

  try {
    const range = dateFrom && dateTo ? { dateFrom, dateTo } : defaultDateRange();
    const validMetrics = ['spend', 'impressions', 'clicks', 'leads', 'ctr', 'cpc', 'cpm', 'roas'];
    if (!validMetrics.includes(metric)) metric = 'spend';

    let dateExpr;
    if (granularity === 'week') dateExpr = db.raw("date_trunc('week', ps.date)::date as period");
    else if (granularity === 'month') dateExpr = db.raw("date_trunc('month', ps.date)::date as period");
    else dateExpr = db.raw('ps.date as period');

    let query = db('performance_snapshots as ps')
      .where('ps.level', 'ad')
      .whereBetween('ps.date', [range.dateFrom, range.dateTo])
      .groupBy('period')
      .orderBy('period', 'asc');

    if (campaignId) query = query.where('ps.campaign_id', campaignId);
    if (adAccountId) query = query.where('ps.ad_account_id', adAccountId);

    query = query.select(
      dateExpr,
      db.raw('SUM(ps.spend)::numeric as spend'),
      db.raw('SUM(ps.impressions)::bigint as impressions'),
      db.raw('SUM(ps.clicks)::bigint as clicks'),
      db.raw('SUM(ps.leads)::int as leads'),
      db.raw('CASE WHEN SUM(ps.impressions) > 0 THEN (SUM(ps.clicks)::float / SUM(ps.impressions) * 100) ELSE 0 END as ctr'),
      db.raw('CASE WHEN SUM(ps.clicks) > 0 THEN (SUM(ps.spend)::float / SUM(ps.clicks)) ELSE 0 END as cpc'),
      db.raw('CASE WHEN SUM(ps.impressions) > 0 THEN (SUM(ps.spend)::float / SUM(ps.impressions) * 1000) ELSE 0 END as cpm')
    );

    const rows = await query;
    const duration = Date.now() - startTime;
    log('INFO', 'dashboard', 'Exit: getTrends', { metric, granularity, periodCount: rows.length, duration });
    return rows;
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'dashboard', 'Error in getTrends', { campaignId, adAccountId, metric, granularity, error: err.message, stack: err.stack, duration });
    throw err;
  }
}

async function getTrendsComparison({ campaignId, adAccountId, metric = 'spend', granularity = 'day', dateFrom, dateTo } = {}) {
  const startTime = Date.now();
  log('DEBUG', 'dashboard', 'Entry: getTrendsComparison', { metric, granularity, dateFrom, dateTo });

  try {
    const range = dateFrom && dateTo ? { dateFrom, dateTo } : defaultDateRange();

    // Calculate previous period (same duration, shifted back)
    const from = new Date(range.dateFrom);
    const to = new Date(range.dateTo);
    const durationDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
    const prevFrom = new Date(from - durationDays * 86400000).toISOString().split('T')[0];
    const prevTo = new Date(from - 86400000).toISOString().split('T')[0];

    const [current, previous] = await Promise.all([
      getTrends({ campaignId, adAccountId, metric, granularity, dateFrom: range.dateFrom, dateTo: range.dateTo }),
      getTrends({ campaignId, adAccountId, metric, granularity, dateFrom: prevFrom, dateTo: prevTo })
    ]);

    const duration = Date.now() - startTime;
    log('INFO', 'dashboard', 'Exit: getTrendsComparison', { currentPeriods: current.length, previousPeriods: previous.length, duration });

    return { current, previous, currentRange: range, previousRange: { dateFrom: prevFrom, dateTo: prevTo } };
  } catch (err) {
    log('ERROR', 'dashboard', 'Error in getTrendsComparison', { error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

async function getBenchmarks({ industryId, dateFrom, dateTo } = {}) {
  const startTime = Date.now();
  log('DEBUG', 'dashboard', 'Entry: getBenchmarks', { industryId, dateFrom, dateTo });

  try {
    const range = dateFrom && dateTo ? { dateFrom, dateTo } : defaultDateRange();

    let query = db('performance_snapshots as ps')
      .join('campaigns as c', 'ps.campaign_id', 'c.id')
      .join('clients as cl', 'c.client_id', 'cl.id')
      .where('ps.level', 'ad')
      .whereBetween('ps.date', [range.dateFrom, range.dateTo]);

    if (industryId) {
      query = query.where('cl.industry_id', industryId);
    }

    const [result] = await query.select(
      db.raw('COUNT(DISTINCT cl.id)::int as client_count'),
      db.raw('COUNT(DISTINCT c.id)::int as campaign_count'),
      db.raw('SUM(ps.spend)::numeric as total_spend'),
      db.raw('SUM(ps.impressions)::bigint as total_impressions'),
      db.raw('SUM(ps.clicks)::bigint as total_clicks'),
      db.raw('SUM(ps.leads)::int as total_leads'),
      db.raw('CASE WHEN SUM(ps.impressions) > 0 THEN (SUM(ps.clicks)::float / SUM(ps.impressions) * 100) ELSE 0 END as avg_ctr'),
      db.raw('CASE WHEN SUM(ps.clicks) > 0 THEN (SUM(ps.spend)::float / SUM(ps.clicks)) ELSE 0 END as avg_cpc'),
      db.raw('CASE WHEN SUM(ps.impressions) > 0 THEN (SUM(ps.spend)::float / SUM(ps.impressions) * 1000) ELSE 0 END as avg_cpm'),
      db.raw('CASE WHEN SUM(ps.spend) > 0 AND SUM(ps.purchases) > 0 THEN (SUM(ps.purchases)::float / SUM(ps.spend)) ELSE 0 END as avg_roas')
    );

    // Also get per-industry breakdown for comparison
    const byIndustry = await db('performance_snapshots as ps')
      .join('campaigns as c', 'ps.campaign_id', 'c.id')
      .join('clients as cl', 'c.client_id', 'cl.id')
      .join('industries as i', 'cl.industry_id', 'i.id')
      .where('ps.level', 'ad')
      .whereBetween('ps.date', [range.dateFrom, range.dateTo])
      .groupBy('i.id', 'i.name')
      .select(
        'i.id as industry_id', 'i.name as industry_name',
        db.raw('CASE WHEN SUM(ps.impressions) > 0 THEN (SUM(ps.clicks)::float / SUM(ps.impressions) * 100) ELSE 0 END as avg_ctr'),
        db.raw('CASE WHEN SUM(ps.clicks) > 0 THEN (SUM(ps.spend)::float / SUM(ps.clicks)) ELSE 0 END as avg_cpc'),
        db.raw('CASE WHEN SUM(ps.impressions) > 0 THEN (SUM(ps.spend)::float / SUM(ps.impressions) * 1000) ELSE 0 END as avg_cpm')
      )
      .orderBy('avg_ctr', 'desc');

    const duration = Date.now() - startTime;
    log('INFO', 'dashboard', 'Exit: getBenchmarks', { industryId, industriesCompared: byIndustry.length, duration });

    return {
      overall: { ...result, total_spend: parseFloat(result.total_spend) || 0 },
      by_industry: byIndustry,
      date_range: range
    };
  } catch (err) {
    log('ERROR', 'dashboard', 'Error in getBenchmarks', { industryId, error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

module.exports = { getOverview, getByIndustry, getByClient, getTopAds, getTrends, getTrendsComparison, getBenchmarks };
