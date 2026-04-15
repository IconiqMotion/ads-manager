const db = require('../config/db');
const { log } = require('../utils/logger');

async function list(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'clients', 'Entry: list', { requestId: req.requestId, page: req.query.page, search: req.query.search, industryId: req.query.industry_id });
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const search = req.query.search;
    const industryId = req.query.industry_id;

    let query = db('clients')
      .select(
        'clients.*',
        'industries.name as industry_name'
      )
      .leftJoin('industries', 'clients.industry_id', 'industries.id');

    if (search) {
      query = query.where(function () {
        this.whereILike('clients.client_name', `%${search}%`)
          .orWhereILike('clients.brand_name', `%${search}%`);
      });
    }
    if (industryId) {
      query = query.where('clients.industry_id', industryId);
    }

    const [{ count: total }] = await query.clone().clearSelect().clearOrder().count('clients.id as count');

    const data = await query
      .orderBy('clients.client_name')
      .limit(limit)
      .offset(offset);

    const duration = Date.now() - startTime;
    log('INFO', 'clients', 'Exit: list', { requestId: req.requestId, count: data.length, total: parseInt(total), page, duration });
    res.json({ data, meta: { page, limit, total: parseInt(total) } });
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'clients', 'Error in list', { requestId: req.requestId, error: err.message, stack: err.stack, duration });
    next(err);
  }
}

async function getById(req, res, next) {
  const startTime = Date.now();
  const { id } = req.params;
  log('DEBUG', 'clients', 'Entry: getById', { requestId: req.requestId, id });
  try {
    const client = await db('clients')
      .select('clients.*', 'industries.name as industry_name')
      .leftJoin('industries', 'clients.industry_id', 'industries.id')
      .where('clients.id', id)
      .first();

    if (!client) {
      log('WARN', 'clients', 'getById: not found', { requestId: req.requestId, id });
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } });
    }

    // Get ad account count and campaign count
    const [accountCount] = await db('ad_accounts').where({ client_id: id }).count('* as count');
    const [campaignCount] = await db('campaigns').where({ client_id: id }).count('* as count');
    const [spendResult] = await db('performance_snapshots')
      .join('campaigns', 'performance_snapshots.campaign_id', 'campaigns.id')
      .where('campaigns.client_id', id)
      .sum('performance_snapshots.spend as total_spend');

    client.ad_account_count = parseInt(accountCount.count);
    client.campaign_count = parseInt(campaignCount.count);
    client.total_spend = parseFloat(spendResult.total_spend) || 0;

    const duration = Date.now() - startTime;
    log('INFO', 'clients', 'Exit: getById', { requestId: req.requestId, id, clientName: client.client_name, duration });
    res.json({ data: client });
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'clients', 'Error in getById', { requestId: req.requestId, id, error: err.message, stack: err.stack, duration });
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { client_name, brand_name, industry_id, contact_name, contact_email, contact_phone, account_manager, notes } = req.body;
    if (!client_name) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'client_name is required' } });
    }

    const [client] = await db('clients')
      .insert({
        client_name, brand_name, industry_id: industry_id || null,
        contact_name, contact_email, contact_phone, account_manager, notes
      })
      .returning('*');

    log('INFO', 'clients', 'Client created', { requestId: req.requestId, id: client.id, name: client_name });
    res.status(201).json({ data: client });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  const startTime = Date.now();
  const { id } = req.params;
  log('DEBUG', 'clients', 'Entry: update', { requestId: req.requestId, id });
  try {
    const fields = {};
    const allowed = ['client_name', 'brand_name', 'industry_id', 'contact_name', 'contact_email', 'contact_phone', 'account_manager', 'notes'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) fields[key] = req.body[key];
    }
    fields.updated_at = new Date();

    const [updated] = await db('clients').where({ id }).update(fields).returning('*');
    if (!updated) {
      log('WARN', 'clients', 'Update: not found', { requestId: req.requestId, id });
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } });
    }

    const duration = Date.now() - startTime;
    log('INFO', 'clients', 'Exit: update', { requestId: req.requestId, id, duration });
    res.json({ data: updated });
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'clients', 'Error in update', { requestId: req.requestId, id, error: err.message, stack: err.stack, duration });
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const deleted = await db('clients').where({ id }).del();
    if (!deleted) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } });
    }
    log('INFO', 'clients', 'Client deleted', { requestId: req.requestId, id });
    res.json({ data: { message: 'Client deleted' } });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, remove };
