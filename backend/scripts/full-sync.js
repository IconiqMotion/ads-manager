const { syncAccount } = require('../services/sync.service');
const db = require('../config/db');

async function run() {
  console.log('Starting full sync...');
  const start = Date.now();

  const accounts = await db('ad_accounts')
    .where({ is_active: true })
    .whereNotNull('access_token')
    .orderBy('last_synced_at', 'asc nulls first');

  console.log('Accounts to sync:', accounts.length);

  let succeeded = 0, failed = 0, totalCampaigns = 0, totalAds = 0, totalSnapshots = 0;

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    try {
      const result = await syncAccount(acc.id, { syncType: 'full' });
      if (result.error) {
        failed++;
      } else if (result.counters) {
        succeeded++;
        totalCampaigns += result.counters.campaigns || 0;
        totalAds += result.counters.ads || 0;
        totalSnapshots += result.counters.snapshots || 0;
      }
    } catch (err) {
      failed++;
    }

    if ((i + 1) % 20 === 0) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`[${i + 1}/${accounts.length}] ${elapsed}s — ok:${succeeded} fail:${failed} camps:${totalCampaigns} ads:${totalAds} snaps:${totalSnapshots}`);
    }
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log('=== DONE ===');
  console.log(`${elapsed}s — ok:${succeeded} fail:${failed} camps:${totalCampaigns} ads:${totalAds} snaps:${totalSnapshots}`);

  await db.destroy();
}

run().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
