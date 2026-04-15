const { BASE_URL, CAMPAIGN_FIELDS, ADSET_FIELDS, AD_FIELDS, INSIGHT_FIELDS } = require('../config/meta-api');
const { rateLimitDelay, getBackoffDelay, sleep, MAX_RETRIES } = require('../utils/meta-helpers');
const { log, generateId } = require('../utils/logger');

/**
 * Generic Meta API call with logging, error categorization, and retry.
 */
async function callMetaApi(endpoint, token, params = {}) {
  const requestId = generateId();
  const startTime = Date.now();

  log('DEBUG', 'meta-api', 'API call starting', { requestId, endpoint });

  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set('access_token', token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url.toString());
      const duration = Date.now() - startTime;

      if (response.status === 429) {
        const backoff = getBackoffDelay(attempt);
        log('WARN', 'meta-api', 'Rate limited, backing off', { requestId, endpoint, attempt, backoff });
        if (attempt < MAX_RETRIES) { await sleep(backoff); continue; }
        return { error: 'RATE_LIMITED', requestId };
      }

      const data = await response.json();

      // Error in response body
      if (data.error) {
        const errCode = data.error.code;
        if (errCode === 190 || data.error.type === 'OAuthException') {
          log('ERROR', 'meta-api', 'Token invalid', { requestId, endpoint, errorCode: errCode });
          return { error: 'TOKEN_INVALID', message: data.error.message, requestId };
        }
        log('ERROR', 'meta-api', 'Meta API error', {
          requestId, endpoint, errorCode: errCode, message: data.error.message, duration
        });
        return { error: 'META_ERROR', code: errCode, message: data.error.message, requestId };
      }

      log('INFO', 'meta-api', 'API call success', {
        requestId, endpoint,
        recordCount: Array.isArray(data.data) ? data.data.length : 0,
        hasNextPage: !!data.paging?.next,
        duration
      });

      return { data: data.data || data, paging: data.paging, requestId };

    } catch (err) {
      const duration = Date.now() - startTime;
      if (attempt < MAX_RETRIES) {
        log('WARN', 'meta-api', 'Network error, retrying', { requestId, endpoint, attempt, error: err.message });
        await sleep(getBackoffDelay(attempt));
        continue;
      }
      log('ERROR', 'meta-api', 'API call failed after retries', { requestId, endpoint, error: err.message, duration });
      return { error: 'NETWORK_ERROR', message: err.message, requestId };
    }
  }
}

/**
 * Fetch all pages from a paginated endpoint.
 */
async function fetchAllPages(endpoint, token, params = {}) {
  const startTime = Date.now();
  log('DEBUG', 'meta-api', 'Entry: fetchAllPages', { endpoint });

  const allRecords = [];
  let url = `${BASE_URL}${endpoint}`;
  const urlObj = new URL(url);
  urlObj.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) urlObj.searchParams.set(k, v);
  urlObj.searchParams.set('limit', '200');

  let nextUrl = urlObj.toString();
  let pageNum = 0;

  while (nextUrl) {
    pageNum++;
    try {
      const response = await fetch(nextUrl);
      const data = await response.json();

      if (data.error) {
        log('ERROR', 'meta-api', 'Pagination error', { endpoint, page: pageNum, error: data.error });
        return { error: 'META_ERROR', message: data.error.message, data: allRecords };
      }

      const pageRecords = data.data ? data.data.length : 0;
      if (data.data) allRecords.push(...data.data);
      log('DEBUG', 'meta-api', 'Page fetched', { endpoint, page: pageNum, pageRecords, totalSoFar: allRecords.length });

      nextUrl = data.paging?.next || null;

      await rateLimitDelay();
    } catch (err) {
      const duration = Date.now() - startTime;
      log('ERROR', 'meta-api', 'Pagination fetch failed', { endpoint, page: pageNum, error: err.message, duration });
      return { error: 'NETWORK_ERROR', message: err.message, data: allRecords };
    }
  }

  const duration = Date.now() - startTime;
  log('INFO', 'meta-api', 'Exit: fetchAllPages', { endpoint, totalRecords: allRecords.length, pages: pageNum, duration });
  return { data: allRecords };
}

// --- Specific fetchers ---

async function validateToken(token) {
  return callMetaApi('/me', token);
}

async function fetchCampaigns(adAccountId, token) {
  return fetchAllPages(`/${adAccountId}/campaigns`, token, { fields: CAMPAIGN_FIELDS });
}

async function fetchAdSets(campaignId, token) {
  return fetchAllPages(`/${campaignId}/adsets`, token, { fields: ADSET_FIELDS });
}

async function fetchAds(adSetId, token) {
  return fetchAllPages(`/${adSetId}/ads`, token, { fields: AD_FIELDS });
}

async function fetchInsights(objectId, token, { dateFrom, dateTo, level = 'ad' } = {}) {
  const params = { fields: INSIGHT_FIELDS, time_increment: '1', level };
  if (dateFrom && dateTo) {
    params.time_range = JSON.stringify({ since: dateFrom, until: dateTo });
  } else {
    params.date_preset = 'last_30d';
  }
  return fetchAllPages(`/${objectId}/insights`, token, params);
}

async function fetchBusinessAccounts(businessId, token) {
  const owned = await fetchAllPages(`/${businessId}/owned_ad_accounts`, token, {
    fields: 'id,name,currency,timezone_name,account_status'
  });
  const client = await fetchAllPages(`/${businessId}/client_ad_accounts`, token, {
    fields: 'id,name,currency,timezone_name,account_status'
  });
  return {
    data: [...(owned.data || []), ...(client.data || [])],
    error: owned.error || client.error
  };
}

module.exports = {
  callMetaApi,
  fetchAllPages,
  validateToken,
  fetchCampaigns,
  fetchAdSets,
  fetchAds,
  fetchInsights,
  fetchBusinessAccounts
};
