const { syncClientsFromFireberry, syncTokensFromFireberry, syncAllFromFireberry } = require('../services/fireberry-sync.service');
const { log } = require('../utils/logger');
const db = require('../config/db');

async function syncClients(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  log('INFO', 'fireberry', 'ENTRY syncClients — Manual client sync triggered', { requestId, userId: req.user.id });
  try {
    const result = await syncClientsFromFireberry();
    log('INFO', 'fireberry', 'EXIT syncClients', { requestId, created: result?.created, updated: result?.updated, status: result?.status, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'fireberry', 'ERROR syncClients', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function syncTokens(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  log('INFO', 'fireberry', 'ENTRY syncTokens — Manual token sync triggered', { requestId, userId: req.user.id });
  try {
    const result = await syncTokensFromFireberry();
    log('INFO', 'fireberry', 'EXIT syncTokens', { requestId, created: result?.created, updated: result?.updated, status: result?.status, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'fireberry', 'ERROR syncTokens', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function syncAll(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  log('INFO', 'fireberry', 'ENTRY syncAll — Manual full sync triggered', { requestId, userId: req.user.id });
  try {
    const result = await syncAllFromFireberry();
    log('INFO', 'fireberry', 'EXIT syncAll', { requestId, status: result?.status, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'fireberry', 'ERROR syncAll', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function status(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  log('INFO', 'fireberry', 'ENTRY status', { requestId });
  try {
    const lastClientSync = await db('sync_logs')
      .where({ sync_type: 'fireberry_clients' })
      .orderBy('completed_at', 'desc')
      .first();

    const lastTokenSync = await db('sync_logs')
      .where({ sync_type: 'fireberry_tokens' })
      .orderBy('completed_at', 'desc')
      .first();

    const clientCount = await db('clients').whereNotNull('fireberry_account_id').count('* as count').first();
    const tokenCount = await db('ad_accounts').where({ token_source: 'fireberry' }).count('* as count').first();

    log('INFO', 'fireberry', 'EXIT status', { requestId, clientsFromFireberry: parseInt(clientCount.count), tokensFromFireberry: parseInt(tokenCount.count), duration: Date.now() - startTime });
    res.json({
      data: {
        fireberry_token_configured: !!process.env.FIREBERRY_TOKEN,
        last_client_sync: lastClientSync || null,
        last_token_sync: lastTokenSync || null,
        clients_from_fireberry: parseInt(clientCount.count),
        tokens_from_fireberry: parseInt(tokenCount.count)
      }
    });
  } catch (err) {
    log('ERROR', 'fireberry', 'ERROR status', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function previewClients(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  log('INFO', 'fireberry', 'ENTRY previewClients', { requestId });
  try {
    const result = await syncClientsFromFireberry({ dryRun: true });
    log('INFO', 'fireberry', 'EXIT previewClients', { requestId, previewCount: result?.length ?? result?.clients?.length, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'fireberry', 'ERROR previewClients', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function previewTokens(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  log('INFO', 'fireberry', 'ENTRY previewTokens', { requestId });
  try {
    const result = await syncTokensFromFireberry({ dryRun: true });
    log('INFO', 'fireberry', 'EXIT previewTokens', { requestId, previewCount: result?.length ?? result?.tokens?.length, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'fireberry', 'ERROR previewTokens', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

module.exports = { syncClients, syncTokens, syncAll, status, previewClients, previewTokens };
