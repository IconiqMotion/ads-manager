const { resolveToken } = require('./token-resolver.service');
const metaApi = require('./meta-api.service');
const { downloadMediaIfNeeded, downloadVideoIfNeeded } = require('./media.service');
const { calculateKPIs } = require('../utils/kpi-calculator');
const { log, generateId } = require('../utils/logger');
const db = require('../config/db');

async function syncAccount(accountId, { dateFrom, dateTo, syncType = 'full' } = {}) {
  const syncId = generateId();
  const counters = { campaigns: 0, adsets: 0, ads: 0, snapshots: 0, errors: 0 };
  const startTime = Date.now();

  log('INFO', 'sync', '=== SYNC START ===', { syncId, accountId, syncType });

  // Create sync log
  const [syncLog] = await db('sync_logs').insert({
    ad_account_id: accountId,
    sync_type: syncType,
    status: 'running',
    started_at: new Date()
  }).returning('id');
  const syncLogId = syncLog.id;

  try {
    // Step 1: Get account
    const account = await db('ad_accounts').where({ id: accountId }).first();
    if (!account) {
      log('ERROR', 'sync', 'Account not found', { syncId, accountId });
      await updateSyncLog(syncLogId, 'failed', 'Account not found');
      return { error: 'Account not found' };
    }
    if (!account.is_active) {
      log('INFO', 'sync', 'Account inactive, skipping', { syncId, accountId });
      await updateSyncLog(syncLogId, 'skipped', 'Account inactive');
      return { skipped: true };
    }

    // Step 2: Resolve token
    const tokenResult = resolveToken(account);
    if (!tokenResult) {
      await updateSyncLog(syncLogId, 'failed', 'No valid token');
      return { error: 'No valid token' };
    }

    // Step 3: Validate token
    const validation = await metaApi.validateToken(tokenResult.token);
    if (validation.error) {
      log('ERROR', 'sync', 'Token validation failed', { syncId, accountId, error: validation.error });
      await db('ad_accounts').where({ id: accountId }).update({ is_active: false });
      await updateSyncLog(syncLogId, 'failed', `Token invalid: ${validation.error}`, tokenResult.source);
      return { error: `Token invalid: ${validation.error}` };
    }
    log('INFO', 'sync', 'Token valid', { syncId, accountId, tokenSource: tokenResult.source });

    // Step 4: Fetch and upsert campaigns
    log('INFO', 'sync', 'Fetching campaigns', { syncId, accountId });
    const campaigns = await metaApi.fetchCampaigns(accountId, tokenResult.token);
    if (!campaigns.error && campaigns.data) {
      for (const c of campaigns.data) {
        try {
          await upsertCampaign(c, accountId, account.client_id);
          counters.campaigns++;
        } catch (err) {
          log('ERROR', 'sync', 'Campaign upsert failed', { syncId, campaignId: c.id, error: err.message });
          counters.errors++;
        }
      }

      // Step 5: Fetch adsets per campaign
      for (const c of campaigns.data) {
        const adsets = await metaApi.fetchAdSets(c.id, tokenResult.token);
        if (adsets.error) { counters.errors++; continue; }

        for (const as of (adsets.data || [])) {
          try {
            await upsertAdSet(as, c.id);
            counters.adsets++;
          } catch (err) {
            log('ERROR', 'sync', 'AdSet upsert failed', { syncId, adsetId: as.id, error: err.message });
            counters.errors++;
          }

          // Step 6: Fetch ads per adset
          const ads = await metaApi.fetchAds(as.id, tokenResult.token);
          if (ads.error) { counters.errors++; continue; }

          for (const ad of (ads.data || [])) {
            try {
              const adResult = await upsertAd(ad, as.id, c.id, account.client_id, tokenResult.token);
              counters.ads++;

              // Download media if available
              const creative = ad.creative || {};
              if (creative.image_url || creative.thumbnail_url) {
                try {
                  await downloadMediaIfNeeded(
                    { id: ad.id, image_url: creative.image_url, thumbnail_url: creative.thumbnail_url },
                    accountId
                  );
                } catch (mediaErr) {
                  log('WARN', 'sync', 'Media download failed (non-blocking)', { syncId, adId: ad.id, error: mediaErr.message });
                }
              }

            } catch (err) {
              log('ERROR', 'sync', 'Ad upsert failed', { syncId, adId: ad.id, error: err.message });
              counters.errors++;
            }
          }
        }
      }
    } else if (campaigns.error) {
      log('ERROR', 'sync', 'Failed to fetch campaigns', { syncId, error: campaigns.error });
      counters.errors++;
    }

    // Step 7: Fetch insights
    log('INFO', 'sync', 'Fetching insights', { syncId, accountId });
    const now = new Date();
    const from = dateFrom || new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = dateTo || now.toISOString().split('T')[0];

    const insights = await metaApi.fetchInsights(accountId, tokenResult.token, {
      dateFrom: from, dateTo: to, level: 'ad'
    });

    if (!insights.error && insights.data) {
      for (const row of insights.data) {
        try {
          await upsertSnapshot(row, accountId);
          counters.snapshots++;
        } catch (err) {
          log('ERROR', 'sync', 'Snapshot upsert failed', { syncId, error: err.message });
          counters.errors++;
        }
      }
    }

    // Step 8: Update last_synced_at
    await db('ad_accounts').where({ id: accountId }).update({ last_synced_at: new Date() });

    const duration = Date.now() - startTime;
    log('INFO', 'sync', '=== SYNC COMPLETE ===', { syncId, accountId, counters, duration });

    const totalRecords = counters.campaigns + counters.adsets + counters.ads + counters.snapshots;
    await updateSyncLog(syncLogId, 'completed', null, tokenResult.source, totalRecords);

    return { syncId, counters, duration };

  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'sync', '=== SYNC FAILED ===', { syncId, accountId, error: err.message, counters, duration });
    await updateSyncLog(syncLogId, 'failed', err.message);
    return { error: err.message, counters };
  }
}

async function syncAllAccounts({ syncType = 'full', dateFrom, dateTo, retryFailed = true } = {}) {
  const accounts = await db('ad_accounts').where({ is_active: true }).whereNotNull('access_token');
  log('INFO', 'sync', 'Starting sync for all accounts', { count: accounts.length, syncType });

  const results = [];
  const failed = [];

  for (const account of accounts) {
    const result = await syncAccount(account.id, { dateFrom, dateTo, syncType });
    results.push({ accountId: account.id, ...result });
    if (result.error) {
      failed.push(account.id);
    }
  }

  // Retry failed accounts once
  if (retryFailed && failed.length > 0) {
    log('INFO', 'sync', 'Retrying failed accounts', { count: failed.length, accountIds: failed });
    for (const accountId of failed) {
      const retryResult = await syncAccount(accountId, { dateFrom, dateTo, syncType });
      results.push({ accountId, retry: true, ...retryResult });
    }
  }

  // Run alert evaluation after sync
  try {
    const { evaluateAlerts } = require('./alerts.service');
    const alertResult = await evaluateAlerts();
    log('INFO', 'sync', 'Post-sync alert evaluation', { triggered: alertResult.triggered });
  } catch (err) {
    log('WARN', 'sync', 'Alert evaluation failed (non-blocking)', { error: err.message });
  }

  // Invalidate cache
  try {
    const cache = require('./cache.service');
    cache.invalidateSync();
  } catch { /* cache not critical */ }

  log('INFO', 'sync', 'All accounts sync complete', {
    total: accounts.length, succeeded: results.filter(r => !r.error).length, failed: failed.length
  });

  return results;
}

// --- Upsert helpers ---

async function upsertCampaign(data, adAccountId, clientId) {
  const record = {
    id: data.id,
    ad_account_id: adAccountId,
    client_id: clientId,
    name: data.name || 'Unnamed',
    objective: data.objective || null,
    status: data.status || 'UNKNOWN',
    buying_type: data.buying_type || null,
    daily_budget: data.daily_budget ? parseInt(data.daily_budget) : null,
    lifetime_budget: data.lifetime_budget ? parseInt(data.lifetime_budget) : null,
    start_date: data.start_time ? new Date(data.start_time) : null,
    end_date: data.stop_time ? new Date(data.stop_time) : null,
    updated_at: new Date()
  };

  await db('campaigns').insert({ ...record, created_at: new Date() })
    .onConflict('id').merge(record);
}

async function upsertAdSet(data, campaignId) {
  const record = {
    id: data.id,
    campaign_id: campaignId,
    name: data.name || 'Unnamed',
    status: data.status || 'UNKNOWN',
    optimization_goal: data.optimization_goal || null,
    daily_budget: data.daily_budget ? parseInt(data.daily_budget) : null,
    lifetime_budget: data.lifetime_budget ? parseInt(data.lifetime_budget) : null,
    targeting: data.targeting || null,
    placements: data.publisher_platforms ? { platforms: data.publisher_platforms } : null,
    updated_at: new Date()
  };

  await db('adsets').insert({ ...record, created_at: new Date() })
    .onConflict('id').merge(record);
}

async function upsertAd(data, adsetId, campaignId, clientId, token) {
  const creative = data.creative || {};

  // If video_id exists, fetch the actual video source URL
  let videoUrl = null;
  if (creative.video_id && token) {
    try {
      const { BASE_URL } = require('../config/meta-api');
      const res = await fetch(`${BASE_URL}/${creative.video_id}?fields=source&access_token=${token}`);
      const videoData = await res.json();
      if (videoData.source) {
        videoUrl = videoData.source;
      }
    } catch (err) {
      log('WARN', 'sync', 'Video URL fetch failed', { adId: data.id, videoId: creative.video_id, error: err.message });
    }
  }

  const record = {
    id: data.id,
    adset_id: adsetId,
    campaign_id: campaignId,
    client_id: clientId,
    name: data.name || 'Unnamed',
    status: data.status || 'UNKNOWN',
    creative_id: creative.id || null,
    image_url: creative.image_url || null,
    video_url: videoUrl,
    thumbnail_url: creative.thumbnail_url || null,
    body_text: creative.body || null,
    cta_type: creative.call_to_action_type || null,
    updated_at: new Date()
  };

  await db('ads').insert({ ...record, created_at: new Date() })
    .onConflict('id').merge(record);

  return { videoUrl };
}

async function upsertSnapshot(row, adAccountId) {
  const date = row.date_start;
  const adId = row.ad_id || row.adset_id || row.campaign_id;
  const level = row.ad_id ? 'ad' : row.adset_id ? 'adset' : 'campaign';

  if (!date || !adId) return;

  const kpis = calculateKPIs(row);

  const record = {
    date,
    ad_account_id: adAccountId,
    campaign_id: row.campaign_id || null,
    adset_id: row.adset_id || null,
    ad_id: row.ad_id || null,
    level,
    ...kpis
  };

  await db('performance_snapshots')
    .insert({ ...record, created_at: new Date() })
    .onConflict(['date', 'ad_id', 'level'])
    .merge(record);
}

async function updateSyncLog(id, status, errorMessage, tokenSource, recordsSynced) {
  const update = { status, completed_at: new Date() };
  if (errorMessage) update.error_message = errorMessage;
  if (tokenSource) update.token_source = tokenSource;
  if (recordsSynced !== undefined) update.records_synced = recordsSynced;
  await db('sync_logs').where({ id }).update(update);
}

module.exports = { syncAccount, syncAllAccounts };
