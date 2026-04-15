const db = require('../config/db');
const { log } = require('../utils/logger');

async function exportCsv(req, res, next) {
  const startTime = Date.now();
  const type = req.query.type || 'campaigns';
  log('INFO', 'export', 'Entry: exportCsv', { requestId: req.requestId, type });

  try {
    const validTypes = {
      campaigns: () => db('campaigns')
        .select('campaigns.*', 'clients.client_name', 'ad_accounts.account_name')
        .leftJoin('clients', 'campaigns.client_id', 'clients.id')
        .leftJoin('ad_accounts', 'campaigns.ad_account_id', 'ad_accounts.id')
        .orderBy('campaigns.name'),
      ads: () => db('ads')
        .select('ads.*', 'campaigns.name as campaign_name', 'clients.client_name')
        .leftJoin('campaigns', 'ads.campaign_id', 'campaigns.id')
        .leftJoin('clients', 'ads.client_id', 'clients.id')
        .orderBy('ads.name'),
      performance: () => db('performance_snapshots')
        .where('level', 'ad')
        .orderBy('date', 'desc')
        .limit(10000),
      clients: () => db('clients')
        .select('clients.*', 'industries.name as industry_name')
        .leftJoin('industries', 'clients.industry_id', 'industries.id')
        .orderBy('clients.client_name')
    };

    if (!validTypes[type]) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Invalid type: ${type}. Valid: ${Object.keys(validTypes).join(', ')}` } });
    }

    const rows = await validTypes[type]();

    if (rows.length === 0) {
      return res.status(200).send('No data');
    }

    // Build CSV
    const columns = Object.keys(rows[0]);
    const header = columns.join(',');
    const lines = rows.map(row =>
      columns.map(col => {
        const val = row[col];
        if (val == null) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',')
    );

    const csv = [header, ...lines].join('\n');

    const duration = Date.now() - startTime;
    log('INFO', 'export', 'Exit: exportCsv', { requestId: req.requestId, type, rows: rows.length, duration });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    log('ERROR', 'export', 'Error in exportCsv', { requestId: req.requestId, type, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

module.exports = { exportCsv };
