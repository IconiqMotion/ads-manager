const db = require('../config/db');
const { log, generateId } = require('../utils/logger');

/**
 * Classify ads by their ad account's Facebook page category.
 *
 * Flow: ad → campaign → ad_account → page_id → Facebook category → industry
 *
 * No keyword guessing. The Facebook page category IS the industry.
 */
async function classifyAds() {
  const syncId = generateId();
  const startTime = Date.now();
  log('INFO', 'ad-classifier', '=== AD CLASSIFICATION START ===', { syncId });

  try {
    // Step 1: Get all ad accounts with their page_id and token
    const accounts = await db('ad_accounts')
      .select('id', 'page_id', 'access_token')
      .whereNotNull('page_id')
      .whereNotNull('access_token')
      .where('is_active', true);

    log('INFO', 'ad-classifier', 'Fetching Facebook categories for ad accounts', { syncId, accounts: accounts.length });

    // Step 2: Fetch Facebook page category for each account
    const accountIndustry = {}; // ad_account_id → industry_id

    const industries = await db('industries').select('id', 'name');
    const industryByName = {};
    industries.forEach(i => { industryByName[i.name] = i.id; });

    let fetched = 0;
    for (const acc of accounts) {
      try {
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${acc.page_id}?fields=category&access_token=${acc.access_token}`
        );
        const data = await res.json();

        if (data.category && !data.error) {
          let industryId = industryByName[data.category];

          // Create industry if it doesn't exist
          if (!industryId) {
            const [row] = await db('industries').insert({ name: data.category }).returning('*');
            industryId = row.id;
            industryByName[data.category] = industryId;
          }

          accountIndustry[acc.id] = industryId;
          fetched++;
        }
      } catch {}
    }

    log('INFO', 'ad-classifier', 'Facebook categories fetched', { syncId, fetched, total: accounts.length });

    // Step 3: Classify all ads by their ad account's industry
    let classified = 0;

    const ads = await db('ads')
      .select('ads.id', 'campaigns.ad_account_id')
      .join('campaigns', 'ads.campaign_id', 'campaigns.id')
      .whereNotNull('campaigns.ad_account_id');

    for (const ad of ads) {
      const industryId = accountIndustry[ad.ad_account_id];
      if (industryId) {
        await db('ads').where({ id: ad.id }).update({ industry_id: industryId });
        classified++;
      }
    }

    const duration = Date.now() - startTime;
    log('INFO', 'ad-classifier', '=== AD CLASSIFICATION COMPLETE ===', {
      syncId, totalAds: ads.length, classified, unclassified: ads.length - classified, duration
    });

    return { totalAds: ads.length, classified, unclassified: ads.length - classified };
  } catch (err) {
    log('ERROR', 'ad-classifier', 'Classification failed', { syncId, error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

module.exports = { classifyAds };
