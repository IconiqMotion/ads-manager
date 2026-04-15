const API_VERSION = process.env.META_API_VERSION || 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

const CAMPAIGN_FIELDS = 'id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time,buying_type';
const ADSET_FIELDS = 'id,name,status,optimization_goal,daily_budget,lifetime_budget,targeting,publisher_platforms';
const AD_FIELDS = 'id,name,status,creative{id,image_url,video_id,body,call_to_action_type,thumbnail_url}';
const INSIGHT_FIELDS = 'ad_id,campaign_id,adset_id,impressions,reach,clicks,ctr,cpc,cpm,spend,actions,cost_per_action_type,frequency';

module.exports = {
  API_VERSION,
  BASE_URL,
  CAMPAIGN_FIELDS,
  ADSET_FIELDS,
  AD_FIELDS,
  INSIGHT_FIELDS,
  RATE_LIMIT_DELAY_MS: 200,
  MAX_RETRIES: 3,
  BACKOFF_BASE_MS: 1000
};
