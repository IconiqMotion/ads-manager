/**
 * Cleanup script: remaps clients from junk/raw Facebook category industries
 * to the 10 standard industries, then deletes the junk industries.
 *
 * Run: node backend/scripts/cleanup-industries.js
 */

const db = require('../config/db');
const { matchCategory } = require('../services/industry-classifier.service');

const STANDARD_INDUSTRIES = [
  'יופי', 'נדל"ן', 'תיירות', 'רפואה', 'איקומרס',
  'מסעדות', 'קליניקות', 'אופנה', 'חינוך', 'טכנולוגיה'
];

async function run() {
  console.log('=== Industry Cleanup ===\n');

  // Build standard industry name → id map
  const standardRows = await db('industries').whereIn('name', STANDARD_INDUSTRIES).select('id', 'name');
  const standardMap = {};
  for (const row of standardRows) standardMap[row.name] = row.id;

  const missingStandard = STANDARD_INDUSTRIES.filter(n => !standardMap[n]);
  if (missingStandard.length) {
    console.log('Creating missing standard industries:', missingStandard);
    for (const name of missingStandard) {
      const [row] = await db('industries').insert({ name }).returning('*');
      standardMap[name] = row.id;
    }
  }

  // Get all non-standard industries
  const junkIndustries = await db('industries')
    .whereNotIn('name', STANDARD_INDUSTRIES)
    .select('id', 'name');

  if (!junkIndustries.length) {
    console.log('No junk industries found. DB is clean.');
    await db.destroy();
    return;
  }

  console.log(`Found ${junkIndustries.length} non-standard industries to clean up:\n`);

  let remapped = 0;
  let nulled = 0;
  const toDelete = [];

  for (const junk of junkIndustries) {
    const targetName = matchCategory(junk.name);
    const targetId = targetName ? standardMap[targetName] : null;

    const clientCount = await db('clients').where({ industry_id: junk.id }).count('id as count').first();
    const count = parseInt(clientCount.count);

    if (targetId) {
      console.log(`  "${junk.name}" → "${targetName}" (${count} clients)`);
      if (count > 0) {
        await db('clients').where({ industry_id: junk.id }).update({ industry_id: targetId });
        remapped += count;
      }
    } else {
      console.log(`  "${junk.name}" → null/unmapped (${count} clients reset)`);
      if (count > 0) {
        await db('clients').where({ industry_id: junk.id }).update({ industry_id: null });
        nulled += count;
      }
    }

    toDelete.push(junk.id);
  }

  // Null out ads.industry_id for junk industries (foreign key constraint)
  await db('ads').whereIn('industry_id', toDelete).update({ industry_id: null });

  // Delete all junk industries
  await db('industries').whereIn('id', toDelete).del();

  console.log(`\n=== Done ===`);
  console.log(`  Remapped: ${remapped} clients to standard industries`);
  console.log(`  Reset to null: ${nulled} clients (no matching standard industry)`);
  console.log(`  Deleted: ${toDelete.length} junk industries`);

  if (nulled > 0) {
    console.log(`\n  Tip: Run the classify endpoint to re-classify the ${nulled} reset clients.`);
  }

  await db.destroy();
}

run().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
