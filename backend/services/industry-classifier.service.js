const db = require('../config/db');
const { log, generateId } = require('../utils/logger');

const API_VERSION = process.env.META_API_VERSION || 'v21.0';

/**
 * Return the id of an industry row matching `name`, creating it if needed.
 */
async function getOrCreateIndustry(name) {
  const existing = await db('industries').where({ name }).first();
  if (existing) return existing.id;
  const [created] = await db('industries').insert({ name }).returning('id');
  return created.id;
}

async function classifyClientsFromFacebook() {
  const syncId = generateId();
  const startTime = Date.now();
  log('INFO', 'industry', '=== INDUSTRY CLASSIFICATION START ===', { syncId });

  try {
    // STEP 1: Clients with page_id via ad_accounts
    const fromAdAccounts = await db('ad_accounts')
      .select('ad_accounts.page_id', 'ad_accounts.access_token', 'ad_accounts.client_id')
      .join('clients', 'ad_accounts.client_id', 'clients.id')
      .whereNotNull('ad_accounts.page_id')
      .whereNotNull('ad_accounts.access_token')
      .where('ad_accounts.is_active', true)
      .whereNull('clients.industry_id')
      .groupBy('ad_accounts.client_id', 'ad_accounts.page_id', 'ad_accounts.access_token');

    // STEP 2: Clients without ad_accounts but with FB tokens in Fireberry
    const { queryAllPages } = require('./fireberry.service');
    const { normalizePhone } = require('./fireberry-sync.service');

    const fbResult = await queryAllPages({
      objecttype: 1013,
      fields: 'pcfsystemfield100,pcfsystemfield104,pcfsystemfield110,pcfsystemfield106',
      query: '',
      page_size: 500
    });

    const fromFireberry = [];
    if (fbResult.success) {
      const fbRecords = fbResult.data?.Data || [];
      const classifiedClientIds = new Set(fromAdAccounts.map(a => a.client_id));

      for (const record of fbRecords) {
        const token = record.pcfsystemfield100;
        if (!token || token.length < 10) continue;

        const phone = normalizePhone(record.pcfsystemfield110);
        const customerLink = record.pcfsystemfield106;

        let client = null;
        if (customerLink) client = await db('clients').where({ fireberry_account_id: customerLink }).whereNull('industry_id').first();
        if (!client && phone) client = await db('clients').where({ contact_phone: phone }).whereNull('industry_id').first();
        if (!client || classifiedClientIds.has(client.id)) continue;

        try {
          const pageRes = await fetch(`https://graph.facebook.com/${API_VERSION}/me/accounts?fields=id,name,category&access_token=${token}&limit=1`);
          const pageData = await pageRes.json();
          if (pageData.data?.[0]) {
            const page = pageData.data[0];
            fromFireberry.push({ client_id: client.id, page_id: page.id, access_token: token, fbCategory: page.category });
            classifiedClientIds.add(client.id);
          }
        } catch { /* skip */ }

        await new Promise(r => setTimeout(r, 100));
      }
    }

    const accounts = [
      ...fromAdAccounts,
      ...fromFireberry.map(f => ({ page_id: f.page_id, access_token: f.access_token, client_id: f.client_id, _preloaded: f }))
    ];

    log('INFO', 'industry', 'Clients to classify', { syncId, fromAdAccounts: fromAdAccounts.length, fromFireberry: fromFireberry.length, total: accounts.length });

    let classified = 0, skipped = 0, errors = 0;

    for (const acc of accounts) {
      try {
        let fbCategory = null;

        if (acc._preloaded) {
          fbCategory = acc._preloaded.fbCategory;
        } else {
          const res = await fetch(
            `https://graph.facebook.com/${API_VERSION}/${acc.page_id}?fields=category&access_token=${acc.access_token}`
          );
          const data = await res.json();
          if (data.error) { skipped++; continue; }
          fbCategory = data.category;
        }

        if (!fbCategory) { skipped++; continue; }

        const industryId = await getOrCreateIndustry(fbCategory);
        await db('clients').where({ id: acc.client_id }).whereNull('industry_id').update({ industry_id: industryId });
        classified++;

        log('DEBUG', 'industry', 'Classified', { syncId, clientId: acc.client_id, fbCategory });

        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        log('WARN', 'industry', 'Classification failed for account', { syncId, clientId: acc.client_id, error: err.message });
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    log('INFO', 'industry', '=== INDUSTRY CLASSIFICATION COMPLETE ===', {
      syncId, total: accounts.length, classified, skipped, errors, duration
    });

    return { total: accounts.length, classified, skipped, errors };
  } catch (err) {
    log('ERROR', 'industry', 'Classification failed', { syncId, error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

module.exports = { classifyClientsFromFacebook };
