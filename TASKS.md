# Ads Management Platform - Task Breakdown

## Phase 1 — Core

---

### 1. Project Setup & Infrastructure

- [ ] **1.1** Initialize `backend/` with `package.json`, install dependencies (express, knex, pg, bcrypt, jsonwebtoken, node-cron, sharp, node-cache, cors, helmet)
- [ ] **1.2** Initialize `frontend/` with Vite + React, install dependencies (react-router-dom, axios, tailwindcss, recharts, @headlessui/react)
- [ ] **1.3** Create `docker-compose.yml` with postgres, backend, frontend services + volumes
- [ ] **1.4** Create `backend/Dockerfile` (Node 20 Alpine)
- [ ] **1.5** Create `frontend/Dockerfile` (Vite build → Nginx) + `nginx.conf` with API proxy
- [ ] **1.6** Create `.env.example` with all required variables
- [ ] **1.7** Create `scripts/setup.sh` (first-time setup helper)
- [ ] **1.8** Create `scripts/reset-db.sh` (drop and recreate DB)
- [ ] **1.9** Verify `docker compose up` boots all 3 services and they communicate

---

### 2. Backend Core Setup

- [ ] **2.1** Create `server.js` — Express app, CORS, JSON body parser, static media, error handler, listen on PORT
- [ ] **2.2** Create `config/db.js` — Knex instance from DATABASE_URL
- [ ] **2.3** Create `knexfile.js` — development + production configs
- [ ] **2.4** Create `config/auth.js` — JWT secret, token expiry constants
- [ ] **2.5** Create `config/meta-api.js` — Meta API version, base URL, field lists
- [ ] **2.6** Create `middlewares/error.middleware.js` — global error handler
- [ ] **2.7** Create `utils/logger.js` — console logger with timestamps
- [ ] **2.8** Add health check endpoint `GET /api/v1/health`

---

### 3. Database Migrations

- [ ] **3.1** Migration `001_create_industries` — id, name, parent_id, tags[], created_at
- [ ] **3.2** Migration `002_create_clients` — id, client_name, brand_name, industry_id (FK), contact fields, account_manager, notes, timestamps
- [ ] **3.3** Migration `003_create_ad_accounts` — id (act_XXX), client_id (FK), account_name, currency, timezone, status, access_token, token_type, token_expires, use_business_token, is_active, last_synced_at, created_at
- [ ] **3.4** Migration `004_create_campaigns` — id (Meta ID), ad_account_id (FK), client_id (FK), name, objective, status, buying_type, budgets, dates, timestamps
- [ ] **3.5** Migration `005_create_adsets` — id, campaign_id (FK), name, status, optimization_goal, budgets, targeting (JSONB), placements (JSONB), timestamps
- [ ] **3.6** Migration `006_create_ads` — id, adset_id (FK), campaign_id (FK), client_id (FK), name, status, creative_id, URLs, local paths, body_text, cta_type, link_url, timestamps
- [ ] **3.7** Migration `007_create_performance_snapshots` — id, date, ad_account_id, campaign_id, adset_id, ad_id, level, all metrics, actions (JSONB), UNIQUE constraint, indexes on date/campaign/ad/account
- [ ] **3.8** Migration `008_create_users` — id, email (UNIQUE), password_hash, name, role, created_at
- [ ] **3.9** Migration `009_create_sync_logs` — id, ad_account_id, sync_type, status, token_source, records_synced, error_message, started_at, completed_at
- [ ] **3.10** Migration `010_create_saved_queries` — id, user_id (FK), name, description, type, query_body (JSONB), is_public, timestamps
- [ ] **3.11** Migration `011_create_api_keys` — id, user_id (FK), key_hash, name, permissions, last_used, expires_at, created_at
- [ ] **3.12** Run all migrations, verify tables exist in Postgres

---

### 4. Seeds

- [ ] **4.1** Seed `01_industries` — Beauty, Real Estate, Travel, Medical, E-commerce, Restaurants, Clinics, Fashion, Education, Technology
- [ ] **4.2** Seed `02_demo_user` — create admin user from DEFAULT_ADMIN_EMAIL + DEFAULT_ADMIN_PASSWORD env vars (bcrypt hashed)

---

### 5. Auth System

- [ ] **5.1** Create `middlewares/auth.middleware.js` — JWT verification + API Key fallback from `X-API-Key` header
- [ ] **5.2** Create `routes/auth.routes.js` + `controllers/auth.controller.js`
- [ ] **5.3** Implement `POST /auth/login` — email + password → bcrypt compare → return JWT (24h)
- [ ] **5.4** Implement `POST /auth/register` — admin-only, create user with hashed password
- [ ] **5.5** Implement `GET /auth/me` — return current user from JWT
- [ ] **5.6** Add role-based access helper (`requireRole('admin')`, `requireRole('manager')`)
- [ ] **5.7** Add API key generation endpoint `POST /auth/api-keys` — generate key, store hash, return raw key once
- [ ] **5.8** Add API key list/delete endpoints `GET /auth/api-keys`, `DELETE /auth/api-keys/:id`

---

### 6. Industries CRUD

- [ ] **6.1** Create `routes/industries.routes.js` + `controllers/industries.controller.js`
- [ ] **6.2** Implement `GET /industries` — list all with client counts (LEFT JOIN + COUNT)
- [ ] **6.3** Implement `POST /industries` — create (admin/manager)
- [ ] **6.4** Implement `PUT /industries/:id` — update (admin/manager)
- [ ] **6.5** Implement `DELETE /industries/:id` — delete only if no clients linked

---

### 7. Clients CRUD

- [ ] **7.1** Create `routes/clients.routes.js` + `controllers/clients.controller.js`
- [ ] **7.2** Implement `GET /clients` — list with industry join, pagination, search by name
- [ ] **7.3** Implement `GET /clients/:id` — detail with ad accounts, campaign counts, total spend
- [ ] **7.4** Implement `POST /clients` — create with industry assignment
- [ ] **7.5** Implement `PUT /clients/:id` — update
- [ ] **7.6** Implement `DELETE /clients/:id` — soft delete

---

### 8. Fireberry Integration

- [ ] **8.1** Create `services/fireberry.service.js` — Fireberry API client: `queryFireberry(objectType, fields, query, pageSize)`, `getRecordById(objectType, recordId)`, `updateRecord(objectType, recordId, data)` — all use `FIREBERRY_TOKEN` header auth
- [ ] **8.2** Create `services/fireberry-sync.service.js` — orchestrates client + token sync
- [ ] **8.3** Implement `syncClientsFromFireberry()` — query ObjectType 1 (all active customers) → map fields (accountid → fireberry_account_id, accountname → client_name, pcfsystemfield1475 → brand_name, telephone1 → contact_phone, pcfsystemfield1445 → logo_url, websiteurl → website_url, pcfsystemfield114 → drive_url, pcfsystemfield1441name → account_manager) → upsert into `clients` table ON CONFLICT(fireberry_account_id)
- [ ] **8.4** Implement `syncTokensFromFireberry()` — query ObjectType 1013 (all records with pcfsystemfield100 non-empty) → for each record: extract FB token (pcfsystemfield100), Page ID (pcfsystemfield104), phone (pcfsystemfield110) → match to client via pcfsystemfield106 link or phone lookup → update `ad_accounts.access_token` and `ad_accounts.page_id`
- [ ] **8.5** Implement phone normalization — handle Israeli variants: `972501234567`, `0501234567`, `501234567`
- [ ] **8.6** Create `routes/fireberry.routes.js` + `controllers/fireberry.controller.js`
- [ ] **8.7** Implement `POST /fireberry/sync-clients` — manual trigger client sync
- [ ] **8.8** Implement `POST /fireberry/sync-tokens` — manual trigger token sync
- [ ] **8.9** Implement `POST /fireberry/sync-all` — run both syncs sequentially
- [ ] **8.10** Implement `GET /fireberry/status` — last sync times, record counts, errors
- [ ] **8.11** Implement `GET /fireberry/preview-clients` — dry run showing what would be imported/updated
- [ ] **8.12** Implement `GET /fireberry/preview-tokens` — dry run showing token status per account
- [ ] **8.13** Create `jobs/fireberry-sync.job.js` — cron every 6 hours, runs client sync then token sync
- [ ] **8.14** Log every Fireberry API call with request/response, field mapping results, and upsert counts

---

### 9. Ad Accounts & Token Management

- [ ] **9.1** Create `services/token-resolver.service.js` — resolve token per account (per-account from Fireberry → business → null)
- [ ] **9.2** Create `routes/ad-accounts.routes.js` + `controllers/ad-accounts.controller.js`
- [ ] **9.3** Implement `GET /ad-accounts` — list all with client name, token status (from Fireberry), last synced
- [ ] **9.4** Implement `GET /ad-accounts/discover` — call Meta `/{business_id}/owned_ad_accounts` + `/client_ad_accounts` using business token, return available accounts
- [ ] **9.5** Implement `POST /ad-accounts/import` — import selected accounts, link to client via Fireberry match
- [ ] **9.6** Implement `POST /ad-accounts/import-all` — import all discovered accounts using business token
- [ ] **9.7** Implement `PUT /ad-accounts/:id` — update settings (token comes from Fireberry, not manual)
- [ ] **9.8** Implement `DELETE /ad-accounts/:id` — disconnect account
- [ ] **9.9** Implement `GET /ad-accounts/:id/token-status` — validate token against Meta API, show Fireberry source
- [ ] **9.10** Implement `POST /ad-accounts/validate-all` — bulk check all tokens

---

### 10. Meta API Service

- [ ] **10.1** Create `services/meta-api.service.js` — base class with token injection, pagination, rate limiting
- [ ] **10.2** Implement `fetchCampaigns(adAccountId, token)` — GET `/{ad_account_id}/campaigns` with fields, cursor pagination
- [ ] **10.3** Implement `fetchAdSets(campaignId, token)` — GET `/{campaign_id}/adsets` with fields
- [ ] **10.4** Implement `fetchAds(adSetId, token)` — GET `/{adset_id}/ads` with creative fields
- [ ] **10.5** Implement `fetchInsights(objectId, token, dateRange, level)` — GET `/{object_id}/insights` with time_increment=1
- [ ] **10.6** Implement `validateToken(token)` — GET `/me?access_token=...`
- [ ] **10.7** Implement `fetchBusinessAccounts(businessId, token)` — GET `/{business_id}/owned_ad_accounts` + `/client_ad_accounts`
- [ ] **10.8** Create `utils/meta-helpers.js` — cursor pagination helper, rate limit delay (200ms), exponential backoff on 429

---

### 11. Sync Service

- [ ] **11.1** Create `services/sync.service.js` — main orchestrator
- [ ] **11.2** Implement `syncAccount(adAccountId)` — resolve token (Fireberry-sourced or business) → validate → fetch campaigns → adsets → ads → insights → upsert all → log
- [ ] **11.3** Implement `syncAllAccounts()` — loop all active accounts, call syncAccount
- [ ] **11.4** Implement campaign upsert logic — ON CONFLICT (id) DO UPDATE
- [ ] **11.5** Implement adset upsert logic
- [ ] **11.6** Implement ad upsert logic
- [ ] **11.7** Implement performance snapshot upsert — ON CONFLICT (date, ad_id, level) DO UPDATE
- [ ] **11.8** Implement sync logging — create sync_log entry on start, update on complete/fail, include token_source
- [ ] **11.9** Create `routes/sync.routes.js` + `controllers/sync.controller.js`
- [ ] **11.10** Implement `POST /sync/trigger/:ad_account_id` — manual sync one account
- [ ] **11.11** Implement `POST /sync/trigger-all` — manual full sync (runs Fireberry sync first, then Meta sync)
- [ ] **11.12** Implement `GET /sync/status` — list recent sync logs (both Fireberry and Meta)
- [ ] **11.13** Implement `GET /sync/status/:id` — detail of one sync run

---

### 12. Media Service

- [ ] **12.1** Create `services/media.service.js` — download + store creatives
- [ ] **12.2** Implement image download — fetch from URL, save to `/data/media/images/{account_id}/{ad_id}_original.jpg`
- [ ] **12.3** Implement thumbnail generation — use `sharp` to resize to 300px → `{ad_id}_thumb.jpg`
- [ ] **12.4** Implement video thumbnail download — save Meta's thumbnail_url locally
- [ ] **12.5** Add `DOWNLOAD_VIDEOS` config check — skip full video download if false
- [ ] **12.6** Update ad record with `local_image` / `local_video` paths after download
- [ ] **12.7** Wire media download into sync flow (after ads are fetched)
- [ ] **12.8** Serve `/media` via Express static middleware

---

### 13. Campaigns / Ad Sets / Ads Read Endpoints

- [ ] **13.1** Create `routes/campaigns.routes.js` + `controllers/campaigns.controller.js`
- [ ] **13.2** Implement `GET /campaigns` — filtered list (client_id, status, objective, date range, pagination)
- [ ] **13.3** Implement `GET /campaigns/:id` — campaign detail with summary stats
- [ ] **13.4** Implement `GET /campaigns/:id/adsets` — ad sets for campaign
- [ ] **13.5** Create `routes/adsets.routes.js` + `controllers/adsets.controller.js`
- [ ] **13.6** Implement `GET /adsets/:id/ads` — ads for ad set
- [ ] **13.7** Create `routes/ads.routes.js` + `controllers/ads.controller.js`
- [ ] **13.8** Implement `GET /ads/:id` — ad detail with creative info
- [ ] **13.9** Implement `GET /ads/:id/performance?date_from=&date_to=` — daily performance history

---

### 14. Dashboard Endpoints

- [ ] **14.1** Create `services/dashboard.service.js` — aggregation query builders
- [ ] **14.2** Create `routes/dashboard.routes.js` + `controllers/dashboard.controller.js`
- [ ] **14.3** Implement `GET /dashboard/overview` — total spend, impressions, clicks, leads, ROAS across all accounts for date range
- [ ] **14.4** Implement `GET /dashboard/by-industry` — aggregated KPIs grouped by industry
- [ ] **14.5** Implement `GET /dashboard/by-client/:id` — KPIs for one client
- [ ] **14.6** Implement `GET /dashboard/top-ads?sort_by=&limit=` — best performing ads by chosen metric
- [ ] **14.7** Create `routes/performance.routes.js` + `controllers/performance.controller.js`
- [ ] **14.8** Implement `GET /performance/trends` — time series data (daily/weekly) for a metric

---

### 15. Creative Gallery Endpoints

- [ ] **15.1** Create `routes/gallery.routes.js` + `controllers/gallery.controller.js`
- [ ] **15.2** Implement `GET /gallery` — paginated grid with filters (industry, client, status, creative type, KPI sort)
- [ ] **15.3** Implement `GET /gallery/:ad_id` — single ad with full metrics, media URLs, campaign context

---

### 16. Query API

- [ ] **16.1** Create `services/query-raw.service.js` — SQL parsing, SELECT-only validation, read-only transaction execution, timeout (10s), row limit (10k)
- [ ] **16.2** Create `services/query-builder.service.js` — JSON to Knex query: entity selection, whitelisted joins with pre-defined relationships, field selection, filter operators (eq, neq, gt, gte, lt, lte, in, like, between), aggregations (SUM, AVG, COUNT, MIN, MAX), group_by, order_by, pagination
- [ ] **16.3** Create `services/query-schema.service.js` — introspect Postgres for table names, column types, foreign key relationships
- [ ] **16.4** Create `middlewares/query-guard.middleware.js` — block pg_*/information_schema, enforce timeout, enforce row limit
- [ ] **16.5** Create `routes/query.routes.js` + `controllers/query.controller.js`
- [ ] **16.6** Implement `POST /query/raw` — admin only, execute validated SQL
- [ ] **16.7** Implement `POST /query/builder` — all roles + API key, build and execute structured query
- [ ] **16.8** Implement `GET /query/schema` — list all queryable tables
- [ ] **16.9** Implement `GET /query/schema/:table` — columns, types, relationships for one table
- [ ] **16.10** Implement `GET /query/schema/relationships` — all join paths
- [ ] **16.11** Implement `POST /query/saved` — save query (admin/manager)
- [ ] **16.12** Implement `GET /query/saved` — list saved queries (public + own)
- [ ] **16.13** Implement `GET /query/saved/:id` — get one saved query
- [ ] **16.14** Implement `POST /query/saved/:id/run` — execute a saved query
- [ ] **16.15** Implement `DELETE /query/saved/:id` — delete (owner or admin)

---

### 17. Cron Jobs

- [ ] **17.1** Create `jobs/index.js` — register all cron jobs on server startup
- [ ] **17.2** Create `jobs/fireberry-sync.job.js` — every 6 hours, sync clients then tokens from Fireberry
- [ ] **17.3** Create `jobs/daily-sync.job.js` — full Meta sync at 3:00 AM daily (all accounts, 90 days insights)
- [ ] **17.4** Create `jobs/incremental-sync.job.js` — every 2 hours (active campaigns, last 2 days)
- [ ] **17.5** Create `jobs/token-check.job.js` — Monday 8 AM, check all token expiry, warn if < 7 days

---

### 18. Cache Service

- [ ] **18.1** Create `services/cache.service.js` — node-cache wrapper with TTL
- [ ] **18.2** Cache industry list + client counts (5 min TTL)
- [ ] **18.3** Cache dashboard overview (2 min TTL)
- [ ] **18.4** Cache schema introspection (30 min TTL)
- [ ] **18.5** Add cache invalidation on sync completion (both Fireberry and Meta syncs)

---

### 19. KPI Calculator

- [ ] **19.1** Create `utils/kpi-calculator.js` — derive CTR, CPC, CPM, cost_per_result, ROAS from raw metrics
- [ ] **19.2** Wire into sync service — calculate derived KPIs before upserting snapshots

---

### 20. Frontend — Layout & Auth

- [ ] **20.1** Create `App.jsx` with React Router v6, route definitions
- [ ] **20.2** Create `context/AuthContext.jsx` — login state, JWT storage (localStorage), logout
- [ ] **20.3** Create `hooks/useAuth.js` — login/logout/getUser helpers
- [ ] **20.4** Create `api/client.js` — Axios instance with JWT interceptor + API key support
- [ ] **20.5** Create `components/layout/MainLayout.jsx` — sidebar + topbar + content area
- [ ] **20.6** Create `components/layout/Sidebar.jsx` — nav links (Dashboard, Industries, Clients, Gallery, Query, Sync, Settings)
- [ ] **20.7** Create `components/layout/TopBar.jsx` — global date range picker, search, user avatar
- [ ] **20.8** Create `pages/LoginPage.jsx` — email + password form → JWT
- [ ] **20.9** Add protected route wrapper (redirect to /login if no JWT)

---

### 21. Frontend — Filter System

- [ ] **21.1** Create `context/FilterContext.jsx` — global filter state (date range, industry, client, status, objective)
- [ ] **21.2** Create `hooks/useFilters.js` — get/set filters, build query params
- [ ] **21.3** Create `components/filters/FilterBar.jsx` — container for all filter dropdowns
- [ ] **21.4** Create `components/filters/DateRangePicker.jsx` — presets (7/30/90 days) + custom range
- [ ] **21.5** Create `components/filters/IndustryFilter.jsx` — multi-select dropdown
- [ ] **21.6** Create `components/filters/ClientFilter.jsx` — multi-select dropdown
- [ ] **21.7** Create `components/filters/StatusFilter.jsx` — active/paused/archived checkboxes

---

### 22. Frontend — Common Components

- [ ] **22.1** Create `components/common/Loader.jsx` — spinner/skeleton
- [ ] **22.2** Create `components/common/Badge.jsx` — status badges (active=green, paused=yellow, etc.)
- [ ] **22.3** Create `components/common/Modal.jsx` — reusable modal wrapper
- [ ] **22.4** Create `components/common/Pagination.jsx` — page navigation
- [ ] **22.5** Create `components/tables/SortableHeader.jsx` — clickable column headers
- [ ] **22.6** Create `utils/formatters.js` — currency ($1,234.56), percentage (2.45%), dates, large numbers (1.2M)
- [ ] **22.7** Create `utils/constants.js` — status labels, KPI definitions, color maps

---

### 23. Frontend — Dashboard Page

- [ ] **23.1** Create `api/dashboard.api.js` — overview, by-industry, by-client, top-ads calls
- [ ] **23.2** Create `components/charts/KPICard.jsx` — metric card with value + delta indicator
- [ ] **23.3** Create `components/charts/SpendChart.jsx` — area/bar chart for spend over time
- [ ] **23.4** Create `components/charts/TrendLine.jsx` — line chart for any metric trend
- [ ] **23.5** Create `components/charts/ComparisonBar.jsx` — horizontal bar for comparing industries/clients
- [ ] **23.6** Create `pages/DashboardPage.jsx` — KPI cards row + spend chart + top ads + industry breakdown

---

### 24. Frontend — Industry Pages

- [ ] **24.1** Create `api/industries.api.js` — list, detail calls
- [ ] **24.2** Create `pages/IndustryOverviewPage.jsx` — cards grid (name, client count, campaign count, total spend, avg CTR)
- [ ] **24.3** Create `pages/IndustryDetailPage.jsx` — clients list, campaigns, ads, top creatives, trends for one industry

---

### 25. Frontend — Client Pages

- [ ] **25.1** Create `api/clients.api.js` — list, detail, CRUD calls
- [ ] **25.2** Create `pages/ClientListPage.jsx` — table with search, industry filter, pagination
- [ ] **25.3** Create `pages/ClientDetailPage.jsx` — account summary, Fireberry data (logo, drive link), campaigns (active vs inactive), top ads

---

### 26. Frontend — Campaign & Ad Pages

- [ ] **26.1** Create `api/campaigns.api.js` + `api/ads.api.js`
- [ ] **26.2** Create `components/tables/CampaignTable.jsx` — sortable campaign list
- [ ] **26.3** Create `components/tables/AdTable.jsx` — sortable ad list with thumbnails
- [ ] **26.4** Create `pages/CampaignDetailPage.jsx` — summary, ad sets, ads with previews, daily chart
- [ ] **26.5** Create `pages/AdDetailPage.jsx` — full creative preview, performance history chart, campaign context

---

### 27. Frontend — Creative Gallery

- [ ] **27.1** Create `components/gallery/CreativeCard.jsx` — image thumbnail + client + industry badge + spend/CTR/CPC stats
- [ ] **27.2** Create `components/gallery/CreativeGrid.jsx` — responsive grid layout
- [ ] **27.3** Create `components/gallery/MediaViewer.jsx` — modal with full-size image/video + all metrics
- [ ] **27.4** Create `pages/CreativeGalleryPage.jsx` — filter bar + grid + KPI sort dropdown + pagination

---

### 28. Frontend — Query Explorer

- [ ] **28.1** Create `api/query.api.js` — raw, builder, schema, saved query calls
- [ ] **28.2** Create `components/query/RawQueryEditor.jsx` — SQL textarea with syntax highlighting (admin only)
- [ ] **28.3** Create `components/query/QueryBuilder.jsx` — entity picker, field selector, filter builder, aggregation options
- [ ] **28.4** Create `components/query/ResultsTable.jsx` — dynamic table from query results with column sorting
- [ ] **28.5** Create `components/query/SavedQueries.jsx` — list, run, delete saved queries
- [ ] **28.6** Create `pages/QueryExplorerPage.jsx` — tabs (Raw SQL / Builder / Saved), results area

---

### 29. Frontend — Sync & Fireberry Status

- [ ] **29.1** Create `api/sync.api.js` + `api/fireberry.api.js` — trigger, status calls for both syncs
- [ ] **29.2** Create `pages/SyncStatusPage.jsx` — sync logs table (Fireberry + Meta), trigger buttons, token status per account, last synced timestamps, Fireberry connection status

---

### 30. Frontend — Settings

- [ ] **30.1** Create `pages/SettingsPage.jsx` — sections: Ad Account management (import/discover), Fireberry sync controls, API key management, user management (admin), token status overview

---

### 31. Integration Testing

- [ ] **31.1** Test Fireberry sync — pull clients from Fireberry → verify in `clients` table with correct field mapping
- [ ] **31.2** Test Fireberry token sync — pull tokens from ObjectType 1013 → verify in `ad_accounts.access_token`
- [ ] **31.3** Test full Meta sync flow — Fireberry token → Meta API → campaigns/ads/snapshots in DB
- [ ] **31.4** Test token resolution — Fireberry token → business token fallback → no token skip
- [ ] **31.5** Test Query API — raw SQL (admin), builder (all roles), API key auth
- [ ] **31.6** Test auth flow — login, register, role-based access, API key access
- [ ] **31.7** Test Docker Compose — `docker compose up` from scratch, all services healthy
- [ ] **31.8** Test dashboard aggregations — verify KPIs match raw data

---

## Phase 2 — Analytics

---

### 32. Trend Charts

- [ ] **32.1** Add time series endpoint for any metric with granularity (daily/weekly/monthly)
- [ ] **32.2** Add comparison mode — current period vs previous period
- [ ] **32.3** Frontend: trend charts on Dashboard, Industry Detail, Client Detail pages

---

### 33. Industry Benchmarks

- [ ] **33.1** Calculate industry averages (CTR, CPC, CPM, ROAS) from all clients in industry
- [ ] **33.2** Add benchmark endpoint `GET /dashboard/benchmarks?industry_id=`
- [ ] **33.3** Frontend: benchmark comparison bars on Industry Detail page

---

### 34. Performance Alerts

- [ ] **34.1** Create `alerts` table — threshold rules (e.g., "CTR drops below 1%")
- [ ] **34.2** Create alert check job — runs after each sync, evaluates rules
- [ ] **34.3** Store triggered alerts with context
- [ ] **34.4** Frontend: alerts panel on Dashboard + notification badges

---

### 35. Export

- [ ] **35.1** Create `services/export.service.js`
- [ ] **35.2** Implement CSV export — campaigns, ads, performance data with applied filters
- [ ] **35.3** Implement PDF client report — summary, top campaigns, charts rendered server-side
- [ ] **35.4** Frontend: export buttons on Dashboard, Client Detail, Gallery pages

---

### 36. Sync Improvements

- [ ] **36.1** Add partial retry — on failure, retry only failed accounts
- [ ] **36.2** Add error categorization — token error vs API error vs network error vs Fireberry error
- [ ] **36.3** Add sync progress tracking — emit progress during long syncs
- [ ] **36.4** Add rate limit monitoring — log API usage per account

---

## Phase 3 — Intelligence

---

### 37. AI Creative Tagging

- [ ] **37.1** Integrate image analysis API (OpenAI Vision / local model)
- [ ] **37.2** Auto-tag creatives — colors, objects, text overlay, mood, style
- [ ] **37.3** Store tags in `ads` table (JSONB column)
- [ ] **37.4** Frontend: tag filters in Gallery, tag display on CreativeCard

---

### 38. Auto Insights

- [ ] **38.1** Generate daily/weekly insight summaries — top movers, worst performers, anomalies
- [ ] **38.2** Store insights in dedicated table
- [ ] **38.3** Frontend: insights feed on Dashboard

---

### 39. Creative Clustering

- [ ] **39.1** Cluster similar creatives by visual similarity + performance
- [ ] **39.2** "Similar winning ads" feature — given an ad, find similar high-performers
- [ ] **39.3** Frontend: "Similar Ads" section on Ad Detail page

---

### 40. Recommendations Engine

- [ ] **40.1** Recommend best performing creative styles per industry
- [ ] **40.2** Recommend budget allocation based on historical ROAS
- [ ] **40.3** Frontend: recommendations panel on Client Detail + Industry Detail pages
