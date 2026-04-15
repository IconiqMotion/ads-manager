const db = require('../config/db');
const { resolveToken } = require('../services/token-resolver.service');
const { log } = require('../utils/logger');

async function list(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'ad-accounts', 'Entry: list', { requestId: req.requestId });
  try {
    const accounts = await db('ad_accounts')
      .select('ad_accounts.*', 'clients.client_name')
      .leftJoin('clients', 'ad_accounts.client_id', 'clients.id')
      .orderBy('ad_accounts.created_at', 'desc');

    const duration = Date.now() - startTime;
    log('INFO', 'ad-accounts', 'Exit: list', { requestId: req.requestId, count: accounts.length, duration });
    res.json({ data: accounts });
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'ad-accounts', 'Error in list', { requestId: req.requestId, error: err.message, stack: err.stack, duration });
    next(err);
  }
}

async function discover(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'ad-accounts', 'Entry: discover', { requestId: req.requestId });
  try {
    const businessId = process.env.META_BUSINESS_ID;
    const token = process.env.META_BUSINESS_TOKEN;

    if (!businessId || !token) {
      log('WARN', 'ad-accounts', 'Discover config missing', { requestId: req.requestId });
      return res.status(400).json({
        error: { code: 'CONFIG_ERROR', message: 'META_BUSINESS_ID and META_BUSINESS_TOKEN required' }
      });
    }

    const { BASE_URL } = require('../config/meta-api');
    const results = [];

    for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
      let url = `${BASE_URL}/${businessId}/${edge}?fields=id,name,currency,timezone_name,account_status&access_token=${token}&limit=100`;

      while (url) {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
          log('ERROR', 'meta-api', 'Discover failed', { edge, error: data.error });
          break;
        }

        if (data.data) results.push(...data.data);
        url = data.paging?.next || null;
      }
    }

    // Mark which are already imported
    const existingIds = new Set(
      (await db('ad_accounts').select('id')).map(a => a.id)
    );

    const accounts = results.map(a => ({
      ...a,
      already_imported: existingIds.has(a.id)
    }));

    const duration = Date.now() - startTime;
    log('INFO', 'ad-accounts', 'Exit: discover', { requestId: req.requestId, total: accounts.length, duration });
    res.json({ data: accounts, meta: { total: accounts.length } });
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'ad-accounts', 'Error in discover', { requestId: req.requestId, error: err.message, stack: err.stack, duration });
    next(err);
  }
}

async function importAccounts(req, res, next) {
  try {
    const { accounts } = req.body; // [{ ad_account_id, client_id, access_token? }]
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'accounts array required' } });
    }

    const imported = [];
    for (const acc of accounts) {
      const existing = await db('ad_accounts').where({ id: acc.ad_account_id }).first();
      if (existing) continue;

      await db('ad_accounts').insert({
        id: acc.ad_account_id,
        client_id: acc.client_id || null,
        account_name: acc.account_name || null,
        access_token: acc.access_token || null,
        token_source: acc.access_token ? 'manual' : 'business',
        use_business_token: true,
        is_active: true
      });
      imported.push(acc.ad_account_id);
    }

    log('INFO', 'ad-accounts', 'Accounts imported', { requestId: req.requestId, count: imported.length });
    res.status(201).json({ data: { imported, count: imported.length } });
  } catch (err) {
    next(err);
  }
}

async function importAll(req, res, next) {
  try {
    const businessId = process.env.META_BUSINESS_ID;
    const token = process.env.META_BUSINESS_TOKEN;
    if (!businessId || !token) {
      return res.status(400).json({ error: { code: 'CONFIG_ERROR', message: 'Business token required' } });
    }

    const { BASE_URL } = require('../config/meta-api');
    const allAccounts = [];

    for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
      let url = `${BASE_URL}/${businessId}/${edge}?fields=id,name,currency,timezone_name&access_token=${token}&limit=100`;
      while (url) {
        const response = await fetch(url);
        const data = await response.json();
        if (data.data) allAccounts.push(...data.data);
        url = data.paging?.next || null;
      }
    }

    let imported = 0;
    for (const acc of allAccounts) {
      const exists = await db('ad_accounts').where({ id: acc.id }).first();
      if (!exists) {
        await db('ad_accounts').insert({
          id: acc.id,
          account_name: acc.name,
          currency: acc.currency,
          timezone: acc.timezone_name,
          use_business_token: true,
          token_source: 'business',
          is_active: true
        });
        imported++;
      }
    }

    log('INFO', 'ad-accounts', 'Bulk import complete', { requestId: req.requestId, discovered: allAccounts.length, imported });
    res.status(201).json({ data: { discovered: allAccounts.length, imported } });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  const startTime = Date.now();
  const { id } = req.params;
  log('DEBUG', 'ad-accounts', 'Entry: update', { requestId: req.requestId, id });
  try {
    const allowed = ['client_id', 'account_name', 'use_business_token', 'is_active'];
    const fields = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) fields[key] = req.body[key];
    }

    const [updated] = await db('ad_accounts').where({ id }).update(fields).returning('*');
    if (!updated) {
      log('WARN', 'ad-accounts', 'Update: not found', { requestId: req.requestId, id });
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ad account not found' } });
    }
    const duration = Date.now() - startTime;
    log('INFO', 'ad-accounts', 'Exit: update', { requestId: req.requestId, id, duration });
    res.json({ data: updated });
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'ad-accounts', 'Error in update', { requestId: req.requestId, id, error: err.message, stack: err.stack, duration });
    next(err);
  }
}

async function remove(req, res, next) {
  const startTime = Date.now();
  const { id } = req.params;
  log('DEBUG', 'ad-accounts', 'Entry: remove', { requestId: req.requestId, id });
  try {
    const deleted = await db('ad_accounts').where({ id }).del();
    if (!deleted) {
      log('WARN', 'ad-accounts', 'Remove: not found', { requestId: req.requestId, id });
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ad account not found' } });
    }
    const duration = Date.now() - startTime;
    log('INFO', 'ad-accounts', 'Exit: remove', { requestId: req.requestId, id, duration });
    res.json({ data: { message: 'Ad account disconnected' } });
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'ad-accounts', 'Error in remove', { requestId: req.requestId, id, error: err.message, stack: err.stack, duration });
    next(err);
  }
}

async function tokenStatus(req, res, next) {
  const startTime = Date.now();
  const { id } = req.params;
  log('DEBUG', 'ad-accounts', 'Entry: tokenStatus', { requestId: req.requestId, id });
  try {
    const account = await db('ad_accounts').where({ id }).first();
    if (!account) {
      log('WARN', 'ad-accounts', 'tokenStatus: not found', { requestId: req.requestId, id });
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ad account not found' } });
    }

    const resolved = resolveToken(account);
    let metaValid = false;
    let metaUser = null;

    if (resolved) {
      try {
        const { BASE_URL } = require('../config/meta-api');
        const response = await fetch(`${BASE_URL}/me?access_token=${resolved.token}`);
        const data = await response.json();
        metaValid = !data.error;
        metaUser = data.name || null;
      } catch { /* network error */ }
    }

    const duration = Date.now() - startTime;
    log('INFO', 'ad-accounts', 'Exit: tokenStatus', { requestId: req.requestId, id, metaValid, tokenSource: resolved?.source || 'none', duration });
    res.json({
      data: {
        account_id: id,
        has_token: !!account.access_token,
        token_source: resolved?.source || 'none',
        token_expires: account.token_expires,
        last_token_sync: account.last_token_sync,
        meta_valid: metaValid,
        meta_user: metaUser
      }
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'ad-accounts', 'Error in tokenStatus', { requestId: req.requestId, id, error: err.message, stack: err.stack, duration });
    next(err);
  }
}

async function validateAll(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'ad-accounts', 'Entry: validateAll', { requestId: req.requestId });
  try {
    const accounts = await db('ad_accounts').where({ is_active: true });
    log('DEBUG', 'ad-accounts', 'validateAll: fetched accounts', { requestId: req.requestId, accountCount: accounts.length });
    const { BASE_URL } = require('../config/meta-api');
    const results = [];

    for (const account of accounts) {
      const resolved = resolveToken(account);
      let valid = false;

      if (resolved) {
        try {
          const response = await fetch(`${BASE_URL}/me?access_token=${resolved.token}`);
          const data = await response.json();
          valid = !data.error;
        } catch { /* skip */ }
      }

      results.push({
        id: account.id,
        client_id: account.client_id,
        token_source: resolved?.source || 'none',
        valid
      });
    }

    const duration = Date.now() - startTime;
    const validCount = results.filter(r => r.valid).length;
    log('INFO', 'ad-accounts', 'Exit: validateAll', { requestId: req.requestId, total: results.length, valid: validCount, duration });
    res.json({ data: results, meta: { total: results.length, valid: validCount } });
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'ad-accounts', 'Error in validateAll', { requestId: req.requestId, error: err.message, stack: err.stack, duration });
    next(err);
  }
}

module.exports = { list, discover, importAccounts, importAll, update, remove, tokenStatus, validateAll };
