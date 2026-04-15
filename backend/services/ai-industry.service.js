const OpenAI = require('openai');
const db = require('../config/db');
const { log } = require('../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Use GPT to classify an ad's industry from the existing industries in the DB.
 * Returns { industry_id, industry_name, confidence } or null on failure.
 */
async function classifyAdIndustry(adId) {
  const ad = await db('ads')
    .select('ads.*', 'campaigns.name as campaign_name', 'clients.client_name')
    .leftJoin('campaigns', 'ads.campaign_id', 'campaigns.id')
    .leftJoin('clients', 'ads.client_id', 'clients.id')
    .where('ads.id', adId)
    .first();

  if (!ad) return null;

  const industries = await db('industries').select('id', 'name').orderBy('name');
  if (!industries.length) return null;

  const industryList = industries.map(i => `${i.id}: ${i.name}`).join('\n');
  const adContext = [
    ad.name && `Ad name: ${ad.name}`,
    ad.campaign_name && `Campaign: ${ad.campaign_name}`,
    ad.body_text && `Ad text: ${ad.body_text.slice(0, 500)}`,
    ad.cta_type && `CTA: ${ad.cta_type}`,
    ad.client_name && `Client: ${ad.client_name}`
  ].filter(Boolean).join('\n');

  const prompt = `You are classifying a Facebook ad into an industry category.

Ad details:
${adContext}

Available industries (id: name):
${industryList}

Reply with ONLY the industry id number that best matches this ad. No explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      temperature: 0
    });

    const raw = response.choices[0]?.message?.content?.trim();
    const industryId = parseInt(raw);
    const matched = industries.find(i => i.id === industryId);

    if (!matched) {
      log('WARN', 'ai-industry', 'GPT returned unrecognized id', { adId, raw });
      return null;
    }

    return { industry_id: matched.id, industry_name: matched.name };
  } catch (err) {
    log('ERROR', 'ai-industry', 'OpenAI call failed', { adId, error: err.message });
    return null;
  }
}

/**
 * Classify and save industry_id to the ad row.
 */
async function classifyAndSaveAdIndustry(adId) {
  const result = await classifyAdIndustry(adId);
  if (!result) return null;

  await db('ads').where({ id: adId }).update({ industry_id: result.industry_id });
  log('INFO', 'ai-industry', 'Ad classified', { adId, industry: result.industry_name });
  return result;
}

/**
 * Classify all ads that have no industry_id yet, in batches.
 */
async function classifyUntaggedAds({ limit = 200 } = {}) {
  const ads = await db('ads').whereNull('industry_id').limit(limit).select('id');
  log('INFO', 'ai-industry', `Classifying ${ads.length} untagged ads`);

  let done = 0, errors = 0;
  for (const ad of ads) {
    try {
      await classifyAndSaveAdIndustry(ad.id);
      done++;
      await new Promise(r => setTimeout(r, 150)); // rate limit
    } catch { errors++; }
  }

  return { total: ads.length, done, errors };
}

module.exports = { classifyAdIndustry, classifyAndSaveAdIndustry, classifyUntaggedAds };
