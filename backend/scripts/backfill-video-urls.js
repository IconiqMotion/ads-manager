/**
 * backfill-video-urls.js
 * For all ads that have thumbnail_url but no video_url,
 * re-fetches the creative from Meta to get the video_id -> video source URL,
 * then downloads locally.
 * Run: node scripts/backfill-video-urls.js
 */

const db = require('../config/db');
const { downloadVideoIfNeeded } = require('../services/media.service');
const { BASE_URL } = require('../config/meta-api');

const BUSINESS_TOKEN = process.env.META_BUSINESS_TOKEN;

async function fetchVideoSource(videoId, token) {
  const res = await fetch(`${BASE_URL}/${videoId}?fields=source&access_token=${token}`);
  const data = await res.json();
  return data.source || null;
}

async function fetchCreativeVideoId(adId, token) {
  const res = await fetch(`${BASE_URL}/${adId}?fields=creative{video_id,thumbnail_url}&access_token=${token}`);
  const data = await res.json();
  return data?.creative?.video_id || null;
}

async function main() {
  const ads = await db('ads as a')
    .join('campaigns as c', 'a.campaign_id', 'c.id')
    .join('ad_accounts as aa', 'c.ad_account_id', 'aa.id')
    .select('a.id', 'aa.id as account_id', 'aa.access_token', 'aa.use_business_token')
    .whereNull('a.video_url')
    .whereNull('a.local_video')
    .whereNotNull('a.thumbnail_url');

  console.log(`Found ${ads.length} video ads missing video_url\n`);

  let fetched = 0, downloaded = 0, failed = 0;

  for (const ad of ads) {
    const token = ad.use_business_token ? BUSINESS_TOKEN : ad.access_token;
    if (!token) { failed++; continue; }

    try {
      const videoId = await fetchCreativeVideoId(ad.id, token);
      if (!videoId) { failed++; continue; }

      const videoUrl = await fetchVideoSource(videoId, token);
      if (!videoUrl) { failed++; continue; }

      fetched++;

      // Save URL to DB
      await db('ads').where({ id: ad.id }).update({ video_url: videoUrl, updated_at: new Date() });

      // Download locally
      const result = await downloadVideoIfNeeded({ id: ad.id, video_url: videoUrl }, ad.account_id);
      if (result.downloaded) downloaded++;

      process.stdout.write(`\rFetched: ${fetched}  Downloaded: ${downloaded}  Failed: ${failed}`);
    } catch (err) {
      failed++;
    }

    // Respect rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n\nDone. Fetched URLs: ${fetched}, Downloaded locally: ${downloaded}, Failed: ${failed}`);
  await db.destroy();
}

main().catch(err => { console.error(err.message); process.exit(1); });
