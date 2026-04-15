# Ads Management Platform — Master Control File

> **This is the single source of truth.** Every implementation decision, task execution, and code written must conform to this file. Before starting any task, read the relevant section. Before completing any task, verify against the rules here.

---

## How This File Works

This master file connects three documents into one execution framework:

| Document | Purpose | When to Read |
|----------|---------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | **What** to build — tech stack, schema, API contracts, project structure | Before writing any code |
| [TASKS.md](TASKS.md) | **When** to build — ordered task list with checkboxes | Before starting any task |
| [LOGGING.md](LOGGING.md) | **How** to validate — logging patterns, validation checks, error handling | While writing every function |

**Rule: No code is written without consulting all three.**

---

## Execution Rules

### Rule 1: Task Order is Law

Tasks in [TASKS.md](TASKS.md) are ordered by dependency. Never skip ahead. The order exists because:

```
Infrastructure (1-2)   → you can't build without a running environment
Database (3-4)         → you can't write services without tables
Auth (5)               → you can't protect routes without auth
CRUD (6-7)             → you can't sync without clients/industries
Fireberry (8)          → you can't get tokens without Fireberry sync
Ad Accounts (9)        → you can't call Meta without tokens + accounts
Meta API (10)          → you can't sync without API calls
Sync (11)              → you can't have data without sync
Media (12)             → depends on sync pulling ad data
Read endpoints (13)    → depends on data existing
Dashboard (14)         → depends on read endpoints + snapshots
Gallery (15)           → depends on ads + media
Query API (16)         → depends on all tables populated
Cron (17)              → depends on sync + fireberry services
Cache (18)             → depends on endpoints to cache
KPI (19)               → depends on sync pipeline
Frontend (20-30)       → depends on all backend endpoints
Testing (31)           → depends on everything
```

**Critical: Fireberry runs BEFORE Meta sync.** Fireberry provides the tokens and client data that Meta sync depends on. The execution order is always: Fireberry sync → Token resolution → Meta API calls.

### Rule 2: Every Function Follows the Logging Pattern

Before writing ANY service function, check [LOGGING.md](LOGGING.md) for its critical path. Every function must:

1. **Log entry** — what is starting, with identifying data
2. **Validate inputs** — check required fields, types, ranges
3. **Log each step** — what succeeded, what was skipped
4. **Log exit** — result summary with duration
5. **Log errors** — with full context (what failed, why, what data was involved)

```javascript
// EVERY service function follows this skeleton:
async function doSomething(params) {
    const id = generateId();
    log('INFO', 'context', 'Starting', { id, ...keyParams });

    // Validate
    if (!requiredField) {
        log('ERROR', 'context', 'Missing required field', { id, field: 'name' });
        throw new Error('Missing required field: name');
    }

    const startTime = Date.now();
    try {
        // ... work ...

        const duration = Date.now() - startTime;
        log('INFO', 'context', 'Completed', { id, duration, resultSummary });
        return result;
    } catch (err) {
        const duration = Date.now() - startTime;
        log('ERROR', 'context', 'Failed', { id, duration, error: err.message });
        throw err;
    }
}
```

### Rule 3: Architecture Is the Contract

[ARCHITECTURE.md](ARCHITECTURE.md) defines:
- **Table schemas** — column names, types, constraints are exact. Do not deviate.
- **API endpoints** — routes, methods, query params are exact. Do not invent new ones.
- **Project structure** — file paths are exact. Do not reorganize.
- **Tech choices** — libraries are decided. Do not substitute.

If you need to change the architecture, **update ARCHITECTURE.md first**, then implement.

### Rule 4: Validate Before Moving On

After completing each task group, run validation before starting the next:

| After Task Group | Validation |
|------------------|-----------|
| **1. Infrastructure** | `docker compose up` → all 3 services healthy, ports accessible |
| **2. Backend Core** | `GET /api/v1/health` returns 200 |
| **3. Migrations** | `npx knex migrate:latest` succeeds, all 11 tables exist in Postgres |
| **4. Seeds** | Industries seeded (10 rows), admin user exists and can be queried |
| **5. Auth** | Login returns JWT, JWT protects routes, invalid JWT returns 401, role check returns 403 |
| **6. Industries** | Full CRUD works, delete blocked when clients exist |
| **7. Clients** | Full CRUD works, industry join returns industry name, `fireberry_account_id` populated |
| **8. Fireberry** | `POST /fireberry/sync-clients` pulls from ObjectType 1, clients appear in DB. `POST /fireberry/sync-tokens` pulls tokens from ObjectType 1013, tokens appear in `ad_accounts` |
| **9. Ad Accounts** | Discover returns accounts from Meta, import stores in DB, token from Fireberry validates against Meta |
| **10. Meta API** | `fetchCampaigns` returns data using Fireberry-sourced token, pagination works, 429 triggers backoff |
| **11. Sync** | Full sync: Fireberry sync → token resolution → Meta API → campaigns + adsets + ads + snapshots in DB |
| **12. Media** | Images downloaded to `/data/media/`, thumbnails generated, `GET /media/...` serves them |
| **13. Read Endpoints** | All GET endpoints return correct data with filters and pagination |
| **14. Dashboard** | Overview KPIs match manual SQL aggregation of snapshots table |
| **15. Gallery** | Returns ads with media URLs, filters work, KPI sort works |
| **16. Query API** | Raw SQL (admin only), builder (all roles), blocked keywords rejected, timeout works |
| **17. Cron** | All jobs registered (Fireberry + Meta syncs + token check), manual triggers work |
| **18. Cache** | Cached response faster than uncached, invalidation works after sync |
| **19. KPI** | Derived metrics (CTR, CPC, etc.) match manual calculation |
| **20-30. Frontend** | Each page loads, API calls succeed, filters work, Fireberry status visible |
| **31. Testing** | All integration tests pass (including Fireberry → Meta full flow) |

### Rule 5: Error Handling Is Not Optional

Every error must be:
1. **Categorized** — TOKEN_INVALID, RATE_LIMITED, META_ERROR, NETWORK_ERROR, VALIDATION_ERROR, DB_ERROR
2. **Logged** — with context (what was being done, what data was involved)
3. **Non-blocking where possible** — one failed ad doesn't stop the entire sync
4. **Surfaced** — errors appear in sync_logs, health check, or API responses

```
ERROR categories and recovery:
TOKEN_INVALID    → mark account inactive, skip, log
RATE_LIMITED     → exponential backoff, retry
META_ERROR       → log with Meta error code, skip entity, continue
NETWORK_ERROR    → retry 3x with backoff, then fail
VALIDATION_ERROR → log with field details, skip record
DB_ERROR         → log with query details, throw
```

---

## Implementation Checkpoints

These are mandatory pause points. At each checkpoint, everything before it must work end-to-end before proceeding.

### Checkpoint 1: Foundation (After Tasks 1-4)
```
Verify:
□ docker compose up → postgres, backend, frontend all running
□ GET http://localhost:3800/api/v1/health → 200 with DB connected
□ All 11 tables exist in Postgres
□ Industries seeded (SELECT count(*) FROM industries = 10)
□ Admin user seeded (SELECT * FROM users WHERE role = 'admin' returns 1 row)
□ Frontend loads at http://localhost:3000
□ Logger outputs structured JSON to stdout
```

### Checkpoint 2: Auth & CRUD (After Tasks 5-7)
```
Verify:
□ POST /auth/login with admin creds → returns JWT
□ GET /auth/me with JWT → returns user object
□ POST /auth/register without admin JWT → 403
□ POST /auth/register with admin JWT → creates user
□ GET /industries → returns seeded industries with client_count = 0
□ POST /clients → creates client with industry_id
□ GET /clients → returns client with industry name joined
□ GET /industries → now shows client_count = 1 for that industry
□ DELETE /industries/:id (with clients) → 400 error
□ All responses include structured error objects on failure
```

### Checkpoint 3: Fireberry + Meta Integration (After Tasks 8-12)
```
Verify:
□ POST /fireberry/sync-clients → pulls customers from Fireberry ObjectType 1:
  - Clients appear in clients table with fireberry_account_id
  - Fields mapped: accountname → client_name, pcfsystemfield1475 → brand_name,
    telephone1 → contact_phone, pcfsystemfield1445 → logo_url
  - Duplicate sync does upsert (no duplicates)
□ POST /fireberry/sync-tokens → pulls tokens from Fireberry ObjectType 1013:
  - pcfsystemfield100 (FB token) → ad_accounts.access_token
  - pcfsystemfield104 (Page ID) → ad_accounts.page_id
  - Token source marked as 'fireberry'
□ GET /fireberry/status → shows last sync times, record counts
□ GET /fireberry/preview-clients → dry run shows what would change
□ Token resolver: account with Fireberry token → returns that token
□ Token resolver: account without token, business token set → returns business token
□ Token resolver: no tokens → returns null, logs ERROR
□ GET /ad-accounts/discover → returns real accounts from Meta Business Manager
□ POST /ad-accounts/import → stores account, links to Fireberry client
□ GET /ad-accounts/:id/token-status → validates Fireberry-sourced token against Meta /me
□ POST /sync/trigger/:id → full sync completes:
  - Campaigns, ad sets, ads, performance snapshots in DB
  - sync_logs entry shows status = 'completed', token_source logged
□ Images downloaded, thumbnails generated, served via /media/
□ Sync with invalid Fireberry token → falls back to business token
□ Sync with no valid tokens → fails gracefully, logs error
□ Post-sync validation runs (orphan check, field check, snapshot check)
```

### Checkpoint 4: Data Layer (After Tasks 13-19)
```
Verify:
□ GET /campaigns?client_id=X → returns only that client's campaigns
□ GET /campaigns?status=ACTIVE → filters correctly
□ GET /ads/:id/performance?date_from=&date_to= → returns daily snapshots
□ GET /dashboard/overview → spend/impressions/clicks/leads match raw SQL:
  SELECT SUM(spend), SUM(impressions), SUM(clicks), SUM(leads)
  FROM performance_snapshots WHERE date BETWEEN x AND y
□ GET /dashboard/by-industry → grouped correctly
□ GET /dashboard/top-ads?sort_by=ctr&limit=5 → returns 5 ads sorted by CTR desc
□ GET /gallery?industry=1&sort=spend → returns ads with thumbnails, sorted
□ POST /query/raw (as admin) with SELECT → returns results
□ POST /query/raw (as viewer) → 403
□ POST /query/raw with DELETE statement → blocked
□ POST /query/raw with pg_catalog access → blocked
□ POST /query/builder with valid spec → returns results
□ POST /query/builder with invalid entity → error
□ GET /query/schema → returns all 11 tables
□ Cron jobs registered (check startup logs for Fireberry sync + Meta syncs)
□ Cache: second call to /dashboard/overview faster than first
□ KPI calculator: CTR = (clicks / impressions) * 100 matches stored value
```

### Checkpoint 5: Frontend Complete (After Tasks 20-30)
```
Verify:
□ /login → login form, submits, stores JWT, redirects to /
□ Sidebar navigation works for all routes
□ / (Dashboard) → KPI cards load, charts render, no console errors
□ /industries → industry cards with counts
□ /industries/:id → client list, campaigns, trends
□ /clients → table with search and pagination
□ /clients/:id → account summary, Fireberry data (logo, drive link), campaigns
□ /gallery → creative grid loads with thumbnails, filters work
□ /query → Raw SQL tab (admin only), Builder tab, results table renders
□ /sync → sync logs display (Fireberry + Meta), trigger buttons work, Fireberry status
□ /settings → account import, Fireberry sync controls, API key management
□ Filter bar: changing date range updates all data on page
□ Logout clears JWT and redirects to /login
□ Protected routes redirect unauthenticated users to /login
```

### Checkpoint 6: Integration (After Task 31)
```
Verify:
□ Full flow: Fireberry sync → tokens populated → Meta sync → dashboard shows data → gallery shows creatives
□ Fireberry token refresh: update token in Fireberry → run sync → new token picked up
□ Token fallback: remove Fireberry token → sync still works via business token
□ Token failure: invalidate both tokens → sync fails gracefully, no crash
□ Query API with API key from external tool (curl with X-API-Key header)
□ Docker compose down && docker compose up → everything recovers (data persists in volumes)
□ Health check reports all systems ok (including Fireberry connectivity)
□ Sync logs show complete history (both Fireberry and Meta syncs)
```

---

## File Reference Map

Quick lookup for where each concept is implemented:

### Backend Services → Architecture Section → Logging Path

| Service File | Architecture Reference | Logging Critical Path |
|-------------|----------------------|----------------------|
| `fireberry.service.js` | Fireberry Integration section | Path 8: Fireberry API Calls |
| `fireberry-sync.service.js` | Fireberry Sync Strategy | Path 8: Fireberry Sync |
| `token-resolver.service.js` | Token Management section | Path 1: Token Resolution |
| `meta-api.service.js` | Data Sync Strategy → Meta API Fields | Path 2: Meta API Calls |
| `sync.service.js` | Data Sync Strategy → Sync Flow | Path 3: Sync Orchestration |
| Campaign/AdSet/Ad upserts | Database Schema → Tables | Path 4: Database Upserts |
| `query-raw.service.js` | Query API Details → Raw SQL | Path 5: Query API (raw) |
| `query-builder.service.js` | Query API Details → Builder | Path 5: Query API (builder) |
| `auth.middleware.js` | Authentication section | Path 6: Auth & API Key |
| `media.service.js` | Local Media Storage section | Path 7: Media Download |

### Database Tables → Migration → Seed

| Table | Migration File | Seed File | Key Constraints |
|-------|---------------|-----------|-----------------|
| industries | 001_create_industries.js | 01_industries.js | name UNIQUE |
| clients | 002_create_clients.js | — | industry_id FK |
| ad_accounts | 003_create_ad_accounts.js | — | id = act_XXX, client_id FK CASCADE |
| campaigns | 004_create_campaigns.js | — | id = Meta ID, ad_account_id FK CASCADE |
| adsets | 005_create_adsets.js | — | campaign_id FK CASCADE |
| ads | 006_create_ads.js | — | adset_id FK CASCADE |
| performance_snapshots | 007_create_performance_snapshots.js | — | UNIQUE(date, ad_id, level), 4 indexes |
| users | 008_create_users.js | 02_demo_user.js | email UNIQUE |
| sync_logs | 009_create_sync_logs.js | — | — |
| saved_queries | 010_create_saved_queries.js | — | user_id FK |
| api_keys | 011_create_api_keys.js | — | user_id FK |

### API Routes → Controller → Service

| Route File | Controller | Service(s) Used |
|-----------|-----------|----------------|
| auth.routes.js | auth.controller.js | (direct DB) |
| fireberry.routes.js | fireberry.controller.js | fireberry.service.js, fireberry-sync.service.js |
| clients.routes.js | clients.controller.js | cache.service.js |
| ad-accounts.routes.js | ad-accounts.controller.js | token-resolver.service.js, meta-api.service.js |
| campaigns.routes.js | campaigns.controller.js | (direct DB) |
| adsets.routes.js | adsets.controller.js | (direct DB) |
| ads.routes.js | ads.controller.js | (direct DB) |
| performance.routes.js | performance.controller.js | (direct DB) |
| industries.routes.js | industries.controller.js | cache.service.js |
| sync.routes.js | sync.controller.js | sync.service.js, meta-api.service.js, media.service.js |
| dashboard.routes.js | dashboard.controller.js | dashboard.service.js, cache.service.js |
| gallery.routes.js | gallery.controller.js | (direct DB) |
| query.routes.js | query.controller.js | query-raw.service.js, query-builder.service.js, query-schema.service.js |
| export.routes.js | export.controller.js | export.service.js |

### Frontend Pages → API Module → Backend Route

| Page | API Module | Backend Endpoints Used |
|------|-----------|----------------------|
| LoginPage.jsx | auth.api.js | POST /auth/login |
| DashboardPage.jsx | dashboard.api.js | GET /dashboard/overview, /by-industry, /top-ads |
| IndustryOverviewPage.jsx | industries.api.js | GET /industries |
| IndustryDetailPage.jsx | industries.api.js, campaigns.api.js | GET /industries, /campaigns, /dashboard/by-industry |
| ClientListPage.jsx | clients.api.js | GET /clients |
| ClientDetailPage.jsx | clients.api.js, campaigns.api.js | GET /clients/:id, /campaigns, /dashboard/by-client/:id |
| CampaignDetailPage.jsx | campaigns.api.js, ads.api.js | GET /campaigns/:id, /campaigns/:id/adsets, /ads |
| CreativeGalleryPage.jsx | ads.api.js | GET /gallery |
| AdDetailPage.jsx | ads.api.js, performance.api.js | GET /ads/:id, /ads/:id/performance |
| QueryExplorerPage.jsx | query.api.js | POST /query/raw, /query/builder, GET /query/schema |
| SyncStatusPage.jsx | sync.api.js, fireberry.api.js | GET /sync/status, /fireberry/status, POST /sync/trigger, /fireberry/sync-all |
| SettingsPage.jsx | auth.api.js, sync.api.js, fireberry.api.js | POST /auth/api-keys, /ad-accounts/import, /fireberry/sync-clients |

---

## Naming Conventions

Enforced across the entire codebase:

| Element | Convention | Example |
|---------|-----------|---------|
| Database tables | snake_case, plural | `ad_accounts`, `performance_snapshots` |
| Database columns | snake_case | `client_name`, `ad_account_id` |
| API routes | kebab-case | `/ad-accounts`, `/query/saved` |
| Route files | kebab-case + `.routes.js` | `ad-accounts.routes.js` |
| Controller files | kebab-case + `.controller.js` | `ad-accounts.controller.js` |
| Service files | kebab-case + `.service.js` | `token-resolver.service.js` |
| Middleware files | kebab-case + `.middleware.js` | `auth.middleware.js` |
| Migration files | number prefix + snake_case | `001_create_industries.js` |
| React components | PascalCase + `.jsx` | `KPICard.jsx`, `FilterBar.jsx` |
| React hooks | camelCase + `use` prefix | `useAuth.js`, `useFilters.js` |
| React contexts | PascalCase + `Context.jsx` | `AuthContext.jsx` |
| API modules (frontend) | kebab-case + `.api.js` | `dashboard.api.js` |
| JS variables | camelCase | `adAccountId`, `tokenSource` |
| Environment variables | UPPER_SNAKE_CASE | `META_BUSINESS_TOKEN`, `JWT_SECRET` |
| Log contexts | lowercase single word | `sync`, `auth`, `query`, `meta-api`, `media`, `http` |

---

## Common Patterns

### API Response Format

Every endpoint returns this structure:

```javascript
// Success
{ "data": <result>, "meta": { "page": 1, "limit": 50, "total": 245 } }

// Error
{ "error": { "code": "VALIDATION_ERROR", "message": "Human readable message", "details": {} } }
```

### Pagination

All list endpoints support:
```
?page=1&limit=50
```
Default: page=1, limit=50, max limit=200.

### Date Filtering

All date-filtered endpoints support:
```
?date_from=2026-01-01&date_to=2026-03-26
```
Default: last 30 days.

### Knex Query Pattern

```javascript
// Standard list query with pagination + filters
const query = db('campaigns')
    .select('campaigns.*', 'clients.client_name', 'ad_accounts.account_name')
    .leftJoin('clients', 'campaigns.client_id', 'clients.id')
    .leftJoin('ad_accounts', 'campaigns.ad_account_id', 'ad_accounts.id')
    .modify((qb) => {
        if (filters.client_id) qb.where('campaigns.client_id', filters.client_id);
        if (filters.status) qb.where('campaigns.status', filters.status);
        if (filters.date_from) qb.where('campaigns.start_date', '>=', filters.date_from);
    })
    .orderBy(sortBy, sortDir)
    .limit(limit)
    .offset((page - 1) * limit);
```

### Controller Pattern

```javascript
// Every controller method follows this:
async function listCampaigns(req, res, next) {
    try {
        const filters = {
            client_id: req.query.client_id,
            status: req.query.status,
            date_from: req.query.date_from || thirtyDaysAgo(),
            date_to: req.query.date_to || today()
        };
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);

        const { data, total } = await campaignService.list(filters, page, limit);

        res.json({ data, meta: { page, limit, total } });
    } catch (err) {
        next(err);  // Goes to error middleware
    }
}
```

---

## Environment Setup Checklist

Before writing any code, ensure:

```
□ Docker Desktop installed and running
□ Node.js 20+ installed locally (for development without Docker)
□ .env file created from .env.example with:
  □ META_BUSINESS_ID (from Facebook Business Manager)
  □ META_BUSINESS_TOKEN (system user token)
  □ DB_PASSWORD (any string)
  □ JWT_SECRET (any string, min 32 chars)
□ Facebook Developer App with Marketing API access
□ docker compose up postgres → Postgres accessible on localhost:5432
```

---

## Quick Reference: What Goes Where

| I need to... | File to create/edit |
|-------------|-------------------|
| Add/update Fireberry field mapping | `backend/services/fireberry-sync.service.js` → update ARCHITECTURE.md Fireberry section |
| Debug Fireberry sync | Check logs with context `fireberry`, verify field mappings, check phone normalization |
| Add a new database table | `backend/migrations/NNN_create_tablename.js` → update ARCHITECTURE.md |
| Add a new API endpoint | `backend/routes/X.routes.js` → `controllers/X.controller.js` → `services/X.service.js` |
| Add a new frontend page | `frontend/src/pages/XPage.jsx` → add route in `App.jsx` → add nav link in `Sidebar.jsx` |
| Add a new filter | `frontend/src/components/filters/XFilter.jsx` → wire into `FilterContext.jsx` |
| Add a new chart | `frontend/src/components/charts/XChart.jsx` → use in page |
| Add a new cron job | `backend/jobs/X.job.js` → register in `jobs/index.js` |
| Change Meta API fields | `backend/config/meta-api.js` → update `meta-api.service.js` |
| Add a new validation | Follow pattern in LOGGING.md for the relevant critical path |
| Fix a bug | Check LOGGING.md for what should have been logged, trace from there |
