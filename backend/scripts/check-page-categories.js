/**
 * check-page-categories.js
 * Fetches the Facebook Page category for every ad account that has a page_id.
 * Run from the backend directory:
 *   node scripts/check-page-categories.js
 */

const db = require('../config/db');

const API_VERSION = process.env.META_API_VERSION || 'v21.0';
const BUSINESS_TOKEN = process.env.META_BUSINESS_TOKEN;

async function fetchPageCategory(pageId, token) {
  const url = `https://graph.facebook.com/${API_VERSION}/${pageId}?fields=id,name,category,category_list&access_token=${token}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) return { error: data.error.message };
    return {
      name: data.name,
      category: data.category,
      category_list: (data.category_list || []).map(c => c.name),
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function main() {
  const accounts = await db('ad_accounts')
    .join('clients', 'ad_accounts.client_id', 'clients.id')
    .select(
      'ad_accounts.id as account_id',
      'ad_accounts.account_name',
      'ad_accounts.page_id',
      'ad_accounts.access_token',
      'ad_accounts.use_business_token',
      'clients.client_name as client_name'
    )
    .whereNotNull('ad_accounts.page_id')
    .where('ad_accounts.is_active', true)
    .orderBy('clients.client_name');

  if (!accounts.length) {
    console.log('No active ad accounts with a page_id found.');
    await db.destroy();
    return;
  }

  console.log(`\nChecking categories for ${accounts.length} pages...\n`);
  console.log('─'.repeat(90));

  const unmapped = [];

  for (const acc of accounts) {
    const token = acc.use_business_token ? BUSINESS_TOKEN : acc.access_token;

    if (!token) {
      console.log(`[SKIP] ${acc.client_name} / ${acc.account_name} — no token available`);
      continue;
    }

    const result = await fetchPageCategory(acc.page_id, token);

    if (result.error) {
      console.log(`[ERR]  ${acc.client_name} / ${acc.account_name} (page ${acc.page_id})`);
      console.log(`       Error: ${result.error}`);
    } else {
      const cats = result.category_list?.length
        ? result.category_list.join(', ')
        : result.category || '—';
      console.log(`[OK]   ${acc.client_name} / ${acc.account_name}`);
      console.log(`       Page: ${result.name} (${acc.page_id})`);
      console.log(`       Category: ${result.category}`);
      if (result.category_list?.length > 1) {
        console.log(`       Category list: ${cats}`);
      }
      unmapped.push({ client: acc.client_name, page: result.name, category: result.category, category_list: result.category_list });
    }

    console.log('─'.repeat(90));

    // Respect rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  // Summary of unique categories
  const unique = [...new Set(unmapped.map(u => u.category).filter(Boolean))].sort();
  console.log(`\n=== UNIQUE CATEGORIES FOUND (${unique.length}) ===`);
  unique.forEach(c => console.log(`  • ${c}`));

  await db.destroy();
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
