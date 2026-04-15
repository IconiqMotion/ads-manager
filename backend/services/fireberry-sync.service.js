const { queryAllPages } = require('./fireberry.service');
const { log, generateId } = require('../utils/logger');
const db = require('../config/db');

// --- Phone Normalization (Israeli format) ---
function normalizePhone(phone) {
  if (!phone) return null;
  let cleaned = String(phone).replace(/\D/g, '');

  // 972501234567 → 0501234567
  if (cleaned.startsWith('972') && cleaned.length >= 12) {
    cleaned = '0' + cleaned.slice(3);
  }
  // 501234567 → 0501234567
  if (cleaned.length === 9 && !cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }

  return cleaned || null;
}

// --- Client Sync (ObjectType 1) ---
const CLIENT_FIELDS = [
  'accountid', 'accountname', 'pcfsystemfield1475', 'telephone1',
  'pcfsystemfield1445', 'websiteurl', 'pcfsystemfield114',
  'statuscode', 'pcfsystemfield1441name'
].join(',');

async function syncClientsFromFireberry({ dryRun = false } = {}) {
  const syncId = generateId();
  log('INFO', 'fireberry', '=== CLIENT SYNC START ===', { syncId, dryRun });
  const startTime = Date.now();

  const result = await queryAllPages({
    objecttype: 1,
    fields: CLIENT_FIELDS,
    query: '',
    page_size: 500
  });

  if (!result.success) {
    log('ERROR', 'fireberry', 'Client query failed', { syncId, error: result.error_details });
    return { error: result.error_details, created: 0, updated: 0, errors: 0, total: 0 };
  }

  const records = result.data?.Data || [];
  log('INFO', 'fireberry', 'Customers fetched', { syncId, count: records.length });

  if (records.length > 0 && !records[0].accountid) {
    log('ERROR', 'fireberry', 'Records missing accountid', { syncId, sampleKeys: Object.keys(records[0]) });
    return { error: 'MISSING_ACCOUNTID', created: 0, updated: 0, errors: 0, total: records.length };
  }

  if (dryRun) {
    const preview = records.map(r => ({
      fireberry_account_id: r.accountid,
      client_name: r.accountname,
      brand_name: r.pcfsystemfield1475,
      contact_phone: normalizePhone(r.telephone1),
      logo_url: r.pcfsystemfield1445,
      account_manager: r.pcfsystemfield1441name
    }));
    return { preview, total: records.length };
  }

  let created = 0, updated = 0, errors = 0;

  for (const record of records) {
    try {
      const mapped = {
        fireberry_account_id: record.accountid,
        client_name: record.accountname || 'Unnamed',
        brand_name: record.pcfsystemfield1475 || null,
        contact_phone: normalizePhone(record.telephone1),
        logo_url: record.pcfsystemfield1445 || null,
        website_url: record.websiteurl || null,
        drive_url: record.pcfsystemfield114 || null,
        account_manager: record.pcfsystemfield1441name || null,
        fireberry_status: record.statuscode != null ? String(record.statuscode) : null,
        updated_at: new Date()
      };

      const existing = await db('clients').where({ fireberry_account_id: record.accountid }).first();
      if (existing) {
        await db('clients').where({ id: existing.id }).update(mapped);
        updated++;
      } else {
        mapped.created_at = new Date();
        await db('clients').insert(mapped);
        created++;
      }
    } catch (err) {
      log('ERROR', 'fireberry', 'Client upsert failed', {
        syncId, accountId: record.accountid, error: err.message
      });
      errors++;
    }
  }

  const duration = Date.now() - startTime;
  log('INFO', 'fireberry', '=== CLIENT SYNC COMPLETE ===', { syncId, total: records.length, created, updated, errors, duration });

  // Write sync log
  await db('sync_logs').insert({
    sync_type: 'fireberry_clients',
    status: errors > 0 ? 'completed' : 'completed',
    token_source: 'fireberry',
    records_synced: created + updated,
    error_message: errors > 0 ? `${errors} records failed` : null,
    started_at: new Date(Date.now() - duration),
    completed_at: new Date()
  });

  return { total: records.length, created, updated, errors };
}

// --- Token Sync (ObjectType 1013) ---
const TOKEN_FIELDS = [
  'customobject1013id', 'pcfsystemfield100', 'pcfsystemfield104',
  'pcfsystemfield110', 'pcfsystemfield106'
].join(',');

async function syncTokensFromFireberry({ dryRun = false } = {}) {
  const syncId = generateId();
  log('INFO', 'fireberry', '=== TOKEN SYNC START ===', { syncId, dryRun });
  const startTime = Date.now();
  const META_API_VERSION = process.env.META_API_VERSION || 'v21.0';

  const result = await queryAllPages({
    objecttype: 1013,
    fields: TOKEN_FIELDS,
    query: "",
    page_size: 500
  });

  if (!result.success) {
    log('ERROR', 'fireberry', 'Token query failed', { syncId, error: result.error_details });
    return { error: result.error_details, accountsCreated: 0, tokensUpdated: 0, tokensSkipped: 0, errors: 0, total: 0 };
  }

  const records = result.data?.Data || [];
  log('INFO', 'fireberry', 'Token records fetched', { syncId, count: records.length });

  if (dryRun) {
    const preview = [];
    for (const record of records) {
      const phone = normalizePhone(record.pcfsystemfield110);
      const customerLink = record.pcfsystemfield106;
      const fbToken = record.pcfsystemfield100;

      let client = null;
      if (customerLink) {
        client = await db('clients').where({ fireberry_account_id: customerLink }).first();
      }
      if (!client && phone) {
        client = await db('clients').where({ contact_phone: phone }).first();
      }

      preview.push({
        fireberry_record_id: record.customobject1013id,
        phone,
        has_fb_token: !!(fbToken && fbToken.trim().length >= 10),
        page_id: record.pcfsystemfield104,
        matched_client: client ? { id: client.id, name: client.client_name } : null
      });
    }
    return { preview, total: records.length };
  }

  let accountsCreated = 0, tokensUpdated = 0, tokensSkipped = 0, tokenErrors = 0;

  for (const record of records) {
    try {
      const fbToken = record.pcfsystemfield100;
      const pageId = record.pcfsystemfield104;
      const phone = normalizePhone(record.pcfsystemfield110);
      const customerLink = record.pcfsystemfield106;
      const fireberryRecordId = record.customobject1013id;

      if (!fbToken || fbToken.trim().length < 10) {
        tokensSkipped++;
        continue;
      }

      // Find matching client
      let client = null;
      if (customerLink) {
        client = await db('clients').where({ fireberry_account_id: customerLink }).first();
      }
      if (!client && phone) {
        client = await db('clients').where({ contact_phone: phone }).first();
      }

      if (!client) {
        log('DEBUG', 'fireberry', 'No matching client for token', { syncId, recordId: fireberryRecordId, phone });
        tokensSkipped++;
        continue;
      }

      // Use the FB token to discover this client's ad accounts from Meta
      let metaAdAccounts = [];
      try {
        const metaRes = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/me/adaccounts?fields=id,name,currency,timezone_name,account_status&access_token=${fbToken}&limit=100`
        );
        const metaData = await metaRes.json();

        if (metaData.error) {
          log('WARN', 'fireberry', 'Meta token invalid for client', {
            syncId, clientId: client.id, clientName: client.client_name,
            metaError: metaData.error.message
          });
          tokensSkipped++;
          continue;
        }

        metaAdAccounts = metaData.data || [];
      } catch (fetchErr) {
        log('WARN', 'fireberry', 'Meta API call failed', { syncId, clientId: client.id, error: fetchErr.message });
        tokensSkipped++;
        continue;
      }

      if (metaAdAccounts.length === 0) {
        log('DEBUG', 'fireberry', 'Client has no Meta ad accounts', { syncId, clientId: client.id });
        tokensSkipped++;
        continue;
      }

      // Upsert ad_accounts with token
      for (const metaAcc of metaAdAccounts) {
        const existing = await db('ad_accounts').where({ id: metaAcc.id }).first();

        if (existing) {
          await db('ad_accounts').where({ id: metaAcc.id }).update({
            client_id: client.id,
            access_token: fbToken,
            page_id: pageId || null,
            fireberry_record_id: fireberryRecordId,
            account_name: metaAcc.name || existing.account_name,
            currency: metaAcc.currency || existing.currency,
            timezone: metaAcc.timezone_name || existing.timezone,
            status: metaAcc.account_status === 1 ? 'ACTIVE' : 'DISABLED',
            token_source: 'fireberry',
            is_active: metaAcc.account_status === 1,
            last_token_sync: new Date()
          });
          tokensUpdated++;
        } else {
          await db('ad_accounts').insert({
            id: metaAcc.id,
            client_id: client.id,
            access_token: fbToken,
            page_id: pageId || null,
            fireberry_record_id: fireberryRecordId,
            account_name: metaAcc.name || null,
            currency: metaAcc.currency || 'USD',
            timezone: metaAcc.timezone_name || null,
            status: metaAcc.account_status === 1 ? 'ACTIVE' : 'DISABLED',
            token_source: 'fireberry',
            is_active: metaAcc.account_status === 1,
            use_business_token: false,
            last_token_sync: new Date()
          });
          accountsCreated++;
        }
      }

      log('DEBUG', 'fireberry', 'Token + accounts synced', {
        syncId, clientId: client.id, clientName: client.client_name,
        adAccountCount: metaAdAccounts.length,
        tokenPrefix: fbToken.substring(0, 10) + '...'
      });

    } catch (err) {
      log('ERROR', 'fireberry', 'Token sync failed', {
        syncId, recordId: record.customobject1013id, error: err.message
      });
      tokenErrors++;
    }
  }

  const duration = Date.now() - startTime;
  log('INFO', 'fireberry', '=== TOKEN SYNC COMPLETE ===', {
    syncId, total: records.length, accountsCreated, tokensUpdated, tokensSkipped, errors: tokenErrors, duration
  });

  await db('sync_logs').insert({
    sync_type: 'fireberry_tokens',
    status: 'completed',
    token_source: 'fireberry',
    records_synced: accountsCreated + tokensUpdated,
    error_message: tokenErrors > 0 ? `${tokenErrors} records failed` : null,
    started_at: new Date(Date.now() - duration),
    completed_at: new Date()
  });

  return { total: records.length, accountsCreated, tokensUpdated, tokensSkipped, errors: tokenErrors };
}

// --- Full Sync ---
async function syncAllFromFireberry() {
  const clientResult = await syncClientsFromFireberry();
  const tokenResult = await syncTokensFromFireberry();
  return { clients: clientResult, tokens: tokenResult };
}

module.exports = {
  syncClientsFromFireberry,
  syncTokensFromFireberry,
  syncAllFromFireberry,
  normalizePhone
};
