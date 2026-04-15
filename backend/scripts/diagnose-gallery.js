const db = require('../config/db');

async function run() {
  // Clients that have ads but no industry
  const [{ no_industry }] = await db('clients')
    .whereNull('industry_id')
    .whereExists(db('ads').whereRaw('ads.client_id = clients.id'))
    .count('* as no_industry');

  // Clients that have ads AND have industry
  const [{ with_industry }] = await db('clients')
    .whereNotNull('industry_id')
    .whereExists(db('ads').whereRaw('ads.client_id = clients.id'))
    .count('* as with_industry');

  console.log(`Clients with ads + NO industry: ${no_industry}`);
  console.log(`Clients with ads + HAS industry: ${with_industry}`);

  await db.destroy();
}

run().catch(err => { console.error(err.message); process.exit(1); });
