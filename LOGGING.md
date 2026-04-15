# Logging & Validation Strategy

Every critical path logs **entry → each step → exit/error** with structured data so you can trace exactly where something broke without guessing.

---

## Logger Format

All logs follow a consistent structure:

```javascript
// utils/logger.js
const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };

function log(level, context, message, data = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        context,       // e.g. "sync", "query", "auth", "meta-api"
        message,
        ...data
    };
    console.log(JSON.stringify(entry));
}

// Usage:
// log('INFO', 'sync', 'Starting account sync', { accountId: 'act_123', tokenSource: 'business' })
// log('ERROR', 'meta-api', 'Rate limited', { accountId: 'act_123', retryAfter: 300, endpoint: '/campaigns' })
```

Every log entry has: `timestamp`, `level`, `context`, `message`, and relevant data fields. No unstructured `console.log` anywhere.

---

## Critical Path 1: Token Resolution

### Flow
```
resolveToken(account) → check per-account → check business → return or null
```

### Validation & Logs

```javascript
function resolveToken(account) {
    log('DEBUG', 'token', 'Resolving token', {
        accountId: account.id,
        hasAccountToken: !!account.access_token,
        tokenExpires: account.token_expires,
        useBusinessFallback: account.use_business_token
    });

    // Step 1: Try per-account token
    if (account.access_token) {
        if (!account.token_expires) {
            log('WARN', 'token', 'Account token has no expiry date', { accountId: account.id });
            // Still use it, but flag
        }
        if (account.token_expires && new Date(account.token_expires) < new Date()) {
            log('WARN', 'token', 'Account token expired', {
                accountId: account.id,
                expiredAt: account.token_expires
            });
            // Fall through to business token
        } else {
            log('INFO', 'token', 'Using per-account token', { accountId: account.id });
            return { token: account.access_token, source: 'account' };
        }
    }

    // Step 2: Try business token
    if (account.use_business_token && process.env.META_BUSINESS_TOKEN) {
        log('INFO', 'token', 'Using business token fallback', { accountId: account.id });
        return { token: process.env.META_BUSINESS_TOKEN, source: 'business' };
    }

    // Step 3: No token
    log('ERROR', 'token', 'No valid token available', {
        accountId: account.id,
        hasAccountToken: !!account.access_token,
        accountTokenExpired: account.token_expires ? new Date(account.token_expires) < new Date() : null,
        hasBusinessToken: !!process.env.META_BUSINESS_TOKEN,
        useBusinessFallback: account.use_business_token
    });
    return null;
}
```

### Validation Checks
| Check | When | Action on Fail |
|-------|------|----------------|
| `access_token` is non-empty string | Before using per-account token | Fall to business token |
| `token_expires` is valid date | Before expiry check | Log WARN, use token anyway |
| `token_expires > now` | Before using per-account token | Fall to business token |
| `META_BUSINESS_TOKEN` env exists | Before using business token | Return null, log ERROR |
| Token works against Meta `/me` | After resolution, before sync | Mark account as invalid, skip |

---

## Critical Path 2: Meta API Calls

### Flow
```
callMetaApi(endpoint, token) → request → check status → check body → parse → return
```

### Validation & Logs

```javascript
async function callMetaApi(endpoint, token, params = {}) {
    const requestId = generateId();  // Unique per call for tracing

    log('DEBUG', 'meta-api', 'API call starting', {
        requestId,
        endpoint,
        params: Object.keys(params),  // Log keys only, not values (tokens)
        tokenSource: token.source
    });

    const startTime = Date.now();

    try {
        const response = await fetch(url, options);
        const duration = Date.now() - startTime;

        // Log rate limit headers
        const rateLimit = response.headers.get('x-business-use-case-usage');
        if (rateLimit) {
            const usage = JSON.parse(rateLimit);
            log('DEBUG', 'meta-api', 'Rate limit status', {
                requestId,
                endpoint,
                usage,
                duration
            });

            // VALIDATION: Check if approaching rate limit
            const percentUsed = extractPercentage(usage);
            if (percentUsed > 75) {
                log('WARN', 'meta-api', 'Approaching rate limit', {
                    requestId,
                    endpoint,
                    percentUsed
                });
            }
        }

        // VALIDATION: HTTP status
        if (!response.ok) {
            const errorBody = await response.text();
            log('ERROR', 'meta-api', 'API error response', {
                requestId,
                endpoint,
                status: response.status,
                errorBody: errorBody.substring(0, 500),  // Truncate
                duration
            });

            if (response.status === 429) {
                log('WARN', 'meta-api', 'Rate limited, will backoff', { requestId, endpoint });
                return { error: 'RATE_LIMITED', retryAfter: parseRetryAfter(response) };
            }
            if (response.status === 190 || errorBody.includes('OAuthException')) {
                log('ERROR', 'meta-api', 'Token invalid/expired', { requestId, endpoint });
                return { error: 'TOKEN_INVALID' };
            }
            return { error: 'API_ERROR', status: response.status, body: errorBody };
        }

        const data = await response.json();

        // VALIDATION: Response structure
        if (!data) {
            log('ERROR', 'meta-api', 'Empty response body', { requestId, endpoint, duration });
            return { error: 'EMPTY_RESPONSE' };
        }

        // VALIDATION: Check for Meta error object in 200 response
        if (data.error) {
            log('ERROR', 'meta-api', 'Meta error in 200 response', {
                requestId,
                endpoint,
                errorCode: data.error.code,
                errorMessage: data.error.message,
                errorType: data.error.type
            });
            return { error: 'META_ERROR', code: data.error.code, message: data.error.message };
        }

        // VALIDATION: Expected data shape
        const records = data.data;
        if (!Array.isArray(records)) {
            log('WARN', 'meta-api', 'Response data is not an array', {
                requestId,
                endpoint,
                dataType: typeof data.data,
                keys: Object.keys(data)
            });
        }

        log('INFO', 'meta-api', 'API call success', {
            requestId,
            endpoint,
            recordCount: Array.isArray(records) ? records.length : 0,
            hasNextPage: !!data.paging?.next,
            duration
        });

        return { data: records, paging: data.paging };

    } catch (err) {
        const duration = Date.now() - startTime;
        log('ERROR', 'meta-api', 'API call failed (network/parse)', {
            requestId,
            endpoint,
            error: err.message,
            code: err.code,       // ECONNREFUSED, ETIMEDOUT, etc.
            duration
        });
        return { error: 'NETWORK_ERROR', message: err.message };
    }
}
```

### Error Categories
| Error | Cause | Auto-Recovery |
|-------|-------|---------------|
| `TOKEN_INVALID` | Expired/revoked token | Mark account, skip, notify |
| `RATE_LIMITED` | Too many calls | Exponential backoff, retry |
| `META_ERROR` | Bad params, permissions | Log, skip entity, continue |
| `NETWORK_ERROR` | Connection issue | Retry 3x with backoff |
| `EMPTY_RESPONSE` | API glitch | Retry once, then skip |

---

## Critical Path 3: Sync Orchestration

### Flow
```
syncAccount → resolveToken → validateToken → fetchCampaigns → fetchAdSets → fetchAds → downloadMedia → fetchInsights → upsert → log
```

### Validation & Logs

```javascript
async function syncAccount(accountId) {
    const syncId = generateId();
    const counters = { campaigns: 0, adsets: 0, ads: 0, snapshots: 0, mediaDownloaded: 0, errors: 0 };
    const startTime = Date.now();

    log('INFO', 'sync', '=== SYNC START ===', { syncId, accountId });

    // Create sync log entry in DB
    const syncLogId = await db('sync_logs').insert({
        ad_account_id: accountId,
        sync_type: 'full',
        status: 'running',
        started_at: new Date()
    }).returning('id');

    try {
        // STEP 1: Resolve token
        const account = await db('ad_accounts').where({ id: accountId }).first();

        if (!account) {
            log('ERROR', 'sync', 'Account not found in DB', { syncId, accountId });
            await updateSyncLog(syncLogId, 'failed', 'Account not found');
            return;
        }

        if (!account.is_active) {
            log('INFO', 'sync', 'Account is inactive, skipping', { syncId, accountId });
            await updateSyncLog(syncLogId, 'skipped', 'Account inactive');
            return;
        }

        const tokenResult = resolveToken(account);
        if (!tokenResult) {
            await updateSyncLog(syncLogId, 'failed', 'No valid token');
            return;
        }

        // STEP 2: Validate token against Meta
        log('INFO', 'sync', 'Validating token', { syncId, accountId, tokenSource: tokenResult.source });
        const validation = await callMetaApi('/me', tokenResult.token);

        if (validation.error) {
            log('ERROR', 'sync', 'Token validation failed', {
                syncId, accountId,
                tokenSource: tokenResult.source,
                error: validation.error
            });
            await db('ad_accounts').where({ id: accountId }).update({ is_active: false });
            await updateSyncLog(syncLogId, 'failed', `Token invalid: ${validation.error}`);
            return;
        }
        log('INFO', 'sync', 'Token valid', { syncId, accountId, metaUser: validation.data?.name });

        // STEP 3: Fetch campaigns
        log('INFO', 'sync', 'Fetching campaigns', { syncId, accountId });
        const campaigns = await fetchAllPages('campaigns', accountId, tokenResult.token);

        if (campaigns.error) {
            log('ERROR', 'sync', 'Failed to fetch campaigns', { syncId, accountId, error: campaigns.error });
            counters.errors++;
        } else {
            log('INFO', 'sync', 'Campaigns fetched', { syncId, accountId, count: campaigns.data.length });

            // VALIDATION: Check for expected fields
            if (campaigns.data.length > 0) {
                const sample = campaigns.data[0];
                const requiredFields = ['id', 'name', 'status', 'objective'];
                const missingFields = requiredFields.filter(f => !(f in sample));
                if (missingFields.length > 0) {
                    log('WARN', 'sync', 'Campaign missing expected fields', {
                        syncId, accountId, missingFields, sampleKeys: Object.keys(sample)
                    });
                }
            }

            // Upsert campaigns
            for (const campaign of campaigns.data) {
                try {
                    await upsertCampaign(campaign, accountId, account.client_id);
                    counters.campaigns++;
                } catch (err) {
                    log('ERROR', 'sync', 'Campaign upsert failed', {
                        syncId, campaignId: campaign.id, error: err.message
                    });
                    counters.errors++;
                }
            }
            log('INFO', 'sync', 'Campaigns upserted', { syncId, accountId, count: counters.campaigns });

            // STEP 4: Fetch ad sets per campaign
            for (const campaign of campaigns.data) {
                const adsets = await fetchAllPages('adsets', campaign.id, tokenResult.token);
                if (adsets.error) {
                    log('WARN', 'sync', 'Failed to fetch adsets for campaign', {
                        syncId, campaignId: campaign.id, error: adsets.error
                    });
                    counters.errors++;
                    continue;  // Don't stop entire sync
                }

                for (const adset of adsets.data) {
                    try {
                        await upsertAdSet(adset, campaign.id);
                        counters.adsets++;
                    } catch (err) {
                        log('ERROR', 'sync', 'AdSet upsert failed', {
                            syncId, adsetId: adset.id, error: err.message
                        });
                        counters.errors++;
                    }

                    // STEP 5: Fetch ads per adset
                    const ads = await fetchAllPages('ads', adset.id, tokenResult.token);
                    if (ads.error) {
                        log('WARN', 'sync', 'Failed to fetch ads for adset', {
                            syncId, adsetId: adset.id, error: ads.error
                        });
                        counters.errors++;
                        continue;
                    }

                    for (const ad of ads.data) {
                        try {
                            await upsertAd(ad, adset.id, campaign.id, account.client_id);
                            counters.ads++;

                            // STEP 6: Download media
                            const mediaResult = await downloadMediaIfNeeded(ad, accountId);
                            if (mediaResult.downloaded) counters.mediaDownloaded++;
                            if (mediaResult.error) {
                                log('WARN', 'sync', 'Media download failed', {
                                    syncId, adId: ad.id, error: mediaResult.error
                                });
                                // Non-blocking: continue sync
                            }
                        } catch (err) {
                            log('ERROR', 'sync', 'Ad upsert failed', {
                                syncId, adId: ad.id, error: err.message
                            });
                            counters.errors++;
                        }
                    }
                }
            }

            // STEP 7: Fetch insights
            log('INFO', 'sync', 'Fetching insights', { syncId, accountId });
            const insightResult = await fetchAndUpsertInsights(accountId, tokenResult.token, syncId);
            counters.snapshots = insightResult.count;
            if (insightResult.errors) counters.errors += insightResult.errors;
            log('INFO', 'sync', 'Insights upserted', { syncId, accountId, count: counters.snapshots });
        }

        // STEP 8: Update account last_synced_at
        await db('ad_accounts').where({ id: accountId }).update({ last_synced_at: new Date() });

        const duration = Date.now() - startTime;
        log('INFO', 'sync', '=== SYNC COMPLETE ===', { syncId, accountId, counters, duration });

        await updateSyncLog(syncLogId, 'completed', null, counters.campaigns + counters.adsets + counters.ads + counters.snapshots);

    } catch (err) {
        const duration = Date.now() - startTime;
        log('ERROR', 'sync', '=== SYNC FAILED (UNHANDLED) ===', {
            syncId, accountId,
            error: err.message,
            stack: err.stack,
            counters,
            duration
        });
        await updateSyncLog(syncLogId, 'failed', err.message);
    }
}
```

### Post-Sync Validation

```javascript
async function validateSyncResults(accountId, syncId) {
    const checks = [];

    // CHECK 1: Do we have campaigns?
    const campaignCount = await db('campaigns').where({ ad_account_id: accountId }).count('* as count').first();
    checks.push({
        check: 'campaigns_exist',
        passed: campaignCount.count > 0,
        value: campaignCount.count
    });

    // CHECK 2: Do all campaigns have a valid status?
    const invalidStatus = await db('campaigns')
        .where({ ad_account_id: accountId })
        .whereNotIn('status', ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'])
        .count('* as count').first();
    checks.push({
        check: 'valid_campaign_statuses',
        passed: invalidStatus.count === 0,
        value: invalidStatus.count
    });

    // CHECK 3: Do ads have creatives?
    const adsWithoutCreative = await db('ads')
        .where({ client_id: accountId })
        .whereNull('image_url')
        .whereNull('video_url')
        .count('* as count').first();
    checks.push({
        check: 'ads_have_creatives',
        passed: true,  // Not a hard fail
        adsWithoutCreative: adsWithoutCreative.count
    });

    // CHECK 4: Performance snapshots for recent dates?
    const recentSnapshots = await db('performance_snapshots')
        .where({ ad_account_id: accountId })
        .where('date', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .count('* as count').first();
    checks.push({
        check: 'recent_snapshots_exist',
        passed: recentSnapshots.count > 0,
        value: recentSnapshots.count
    });

    // CHECK 5: No orphaned ads (ads without campaigns)
    const orphanedAds = await db('ads')
        .leftJoin('campaigns', 'ads.campaign_id', 'campaigns.id')
        .whereNull('campaigns.id')
        .where('ads.client_id', accountId)
        .count('* as count').first();
    checks.push({
        check: 'no_orphaned_ads',
        passed: orphanedAds.count === 0,
        value: orphanedAds.count
    });

    const allPassed = checks.every(c => c.passed);
    log(allPassed ? 'INFO' : 'WARN', 'sync', 'Post-sync validation', {
        syncId, accountId, allPassed, checks
    });

    return { allPassed, checks };
}
```

---

## Critical Path 4: Database Upserts

### Validation & Logs

```javascript
async function upsertCampaign(metaData, adAccountId, clientId) {
    // VALIDATION: Required fields
    if (!metaData.id) {
        throw new Error(`Campaign missing id: ${JSON.stringify(metaData).substring(0, 200)}`);
    }

    // Map Meta fields to our schema
    const record = {
        id: metaData.id,
        ad_account_id: adAccountId,
        client_id: clientId,
        name: metaData.name || 'Unnamed Campaign',
        objective: metaData.objective || null,
        status: metaData.status || 'UNKNOWN',
        buying_type: metaData.buying_type || null,
        daily_budget: metaData.daily_budget ? parseInt(metaData.daily_budget) : null,
        lifetime_budget: metaData.lifetime_budget ? parseInt(metaData.lifetime_budget) : null,
        start_date: metaData.start_time ? new Date(metaData.start_time) : null,
        end_date: metaData.stop_time ? new Date(metaData.stop_time) : null,
        updated_at: new Date()
    };

    // VALIDATION: Sanity checks
    if (record.daily_budget && record.daily_budget < 0) {
        log('WARN', 'sync', 'Negative budget detected', { campaignId: record.id, daily_budget: record.daily_budget });
    }
    if (record.start_date && record.end_date && record.start_date > record.end_date) {
        log('WARN', 'sync', 'Start date after end date', { campaignId: record.id });
    }

    // Upsert with conflict handling
    const result = await db('campaigns')
        .insert(record)
        .onConflict('id')
        .merge()
        .returning('id');

    log('DEBUG', 'sync', 'Campaign upserted', {
        campaignId: record.id,
        status: record.status,
        isNew: result.length > 0
    });

    return result;
}
```

### Snapshot Upsert with Validation

```javascript
async function upsertSnapshot(data) {
    // VALIDATION: Required fields
    if (!data.date || !data.ad_id || !data.level) {
        log('ERROR', 'sync', 'Snapshot missing required fields', {
            hasDate: !!data.date,
            hasAdId: !!data.ad_id,
            hasLevel: !!data.level
        });
        throw new Error('Snapshot missing date, ad_id, or level');
    }

    // VALIDATION: Numeric sanity
    const numericChecks = {
        impressions: data.impressions >= 0,
        clicks: data.clicks >= 0,
        spend: data.spend >= 0,
        ctr: data.ctr >= 0 && data.ctr <= 100,
        cpc: data.cpc >= 0
    };

    const failedChecks = Object.entries(numericChecks).filter(([, valid]) => !valid);
    if (failedChecks.length > 0) {
        log('WARN', 'sync', 'Snapshot has suspicious metric values', {
            adId: data.ad_id,
            date: data.date,
            failedChecks: failedChecks.map(([field]) => field),
            values: failedChecks.reduce((acc, [field]) => ({ ...acc, [field]: data[field] }), {})
        });
    }

    // VALIDATION: Clicks should not exceed impressions
    if (data.clicks > data.impressions && data.impressions > 0) {
        log('WARN', 'sync', 'Clicks exceed impressions', {
            adId: data.ad_id, date: data.date,
            clicks: data.clicks, impressions: data.impressions
        });
    }

    await db('performance_snapshots')
        .insert(data)
        .onConflict(['date', 'ad_id', 'level'])
        .merge();
}
```

---

## Critical Path 5: Query API

### Raw SQL Validation

```javascript
async function executeRawQuery(sql, params, limit, offset, userId) {
    const queryId = generateId();

    log('INFO', 'query', 'Raw query requested', {
        queryId,
        userId,
        sqlLength: sql.length,
        sqlPreview: sql.substring(0, 200)
    });

    // VALIDATION 1: Must be SELECT
    const normalized = sql.trim().toUpperCase();
    if (!normalized.startsWith('SELECT')) {
        log('WARN', 'query', 'Non-SELECT query blocked', { queryId, userId, firstWord: normalized.split(' ')[0] });
        throw new Error('Only SELECT queries are allowed');
    }

    // VALIDATION 2: Block dangerous keywords
    const blocked = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE', 'COPY', 'EXECUTE', 'DO '];
    const foundBlocked = blocked.filter(kw => normalized.includes(kw));
    if (foundBlocked.length > 0) {
        log('WARN', 'query', 'Blocked SQL keywords detected', { queryId, userId, blockedKeywords: foundBlocked });
        throw new Error(`Blocked SQL keywords: ${foundBlocked.join(', ')}`);
    }

    // VALIDATION 3: Block system tables
    const systemTables = ['pg_', 'information_schema'];
    const accessesSystem = systemTables.some(t => normalized.includes(t.toUpperCase()));
    if (accessesSystem) {
        log('WARN', 'query', 'System table access blocked', { queryId, userId });
        throw new Error('Access to system tables is not allowed');
    }

    // VALIDATION 4: Block multiple statements (;)
    const statementCount = sql.split(';').filter(s => s.trim()).length;
    if (statementCount > 1) {
        log('WARN', 'query', 'Multiple statements blocked', { queryId, userId, statementCount });
        throw new Error('Only single statements are allowed');
    }

    // Execute in read-only transaction with timeout
    const startTime = Date.now();
    try {
        const result = await db.raw(`
            SET LOCAL statement_timeout = '10s';
            SET TRANSACTION READ ONLY;
            ${sql}
            LIMIT ${Math.min(limit || 100, 10000)}
            OFFSET ${offset || 0}
        `, params);

        const duration = Date.now() - startTime;

        log('INFO', 'query', 'Raw query executed', {
            queryId,
            userId,
            rowCount: result.rows?.length || 0,
            duration,
            columnCount: result.fields?.length || 0
        });

        // VALIDATION 5: Warn on slow queries
        if (duration > 5000) {
            log('WARN', 'query', 'Slow query detected', { queryId, userId, duration, sqlPreview: sql.substring(0, 200) });
        }

        return {
            rows: result.rows,
            rowCount: result.rows?.length,
            columns: result.fields?.map(f => ({ name: f.name, type: f.dataTypeID })),
            duration
        };

    } catch (err) {
        const duration = Date.now() - startTime;
        log('ERROR', 'query', 'Raw query failed', {
            queryId, userId, duration,
            error: err.message,
            sqlPreview: sql.substring(0, 200)
        });
        throw err;
    }
}
```

### Query Builder Validation

```javascript
async function executeBuilderQuery(spec, userId) {
    const queryId = generateId();

    log('INFO', 'query', 'Builder query requested', {
        queryId, userId,
        entity: spec.entity,
        joins: spec.joins,
        filterCount: Object.keys(spec.filters || {}).length
    });

    // VALIDATION 1: Entity must be whitelisted
    const ALLOWED_ENTITIES = ['clients', 'campaigns', 'adsets', 'ads', 'performance_snapshots', 'industries', 'ad_accounts'];
    if (!ALLOWED_ENTITIES.includes(spec.entity)) {
        log('WARN', 'query', 'Blocked entity', { queryId, userId, entity: spec.entity });
        throw new Error(`Entity "${spec.entity}" is not queryable`);
    }

    // VALIDATION 2: Joins must be whitelisted
    const ALLOWED_JOINS = {
        clients: ['industries', 'ad_accounts', 'campaigns', 'ads'],
        campaigns: ['ad_accounts', 'clients', 'adsets', 'performance_snapshots'],
        adsets: ['campaigns', 'ads'],
        ads: ['adsets', 'campaigns', 'clients', 'performance_snapshots'],
        performance_snapshots: ['campaigns', 'ads', 'ad_accounts'],
        industries: ['clients'],
        ad_accounts: ['clients', 'campaigns']
    };

    for (const join of (spec.joins || [])) {
        if (!ALLOWED_JOINS[spec.entity]?.includes(join)) {
            log('WARN', 'query', 'Blocked join', { queryId, userId, entity: spec.entity, join });
            throw new Error(`Join "${join}" is not allowed from "${spec.entity}"`);
        }
    }

    // VALIDATION 3: Aggregation functions whitelist
    const ALLOWED_AGGREGATES = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'];
    for (const field of (spec.fields || [])) {
        const match = field.match(/^(\w+)\s*\(/);
        if (match && !ALLOWED_AGGREGATES.includes(match[1].toUpperCase())) {
            log('WARN', 'query', 'Blocked aggregation', { queryId, userId, function: match[1] });
            throw new Error(`Aggregation "${match[1]}" is not allowed`);
        }
    }

    // VALIDATION 4: Filter operators whitelist
    const ALLOWED_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'like', 'between'];
    for (const [field, condition] of Object.entries(spec.filters || {})) {
        if (typeof condition === 'object' && condition !== null) {
            for (const op of Object.keys(condition)) {
                if (!ALLOWED_OPERATORS.includes(op)) {
                    log('WARN', 'query', 'Blocked filter operator', { queryId, userId, field, operator: op });
                    throw new Error(`Filter operator "${op}" is not allowed`);
                }
            }
        }
    }

    // VALIDATION 5: Limit cap
    const limit = Math.min(spec.limit || 100, 10000);

    // Build and execute
    const startTime = Date.now();
    try {
        const knexQuery = buildKnexQuery(spec, limit);  // Constructs the Knex chain
        const result = await knexQuery;
        const duration = Date.now() - startTime;

        log('INFO', 'query', 'Builder query executed', {
            queryId, userId,
            rowCount: result.length,
            duration
        });

        if (duration > 5000) {
            log('WARN', 'query', 'Slow builder query', { queryId, userId, duration, spec });
        }

        return { rows: result, rowCount: result.length, duration };

    } catch (err) {
        const duration = Date.now() - startTime;
        log('ERROR', 'query', 'Builder query failed', {
            queryId, userId, duration,
            error: err.message,
            spec
        });
        throw err;
    }
}
```

---

## Critical Path 6: Auth & API Key Validation

```javascript
// middlewares/auth.middleware.js

async function authMiddleware(req, res, next) {
    const requestId = req.headers['x-request-id'] || generateId();
    req.requestId = requestId;

    // Try JWT first
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // VALIDATION: Check user still exists
            const user = await db('users').where({ id: decoded.userId }).first();
            if (!user) {
                log('WARN', 'auth', 'JWT valid but user not found', { requestId, userId: decoded.userId });
                return res.status(401).json({ error: 'User not found' });
            }

            req.user = { id: user.id, email: user.email, role: user.role };
            log('DEBUG', 'auth', 'JWT auth success', { requestId, userId: user.id, role: user.role });
            return next();
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                log('DEBUG', 'auth', 'JWT expired', { requestId });
                return res.status(401).json({ error: 'Token expired' });
            }
            log('WARN', 'auth', 'JWT verification failed', { requestId, error: err.message });
            return res.status(401).json({ error: 'Invalid token' });
        }
    }

    // Try API Key
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        const keyHash = hashApiKey(apiKey);
        const keyRecord = await db('api_keys').where({ key_hash: keyHash }).first();

        if (!keyRecord) {
            log('WARN', 'auth', 'Invalid API key', { requestId, keyPrefix: apiKey.substring(0, 8) });
            return res.status(401).json({ error: 'Invalid API key' });
        }

        // VALIDATION: Check expiry
        if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
            log('WARN', 'auth', 'Expired API key', { requestId, keyId: keyRecord.id });
            return res.status(401).json({ error: 'API key expired' });
        }

        // Update last_used
        await db('api_keys').where({ id: keyRecord.id }).update({ last_used: new Date() });

        const user = await db('users').where({ id: keyRecord.user_id }).first();
        req.user = { id: user.id, email: user.email, role: 'api_key', permissions: keyRecord.permissions };
        log('DEBUG', 'auth', 'API key auth success', { requestId, keyId: keyRecord.id, userId: user.id });
        return next();
    }

    log('DEBUG', 'auth', 'No auth provided', { requestId, path: req.path });
    return res.status(401).json({ error: 'Authentication required' });
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            log('WARN', 'auth', 'Insufficient role', {
                requestId: req.requestId,
                userId: req.user.id,
                userRole: req.user.role,
                requiredRoles: roles,
                path: req.path
            });
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}
```

---

## Critical Path 7: Media Download

```javascript
async function downloadMediaIfNeeded(ad, adAccountId) {
    if (!ad.image_url && !ad.thumbnail_url) {
        return { downloaded: false, reason: 'no_url' };
    }

    const imageUrl = ad.image_url || ad.thumbnail_url;
    const dir = `data/media/images/${adAccountId}`;
    const originalPath = `${dir}/${ad.id}_original.jpg`;
    const thumbPath = `${dir}/${ad.id}_thumb.jpg`;

    // VALIDATION: Already downloaded?
    if (fs.existsSync(originalPath)) {
        log('DEBUG', 'media', 'Already downloaded, skipping', { adId: ad.id });
        return { downloaded: false, reason: 'already_exists' };
    }

    try {
        // Ensure directory
        await fs.promises.mkdir(dir, { recursive: true });

        // Download
        log('DEBUG', 'media', 'Downloading image', { adId: ad.id, url: imageUrl.substring(0, 100) });
        const response = await fetch(imageUrl);

        // VALIDATION: Check response
        if (!response.ok) {
            log('WARN', 'media', 'Download failed', {
                adId: ad.id, status: response.status
            });
            return { downloaded: false, error: `HTTP ${response.status}` };
        }

        // VALIDATION: Check content type
        const contentType = response.headers.get('content-type');
        if (!contentType?.startsWith('image/')) {
            log('WARN', 'media', 'Unexpected content type', {
                adId: ad.id, contentType
            });
            // Still save it, might be valid
        }

        // VALIDATION: Check file size (skip if > 50MB)
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
            log('WARN', 'media', 'File too large, skipping', {
                adId: ad.id, size: contentLength
            });
            return { downloaded: false, error: 'file_too_large' };
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // VALIDATION: Check buffer is not empty
        if (buffer.length === 0) {
            log('WARN', 'media', 'Empty file downloaded', { adId: ad.id });
            return { downloaded: false, error: 'empty_file' };
        }

        // Save original
        await fs.promises.writeFile(originalPath, buffer);

        // Generate thumbnail
        try {
            await sharp(buffer).resize(300).jpeg({ quality: 80 }).toFile(thumbPath);
        } catch (sharpErr) {
            log('WARN', 'media', 'Thumbnail generation failed', {
                adId: ad.id, error: sharpErr.message
            });
            // Non-blocking: we still have the original
        }

        // Update DB
        await db('ads').where({ id: ad.id }).update({
            local_image: originalPath,
            updated_at: new Date()
        });

        log('INFO', 'media', 'Image downloaded', {
            adId: ad.id,
            size: buffer.length,
            path: originalPath
        });

        return { downloaded: true };

    } catch (err) {
        log('ERROR', 'media', 'Download error', {
            adId: ad.id, error: err.message
        });
        return { downloaded: false, error: err.message };
    }
}
```

---

## Health Check Endpoint

A single endpoint that validates all critical systems:

```javascript
// GET /api/v1/health

async function healthCheck(req, res) {
    const checks = {};
    const startTime = Date.now();

    // CHECK 1: Database connection
    try {
        await db.raw('SELECT 1');
        checks.database = { status: 'ok' };
    } catch (err) {
        checks.database = { status: 'error', message: err.message };
    }

    // CHECK 2: Table existence
    try {
        const tables = await db.raw(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
        `);
        const tableNames = tables.rows.map(r => r.table_name);
        const required = ['industries', 'clients', 'ad_accounts', 'campaigns', 'adsets', 'ads', 'performance_snapshots', 'users', 'sync_logs'];
        const missing = required.filter(t => !tableNames.includes(t));
        checks.tables = {
            status: missing.length === 0 ? 'ok' : 'error',
            found: tableNames.length,
            missing
        };
    } catch (err) {
        checks.tables = { status: 'error', message: err.message };
    }

    // CHECK 3: Fireberry API connectivity
    try {
        const fbResponse = await fetch(`${process.env.FIREBERRY_API_URL}/query`, {
            method: 'POST',
            headers: { 'tokenid': process.env.FIREBERRY_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ objecttype: 1, page_size: 1, fields: 'accountid', query: '' })
        });
        const fbData = await fbResponse.json();
        checks.fireberry = {
            status: fbData.success ? 'ok' : 'error',
            error: fbData.success ? undefined : fbData.error_details
        };
    } catch (err) {
        checks.fireberry = { status: 'error', message: err.message };
    }

    // CHECK 4: Meta Business Token (if configured)
    if (process.env.META_BUSINESS_TOKEN) {
        try {
            const response = await fetch(
                `https://graph.facebook.com/${process.env.META_API_VERSION || 'v21.0'}/me?access_token=${process.env.META_BUSINESS_TOKEN}`
            );
            const data = await response.json();
            checks.metaToken = {
                status: data.error ? 'error' : 'ok',
                error: data.error?.message
            };
        } catch (err) {
            checks.metaToken = { status: 'error', message: err.message };
        }
    } else {
        checks.metaToken = { status: 'not_configured' };
    }

    // CHECK 4: Media directory writable
    try {
        const testFile = 'data/media/.healthcheck';
        await fs.promises.writeFile(testFile, 'ok');
        await fs.promises.unlink(testFile);
        checks.mediaStorage = { status: 'ok' };
    } catch (err) {
        checks.mediaStorage = { status: 'error', message: err.message };
    }

    // CHECK 5: Data stats
    try {
        const stats = await db.raw(`
            SELECT
                (SELECT COUNT(*) FROM clients) as clients,
                (SELECT COUNT(*) FROM ad_accounts WHERE is_active = true) as active_accounts,
                (SELECT COUNT(*) FROM campaigns) as campaigns,
                (SELECT COUNT(*) FROM ads) as ads,
                (SELECT COUNT(*) FROM performance_snapshots) as snapshots,
                (SELECT MAX(completed_at) FROM sync_logs WHERE status = 'completed') as last_sync
        `);
        checks.data = { status: 'ok', ...stats.rows[0] };
    } catch (err) {
        checks.data = { status: 'error', message: err.message };
    }

    // CHECK 6: Active account token status
    try {
        const tokenStats = await db.raw(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE access_token IS NOT NULL AND (token_expires IS NULL OR token_expires > NOW())) as valid_tokens,
                COUNT(*) FILTER (WHERE access_token IS NOT NULL AND token_expires < NOW()) as expired_tokens,
                COUNT(*) FILTER (WHERE access_token IS NULL AND use_business_token = true) as using_business_token,
                COUNT(*) FILTER (WHERE access_token IS NULL AND use_business_token = false) as no_token
            FROM ad_accounts WHERE is_active = true
        `);
        checks.tokens = { status: 'ok', ...tokenStats.rows[0] };
    } catch (err) {
        checks.tokens = { status: 'error', message: err.message };
    }

    const allOk = Object.values(checks).every(c => c.status === 'ok' || c.status === 'not_configured');
    const duration = Date.now() - startTime;

    log('INFO', 'health', 'Health check', { allOk, duration, checks });

    res.status(allOk ? 200 : 503).json({
        status: allOk ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        duration,
        checks
    });
}
```

---

## Request Logging Middleware

Every API request is logged for traceability:

```javascript
function requestLogger(req, res, next) {
    const requestId = generateId();
    req.requestId = requestId;
    const startTime = Date.now();

    // Log request
    log('INFO', 'http', 'Request', {
        requestId,
        method: req.method,
        path: req.path,
        query: Object.keys(req.query),
        userId: req.user?.id,
        ip: req.ip
    });

    // Log response on finish
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
        log(level, 'http', 'Response', {
            requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration,
            userId: req.user?.id
        });
    });

    next();
}
```

---

## Log Levels by Environment

| Level | Development | Production |
|-------|-------------|------------|
| ERROR | Always | Always |
| WARN | Always | Always |
| INFO | Always | Always |
| DEBUG | Always | Off (set `LOG_LEVEL=info` in .env) |

---

---

## Critical Path 8: Fireberry Sync

### Client Sync Flow

```javascript
async function syncClientsFromFireberry() {
    const syncId = generateId();
    log('INFO', 'fireberry', '=== CLIENT SYNC START ===', { syncId });

    try {
        // STEP 1: Query Fireberry ObjectType 1
        log('INFO', 'fireberry', 'Querying ObjectType 1 (Customers)', { syncId });
        const response = await queryFireberry({
            objecttype: 1,
            page_size: 500,
            fields: 'accountid,accountname,pcfsystemfield1475,telephone1,pcfsystemfield1445,websiteurl,pcfsystemfield114,statuscode,pcfsystemfield1441name',
            query: '(statuscode = 1)'  // Active customers only
        });

        // VALIDATION: API response
        if (!response.success) {
            log('ERROR', 'fireberry', 'API query failed', { syncId, error: response.error_details });
            return { error: 'FIREBERRY_API_ERROR' };
        }

        const records = response.data?.Data || [];
        log('INFO', 'fireberry', 'Customers fetched', { syncId, count: records.length });

        // VALIDATION: Records have required fields
        if (records.length > 0) {
            const sample = records[0];
            if (!sample.accountid) {
                log('ERROR', 'fireberry', 'Records missing accountid', { syncId, sampleKeys: Object.keys(sample) });
                return { error: 'MISSING_ACCOUNTID' };
            }
        }

        // STEP 2: Map and upsert
        let created = 0, updated = 0, errors = 0;
        for (const record of records) {
            try {
                const mapped = {
                    fireberry_account_id: record.accountid,
                    client_name: record.accountname || 'Unnamed',
                    brand_name: record.pcfsystemfield1475 || null,
                    contact_phone: normalizePhone(record.telephone1),
                    logo_url: record.pcfsystemfield1445 || null,
                    website_url: record.websiteurl || null,
                    drive_url: record.pcfsystemfield114 || null,
                    account_manager: record.pcfsystemfield1441name || null,
                    fireberry_status: String(record.statuscode),
                    updated_at: new Date()
                };

                // VALIDATION: Phone format
                if (mapped.contact_phone && !/^\d{9,12}$/.test(mapped.contact_phone.replace(/\D/g, ''))) {
                    log('WARN', 'fireberry', 'Unusual phone format', {
                        syncId, accountId: record.accountid, phone: mapped.contact_phone
                    });
                }

                const existing = await db('clients')
                    .where({ fireberry_account_id: record.accountid }).first();

                if (existing) {
                    await db('clients').where({ id: existing.id }).update(mapped);
                    updated++;
                } else {
                    mapped.created_at = new Date();
                    await db('clients').insert(mapped);
                    created++;
                }
            } catch (err) {
                log('ERROR', 'fireberry', 'Client upsert failed', {
                    syncId, accountId: record.accountid, error: err.message
                });
                errors++;
            }
        }

        log('INFO', 'fireberry', '=== CLIENT SYNC COMPLETE ===', {
            syncId, total: records.length, created, updated, errors
        });

        return { total: records.length, created, updated, errors };

    } catch (err) {
        log('ERROR', 'fireberry', '=== CLIENT SYNC FAILED ===', {
            syncId, error: err.message, stack: err.stack
        });
        return { error: err.message };
    }
}
```

### Token Sync Flow

```javascript
async function syncTokensFromFireberry() {
    const syncId = generateId();
    log('INFO', 'fireberry', '=== TOKEN SYNC START ===', { syncId });

    try {
        // STEP 1: Query ObjectType 1013 for records with FB tokens
        const response = await queryFireberry({
            objecttype: 1013,
            page_size: 500,
            fields: 'customobject1013id,pcfsystemfield100,pcfsystemfield104,pcfsystemfield110,pcfsystemfield106',
            query: '(pcfsystemfield100 != \'\')'  // Only records with FB token
        });

        if (!response.success) {
            log('ERROR', 'fireberry', 'Token query failed', { syncId, error: response.error_details });
            return { error: 'FIREBERRY_API_ERROR' };
        }

        const records = response.data?.Data || [];
        log('INFO', 'fireberry', 'Token records fetched', { syncId, count: records.length });

        let tokensUpdated = 0, tokensSkipped = 0, errors = 0;

        for (const record of records) {
            try {
                const fbToken = record.pcfsystemfield100;
                const pageId = record.pcfsystemfield104;
                const phone = normalizePhone(record.pcfsystemfield110);
                const customerLink = record.pcfsystemfield106;
                const fireberryRecordId = record.customobject1013id;

                // VALIDATION: Token is non-empty
                if (!fbToken || fbToken.trim().length < 10) {
                    log('WARN', 'fireberry', 'Token too short, skipping', {
                        syncId, recordId: fireberryRecordId, tokenLength: fbToken?.length
                    });
                    tokensSkipped++;
                    continue;
                }

                // Find matching client by customer link or phone
                let client = null;
                if (customerLink) {
                    client = await db('clients').where({ fireberry_account_id: customerLink }).first();
                }
                if (!client && phone) {
                    client = await db('clients').where({ contact_phone: phone }).first();
                }

                if (!client) {
                    log('WARN', 'fireberry', 'No matching client for token', {
                        syncId, recordId: fireberryRecordId, phone, customerLink
                    });
                    tokensSkipped++;
                    continue;
                }

                // Update ad_accounts with this token
                const existingAccounts = await db('ad_accounts').where({ client_id: client.id });

                if (existingAccounts.length > 0) {
                    // Update existing accounts
                    await db('ad_accounts').where({ client_id: client.id }).update({
                        access_token: fbToken,
                        page_id: pageId,
                        fireberry_record_id: fireberryRecordId,
                        token_source: 'fireberry',
                        last_token_sync: new Date()
                    });
                    tokensUpdated += existingAccounts.length;
                } else {
                    log('DEBUG', 'fireberry', 'Client has no ad accounts yet, token stored for later', {
                        syncId, clientId: client.id
                    });
                    tokensSkipped++;
                }

                log('DEBUG', 'fireberry', 'Token synced', {
                    syncId, clientId: client.id, pageId,
                    tokenPrefix: fbToken.substring(0, 10) + '...',
                    accountsUpdated: existingAccounts.length
                });

            } catch (err) {
                log('ERROR', 'fireberry', 'Token sync record failed', {
                    syncId, recordId: record.customobject1013id, error: err.message
                });
                errors++;
            }
        }

        log('INFO', 'fireberry', '=== TOKEN SYNC COMPLETE ===', {
            syncId, total: records.length, tokensUpdated, tokensSkipped, errors
        });

        return { total: records.length, tokensUpdated, tokensSkipped, errors };

    } catch (err) {
        log('ERROR', 'fireberry', '=== TOKEN SYNC FAILED ===', {
            syncId, error: err.message
        });
        return { error: err.message };
    }
}
```

### Fireberry API Call Wrapper

```javascript
async function queryFireberry({ objecttype, page_size, fields, query }) {
    const requestId = generateId();
    const startTime = Date.now();

    log('DEBUG', 'fireberry', 'API call', {
        requestId, objecttype, page_size, query: query?.substring(0, 100)
    });

    // VALIDATION: Token exists
    if (!process.env.FIREBERRY_TOKEN) {
        log('ERROR', 'fireberry', 'FIREBERRY_TOKEN not set', { requestId });
        return { success: false, error_details: 'Missing FIREBERRY_TOKEN' };
    }

    try {
        const response = await fetch(`${process.env.FIREBERRY_API_URL}/query`, {
            method: 'POST',
            headers: {
                'tokenid': process.env.FIREBERRY_TOKEN,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ objecttype, page_size, page_number: 1, fields, query })
        });

        const duration = Date.now() - startTime;

        // VALIDATION: HTTP status
        if (!response.ok) {
            log('ERROR', 'fireberry', 'HTTP error', {
                requestId, status: response.status, duration
            });
            return { success: false, error_details: `HTTP ${response.status}` };
        }

        const data = await response.json();

        // VALIDATION: Fireberry success flag
        if (!data.success) {
            log('ERROR', 'fireberry', 'API error response', {
                requestId, objecttype, error_details: data.error_details, duration
            });
            return data;
        }

        // VALIDATION: Data structure
        const records = data.data?.Data;
        if (!Array.isArray(records)) {
            log('WARN', 'fireberry', 'Unexpected response structure', {
                requestId, objecttype, dataKeys: Object.keys(data.data || {}), duration
            });
        }

        log('INFO', 'fireberry', 'API call success', {
            requestId, objecttype, recordCount: records?.length || 0, duration
        });

        return data;

    } catch (err) {
        const duration = Date.now() - startTime;
        log('ERROR', 'fireberry', 'API call failed', {
            requestId, objecttype, error: err.message, code: err.code, duration
        });
        return { success: false, error_details: err.message };
    }
}
```

### Fireberry Validations

| Check | When | Action on Fail |
|-------|------|----------------|
| `FIREBERRY_TOKEN` env exists | Before any API call | Log ERROR, skip sync |
| `response.success === true` | After every API call | Log error_details, return error |
| `Data` array exists in response | After query | Log WARN, treat as empty |
| `accountid` exists in customer records | Before mapping | Log ERROR, abort sync |
| Phone normalizes to valid format | During field mapping | Log WARN, still store |
| FB token length > 10 chars | Before storing token | Log WARN, skip record |
| Client match found for token | During token sync | Log WARN, skip (no orphan tokens) |
| No duplicate `fireberry_account_id` | During upsert | ON CONFLICT handles it |

---

## Summary: What Gets Validated Where

| Critical Path | Validations |
|---------------|-------------|
| **Fireberry Sync** | FIREBERRY_TOKEN set → API success → response structure → accountid exists → phone format → field mapping → upsert conflict handling |
| **Fireberry Token Sync** | Token non-empty → token length > 10 → client match (by link or phone) → ad account exists → update token source |
| **Token Resolution** | Fireberry token exists → not expired → fallback to business token → Meta /me validation |
| **Meta API Calls** | HTTP status → rate limit headers → response shape → error objects in 200s → network errors |
| **Sync Flow** | Fireberry sync first → account exists → account active → token resolved → token validated → field presence → upsert success → post-sync integrity |
| **DB Upserts** | Required fields present → numeric sanity (no negatives, clicks ≤ impressions) → conflict handling → foreign keys |
| **Query API (Raw)** | SELECT only → no blocked keywords → no system tables → single statement → timeout → row limit → slow query warning |
| **Query API (Builder)** | Entity whitelist → join whitelist → aggregation whitelist → operator whitelist → limit cap |
| **Auth** | JWT signature → JWT expiry → user exists → role check → API key hash → API key expiry |
| **Media Download** | URL exists → not already downloaded → HTTP response ok → content type → file size → non-empty buffer → thumbnail generation |
| **Health Check** | DB connection → tables exist → Fireberry API reachable → Meta token valid → media dir writable → data stats → token status |
