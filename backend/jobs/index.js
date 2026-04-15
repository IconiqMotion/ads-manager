const cron = require('node-cron');
const { log } = require('../utils/logger');

function registerJobs() {
  // Fireberry sync — every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    log('INFO', 'cron', 'Running: fireberry-sync');
    try {
      const { syncAllFromFireberry } = require('../services/fireberry-sync.service');
      await syncAllFromFireberry();
      // Classify new clients after Fireberry sync
      const { classifyClientsFromFacebook } = require('../services/industry-classifier.service');
      await classifyClientsFromFacebook();
    } catch (err) {
      log('ERROR', 'cron', 'fireberry-sync failed', { error: err.message });
    }
  });
  log('INFO', 'cron', 'Registered: fireberry-sync (every 6h)');

  // Daily full Meta sync — 3:00 AM
  cron.schedule('0 3 * * *', async () => {
    log('INFO', 'cron', 'Running: daily-sync');
    try {
      const { syncAllAccounts } = require('../services/sync.service');
      await syncAllAccounts({ syncType: 'full' });
    } catch (err) {
      log('ERROR', 'cron', 'daily-sync failed', { error: err.message });
    }
  });
  log('INFO', 'cron', 'Registered: daily-sync (3:00 AM)');

  // Incremental sync — every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    log('INFO', 'cron', 'Running: incremental-sync');
    try {
      const { syncAllAccounts } = require('../services/sync.service');
      const now = new Date();
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const today = now.toISOString().split('T')[0];
      await syncAllAccounts({ syncType: 'incremental', dateFrom: twoDaysAgo, dateTo: today });
    } catch (err) {
      log('ERROR', 'cron', 'incremental-sync failed', { error: err.message });
    }
  });
  log('INFO', 'cron', 'Registered: incremental-sync (every 2h)');

  // Token check — Monday 8 AM
  cron.schedule('0 8 * * 1', async () => {
    log('INFO', 'cron', 'Running: token-check');
    try {
      const db = require('../config/db');
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const expiring = await db('ad_accounts')
        .where({ is_active: true })
        .whereNotNull('token_expires')
        .where('token_expires', '<', sevenDaysFromNow);

      for (const account of expiring) {
        log('WARN', 'cron', 'Token expiring soon', {
          accountId: account.id,
          expiresAt: account.token_expires,
          tokenSource: account.token_source
        });
      }
      log('INFO', 'cron', 'Token check complete', { expiringCount: expiring.length });
    } catch (err) {
      log('ERROR', 'cron', 'token-check failed', { error: err.message });
    }
  });
  log('INFO', 'cron', 'Registered: token-check (Monday 8 AM)');
}


  // AI industry classification — nightly at 2 AM, classify any untagged ads
  cron.schedule('0 2 * * *', async () => {
    log('INFO', 'cron', 'Running: ai-industry-classification');
    try {
      const { classifyUntaggedAds } = require('../services/ai-industry.service');
      const result = await classifyUntaggedAds({ limit: 500 });
      log('INFO', 'cron', 'ai-industry-classification complete', result);
    } catch (err) {
      log('ERROR', 'cron', 'ai-industry-classification failed', { error: err.message });
    }
  });
  log('INFO', 'cron', 'Registered: ai-industry-classification (2:00 AM)');

module.exports = registerJobs;
