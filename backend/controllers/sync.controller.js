const { syncAccount, syncAllAccounts } = require('../services/sync.service');
const { syncAllFromFireberry } = require('../services/fireberry-sync.service');
const { log } = require('../utils/logger');
const db = require('../config/db');

async function triggerOne(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  try {
    const { ad_account_id } = req.params;
    log('INFO', 'sync', 'ENTRY triggerOne — Manual sync triggered', { requestId, accountId: ad_account_id });
    const result = await syncAccount(ad_account_id);
    log('INFO', 'sync', 'EXIT triggerOne', { requestId, accountId: ad_account_id, status: result?.status, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'sync', 'ERROR triggerOne', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function triggerAll(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  try {
    log('INFO', 'sync', 'ENTRY triggerAll — Full sync triggered (Fireberry + Meta)', { requestId });

    // Run Fireberry sync first to get latest tokens
    const fireberryResult = await syncAllFromFireberry();

    // Then run Meta sync
    const metaResult = await syncAllAccounts();

    log('INFO', 'sync', 'EXIT triggerAll', { requestId, fireberryStatus: fireberryResult?.status, metaAccounts: metaResult?.length, duration: Date.now() - startTime });
    res.json({ data: { fireberry: fireberryResult, meta: metaResult } });
  } catch (err) {
    log('ERROR', 'sync', 'ERROR triggerAll', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function statusList(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  log('INFO', 'sync', 'ENTRY statusList', { requestId, page, limit });
  try {
    const offset = (page - 1) * limit;

    const [{ count: total }] = await db('sync_logs').count('* as count');
    const logs = await db('sync_logs')
      .orderBy('started_at', 'desc')
      .limit(limit)
      .offset(offset);

    log('INFO', 'sync', 'EXIT statusList', { requestId, page, returnedCount: logs.length, total: parseInt(total), duration: Date.now() - startTime });
    res.json({ data: logs, meta: { page, limit, total: parseInt(total) } });
  } catch (err) {
    log('ERROR', 'sync', 'ERROR statusList', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function statusDetail(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  const { id } = req.params;
  log('INFO', 'sync', 'ENTRY statusDetail', { requestId, id });
  try {
    const syncLog = await db('sync_logs').where({ id }).first();
    if (!syncLog) {
      log('WARN', 'sync', 'EXIT statusDetail — not found', { requestId, id, duration: Date.now() - startTime });
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Sync log not found' } });
    }
    log('INFO', 'sync', 'EXIT statusDetail', { requestId, id, syncType: syncLog.sync_type, status: syncLog.status, duration: Date.now() - startTime });
    res.json({ data: syncLog });
  } catch (err) {
    log('ERROR', 'sync', 'ERROR statusDetail', { requestId, id, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

module.exports = { triggerOne, triggerAll, statusList, statusDetail };
