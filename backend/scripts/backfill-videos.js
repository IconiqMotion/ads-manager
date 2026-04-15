/**
 * backfill-videos.js
 * Re-fetches video_url from Meta API for all ads that have video_url=null
 * and tries to download them locally.
 * Run: node scripts/backfill-videos.js
 */

const db = require('../config/db');
const { downloadVideoIfNeeded } = require('../services/media.service');

const API_VERSION = process.env.META_API_VERSION || 'v21.0';

async function fetchAdCreative(adId, token) {
  const url = `https://graph.facebook.com/${API_VERSION}/${adId}?fields=creative{video_id,thumbnail_url,object_story_spec}&access_token=${token}`;
  const res = await fetch(url);
  return res.json();
}

async function fetchVideoUrl(videoId, token) {
  const url = `https://graph.facebook.com/${API_VERSION}/${videoId}?fields=source&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.source || null;
}

async function main() {
  // Get all ads with a stale/missing video_url but that we know are videos
  // (they have thumbnail_url set, which Meta only sets for video ads)
  const ads = await db('ads as a')
    .join('campaigns as c', 'a.campaign_id', 'c.id')
    .join('ad_accounts as aa', 'c.ad_account_id', 'aa.id')
    .select('a.id', 'a.video_url', 'a.local_video', 'aa.id as account_id', 'aa.access_token', 'aa.use_business_token')
    .whereNull('a.local_video')
    .whereNotNull('a.video_url')
    .limit(500);

  console.log(`Found ${ads.length} video ads without local copy\n`);

  const BUSINESS_TOKEN = process.env.META_BUSINESS_TOKEN;
  let downloaded = 0, failed = 0;

  for (const ad of ads) {
    const token = ad.use_business_token ? BUSINESS_TOKEN : ad.access_token;
    if (!token) { failed++; continue; }

    try {
      const result = await downloadVideoIfNeeded(
        { id: ad.id, video_url: ad.video_url },
        ad.account_id
      );
      if (result.downloaded) {
        downloaded++;
        process.stdout.write(`\r Downloaded: ${downloaded}  Failed: ${failed}`);
      } else if (result.error) {
        // video_url expired — skip (would need re-sync to get fresh URL)
        failed++;
      }
    } catch (err) {
      failed++;
    }

    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n\nDone. Downloaded: ${downloaded}, Failed/Expired: ${failed}`);
  console.log('For expired URLs, trigger a manual sync from the UI to get fresh video_url values.');
  await db.destroy();
}

main().catch(err => { console.error(err.message); process.exit(1); });
