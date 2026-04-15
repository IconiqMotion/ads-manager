const db = require('../config/db');
const { queryAllPages } = require('../services/fireberry.service');
const { normalizePhone } = require('../services/fireberry-sync.service');

async function run() {
  console.log('=== Populating industries from Facebook ===');

  // Get all unique page_id + token + client_id
  const accounts = await db('ad_accounts')
    .select('page_id', 'access_token', 'client_id')
    .whereNotNull('page_id')
    .whereNotNull('access_token')
    .where('is_active', true)
    .groupBy('page_id', 'access_token', 'client_id');

  console.log('Fetching categories from', accounts.length, 'pages...');

  const clientCategories = {};
  let fetched = 0;

  for (const acc of accounts) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${acc.page_id}?fields=category&access_token=${acc.access_token}`
      );
      const data = await res.json();
      if (data.category && !data.error) {
        clientCategories[acc.client_id] = data.category;
        fetched++;
      }
    } catch {}
  }

  console.log('Got categories for', fetched, 'clients from ad_accounts');

  // Also try Fireberry tokens for clients without ad_accounts
  const fbResult = await queryAllPages({
    objecttype: 1013,
    fields: 'pcfsystemfield100,pcfsystemfield110,pcfsystemfield106',
    query: '',
    page_size: 500
  });

  if (fbResult.success) {
    const assignedIds = new Set(Object.keys(clientCategories).map(Number));
    const records = fbResult.data?.Data || [];
    let extra = 0;

    for (const record of records) {
      const token = record.pcfsystemfield100;
      if (!token || token.length < 10) continue;

      const phone = normalizePhone(record.pcfsystemfield110);
      const customerLink = record.pcfsystemfield106;

      let client = null;
      if (customerLink) client = await db('clients').where({ fireberry_account_id: customerLink }).first();
      if (!client && phone) client = await db('clients').where({ contact_phone: phone }).first();
      if (!client || assignedIds.has(client.id)) continue;

      try {
        const pageRes = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?fields=category&access_token=${token}&limit=1`
        );
        const pageData = await pageRes.json();
        if (pageData.data?.[0]?.category) {
          clientCategories[client.id] = pageData.data[0].category;
          assignedIds.add(client.id);
          extra++;
        }
      } catch {}
    }
    console.log('Extra from Fireberry tokens:', extra);
  }

  // Get unique categories and create industries
  const uniqueCategories = [...new Set(Object.values(clientCategories))].sort();
  console.log('Unique Facebook categories:', uniqueCategories.length);

  const industryMap = {};
  for (const cat of uniqueCategories) {
    const existing = await db('industries').where({ name: cat }).first();
    if (existing) {
      industryMap[cat] = existing.id;
    } else {
      const [row] = await db('industries').insert({ name: cat }).returning('*');
      industryMap[cat] = row.id;
    }
  }
  console.log('Industries in DB:', Object.keys(industryMap).length);

  // Assign clients
  let assigned = 0;
  for (const [clientId, category] of Object.entries(clientCategories)) {
    const industryId = industryMap[category];
    if (industryId) {
      await db('clients').where({ id: parseInt(clientId) }).whereNull('industry_id').update({ industry_id: industryId });
      assigned++;
    }
  }
  console.log('Clients assigned to industries:', assigned);

  // Print results
  const industries = await db('industries')
    .select('industries.name')
    .select(db.raw('count(clients.id)::int as client_count'))
    .leftJoin('clients', 'clients.industry_id', 'industries.id')
    .groupBy('industries.id', 'industries.name')
    .orderBy('client_count', 'desc');

  console.log('');
  console.log('=== INDUSTRIES FROM FACEBOOK ===');
  let total = 0;
  industries.forEach(i => {
    if (i.client_count > 0) {
      console.log(String(i.client_count).padStart(4) + '  ' + i.name);
      total += i.client_count;
    }
  });
  console.log('────────────────');
  console.log(String(total).padStart(4) + '  TOTAL');
  console.log(industries.length + ' industries');

  await db.destroy();
}

run().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
