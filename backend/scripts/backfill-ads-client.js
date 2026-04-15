/**
 * Backfills client_id on ads that don't have it set,
 * by tracing: ad → campaign → ad_account → client_id
 *
 * Run: node backend/scripts/backfill-ads-client.js
 */

const db = require('../config/db');

async function run() {
  console.log('=== Backfill ads.client_id ===\n');

  // Diagnostic first
  const [{ total }] = await db('ads').count('id as total');
  const [{ missing }] = await db('ads').whereNull('client_id').count('id as missing');
  console.log(`Total ads: ${total}`);
  console.log(`Ads missing client_id: ${missing}\n`);

  if (parseInt(missing) === 0) {
    console.log('Nothing to backfill.');
    await db.destroy();
    return;
  }

  // Backfill: ad → campaign → ad_account → client_id
  const updated = await db('ads')
    .whereNull('ads.client_id')
    .update({
      client_id: db('campaigns')
        .join('ad_accounts', 'campaigns.ad_account_id', 'ad_accounts.id')
        .whereRaw('campaigns.id = ads.campaign_id')
        .whereNotNull('ad_accounts.client_id')
        .select('ad_accounts.client_id')
        .limit(1)
    });

  console.log(`Updated ${updated} ads with client_id from their campaign's ad_account.\n`);

  // Re-check
  const [{ remaining }] = await db('ads').whereNull('client_id').count('id as remaining');
  console.log(`Still missing client_id: ${remaining}`);
  if (parseInt(remaining) > 0) {
    console.log('These ads belong to ad_accounts with no linked client.');
  }

  await db.destroy();
}

run().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
