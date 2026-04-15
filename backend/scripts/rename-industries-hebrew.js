/**
 * Renames the 10 standard industries to Hebrew.
 * Run: node backend/scripts/rename-industries-hebrew.js
 */

const db = require('../config/db');

const RENAME_MAP = {
  'Beauty':      'יופי',
  'Real Estate': 'נדל"ן',
  'Travel':      'תיירות',
  'Medical':     'רפואה',
  'E-commerce':  'איקומרס',
  'Restaurants': 'מסעדות',
  'Clinics':     'קליניקות',
  'Fashion':     'אופנה',
  'Education':   'חינוך',
  'Technology':  'טכנולוגיה',
};

async function run() {
  console.log('=== Renaming industries to Hebrew ===\n');

  for (const [en, he] of Object.entries(RENAME_MAP)) {
    const updated = await db('industries').where({ name: en }).update({ name: he });
    if (updated) {
      console.log(`  "${en}" → "${he}"`);
    } else {
      console.log(`  "${en}" — not found (skipped)`);
    }
  }

  console.log('\nDone.');
  await db.destroy();
}

run().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
