# Ads Management Platform - Architecture

## Overview

A centralized multi-client Meta Ads intelligence platform that aggregates campaign, ad, creative, and historical performance data across all managed ad accounts. Classifies data by industry and client, provides a visual dashboard for filtering, benchmarking, and analyzing ad creatives and results. Includes a flexible Query API for direct database access.

**Fireberry (PowerLink) is the source of truth** for all client data and Facebook tokens. The platform syncs client information and access tokens from Fireberry, then uses those tokens to pull data from the Meta Marketing API.

---

## Tech Stack (All Local)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Backend** | Node.js + Express 5 | Matches existing iconiq-server patterns |
| **Database** | PostgreSQL 16 | Relational data, joins, aggregations, daily snapshots |
| **ORM/Query** | Knex.js | Migrations, seeds, clean query building |
| **Frontend** | React (Vite) + Tailwind CSS | Fast dev, no SSR needed for internal tool |
| **Charts** | Recharts | Lightweight, React-native charting |
| **Scheduler** | node-cron | In-process scheduled sync jobs |
| **Media Storage** | Local filesystem (Docker volume) | Served via Express static middleware |
| **Auth** | JWT + bcrypt + API Keys | Simple local auth, no external providers |
| **Cache** | In-memory (node-cache) | No Redis needed at this scale |
| **PDF/CSV** | pdfkit + json2csv | Export reports locally |
| **CRM/Data Source** | Fireberry (PowerLink) API | Source of truth for clients, tokens, business data |
| **Deploy** | Docker Compose | Postgres + Backend + Frontend in 3 containers |

---

## System Architecture Diagram

```
+-------------------------+                    +------------------------+
|   Fireberry (PowerLink) |                    |   Facebook/Meta APIs   |
|   api.powerlink.co.il   |                    |  Marketing API v21.0   |
|                         |                    |  Business Manager API  |
|  ObjectType 1 (Clients) |                    +-----------+------------+
|  ObjectType 1013 (Users)|                                |
|  - FB Tokens            |           +--------------------+--------------------+
|  - Page IDs             |           |                                         |
|  - Ad Account IDs       |           |  Business Token        Per-Client Tokens|
+------------+------------+           |  (META_BUSINESS_TOKEN)  (from Fireberry)|
             |                        |                                         |
             |  Client sync           +--------------------+--------------------+
             |  Token fetch                                |
             |                                             |
             +------------------+  +-----------------------+
                                |  |
                    +-----------v--v---------+
                    |        Backend         |
                    |    Node.js + Express   |
                    |                        |
                    |  +------------------+  |
                    |  | Fireberry Service|  |
                    |  | (client + token  |  |
                    |  |  sync)           |  |
                    |  +------------------+  |
                    |  | Token Resolver   |  |
                    |  +------------------+  |
                    |  | Sync Service     |  |
                    |  +------------------+  |
                    |  | Query API        |  |
                    |  +------------------+  |
                    |  | Media Service    |  |
                    |  +------------------+  |
                    +-----------+------------+
                         |            |
              +----------+      +-----+------+
              |                 |             |
    +---------v------+  +------v----+  +-----v--------+
    |  PostgreSQL 16 |  | Local FS  |  |   Frontend   |
    |                |  | /data/    |  | React + Vite |
    |  11 tables     |  | media/    |  | Tailwind     |
    |  + indexes     |  | images/   |  | Recharts     |
    |                |  | videos/   |  |              |
    +----------------+  +-----------+  +--------------+
```

---

## Fireberry Integration (Source of Truth)

Fireberry (PowerLink CRM) holds all client data and Facebook tokens. Our platform syncs FROM Fireberry, never writes back.

### Fireberry API

```
Base URL: https://api.powerlink.co.il/api
Auth: tokenid header with FIREBERRY_TOKEN
```

### Fireberry Object Types We Use

#### ObjectType 1 — Customers/Accounts (Client Data)
| Fireberry Field | Maps To | Description |
|----------------|---------|-------------|
| `accountid` | `clients.fireberry_account_id` | Primary customer ID |
| `accountname` | `clients.client_name` | Company/business name |
| `pcfsystemfield1475` | `clients.brand_name` | Business legal name |
| `telephone1` | `clients.contact_phone` | Primary phone |
| `pcfsystemfield114` | `clients.drive_url` | Google Drive link |
| `pcfsystemfield1445` | `clients.logo_url` | Logo image URL |
| `websiteurl` | `clients.website_url` | Client website |
| `statuscode` | `clients.status` | Account status |
| `pcfsystemfield1441name` | `clients.account_manager` | Sales person name |

#### ObjectType 1013 — App/WA Users (Tokens & Page IDs)
| Fireberry Field | Maps To | Description |
|----------------|---------|-------------|
| `pcfsystemfield100` | `ad_accounts.access_token` | **Facebook user access token** |
| `pcfsystemfield104` | `ad_accounts.page_id` | **Facebook Page ID** |
| `pcfsystemfield110` | (phone lookup key) | WhatsApp/contact phone |
| `pcfsystemfield106` | (link to ObjectType 1) | Customer relationship |
| `pcfsystemfield119` | — | WhatsApp session ID |
| `pcfsystemfield121` | — | Instagram token |
| `customobject1013id` | `ad_accounts.fireberry_record_id` | Record ID for updates |

### Client → Token Data Flow

```
Fireberry ObjectType 1 (Customer)
  ├── accountid, accountname, phone, logo, etc.
  └── linked via pcfsystemfield106 ←─── ObjectType 1013 (User)
                                          ├── pcfsystemfield100 (FB token)
                                          ├── pcfsystemfield104 (Page ID)
                                          └── pcfsystemfield110 (phone)

Our sync pulls both, joins them, stores in:
  clients table     ← ObjectType 1 data
  ad_accounts table ← ObjectType 1013 tokens + Meta API discovery
```

### Fireberry API Call Patterns

**Query (Read):**
```
POST https://api.powerlink.co.il/api/query
Headers: { tokenid: FIREBERRY_TOKEN }
Body: {
    "objecttype": 1,
    "page_size": 100,
    "page_number": 1,
    "fields": "accountid,accountname,telephone1,pcfsystemfield1475,...",
    "query": "(statuscode = 1)"
}
Response: { success: true, data: { Data: [...] } }
```

**Record Update (Write — future use):**
```
PUT https://api.powerlink.co.il/api/record/{objecttype}/{recordid}
Headers: { tokenid: FIREBERRY_TOKEN }
Body: { "fieldname": "newvalue" }
```

### Fireberry Sync Strategy

| Job | Schedule | What It Does |
|-----|----------|-------------|
| `fireberry-clients-sync` | Every 6 hours | Pull all customers from ObjectType 1 → upsert into `clients` table |
| `fireberry-tokens-sync` | Every 6 hours | Pull all ObjectType 1013 records → update tokens in `ad_accounts` |
| Manual trigger | On demand | `POST /api/v1/fireberry/sync-clients` and `/sync-tokens` |

Phone number normalization (Israeli format):
- `972501234567` → `0501234567` → `501234567` (match all variants)

---

## Token Management

### Dual Token Model

The platform supports two token sources, resolved per API call:

**Option A — Global Business Manager Token**
- Single system user token from Facebook Business Manager
- Has access to all managed client ad accounts
- Stored in `.env` as `META_BUSINESS_TOKEN`
- Used as fallback when no per-account token exists

**Option B — Per-Client Tokens (from Fireberry)**
- Individual tokens stored in Fireberry ObjectType 1013 field `pcfsystemfield100`
- Synced to the `ad_accounts` table
- Takes priority over the business token when available

### Token Resolution Order

```
1. Per-account token from Fireberry (if exists and not expired)
   → 2. Business Manager token (if use_business_token = true)
     → 3. No valid token → mark account, skip sync, log warning
```

### Token Lifecycle

- Long-lived user tokens expire in **60 days**
- Tokens are refreshed by the client in Fireberry — we just read them
- Weekly cron job checks expiry, warns 7 days before
- Fireberry token sync every 6 hours picks up new/refreshed tokens
- Token validity verified before every Meta API sync run

---

## Project Structure

```
ads-mangment/
├── docker-compose.yml
├── .env.example
├── .env
├── ARCHITECTURE.md
├── idea.md
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js                    # Entry point
│   ├── knexfile.js                  # Knex config
│   │
│   ├── config/
│   │   ├── db.js                    # Knex instance + connection
│   │   ├── meta-api.js              # Meta API constants, version, base URL
│   │   └── auth.js                  # JWT secret, token expiry
│   │
│   ├── migrations/
│   │   ├── 001_create_industries.js
│   │   ├── 002_create_clients.js
│   │   ├── 003_create_ad_accounts.js
│   │   ├── 004_create_campaigns.js
│   │   ├── 005_create_adsets.js
│   │   ├── 006_create_ads.js
│   │   ├── 007_create_performance_snapshots.js
│   │   ├── 008_create_users.js
│   │   ├── 009_create_sync_logs.js
│   │   ├── 010_create_saved_queries.js
│   │   └── 011_create_api_keys.js
│   │
│   ├── seeds/
│   │   ├── 01_industries.js
│   │   └── 02_demo_user.js
│   │
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── fireberry.routes.js      # Fireberry sync triggers + status
│   │   ├── clients.routes.js
│   │   ├── ad-accounts.routes.js
│   │   ├── campaigns.routes.js
│   │   ├── adsets.routes.js
│   │   ├── ads.routes.js
│   │   ├── performance.routes.js
│   │   ├── industries.routes.js
│   │   ├── sync.routes.js
│   │   ├── dashboard.routes.js
│   │   ├── gallery.routes.js
│   │   ├── query.routes.js          # Query API (raw + builder + saved)
│   │   └── export.routes.js
│   │
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── fireberry.controller.js
│   │   ├── clients.controller.js
│   │   ├── ad-accounts.controller.js
│   │   ├── campaigns.controller.js
│   │   ├── adsets.controller.js
│   │   ├── ads.controller.js
│   │   ├── performance.controller.js
│   │   ├── industries.controller.js
│   │   ├── sync.controller.js
│   │   ├── dashboard.controller.js
│   │   ├── gallery.controller.js
│   │   ├── query.controller.js
│   │   └── export.controller.js
│   │
│   ├── services/
│   │   ├── fireberry.service.js     # Fireberry API client (query, read, update)
│   │   ├── fireberry-sync.service.js # Sync clients + tokens from Fireberry
│   │   ├── meta-api.service.js      # All Facebook/Meta API calls
│   │   ├── sync.service.js          # Orchestrates full Meta data sync flow
│   │   ├── token-resolver.service.js # Dual token resolution logic
│   │   ├── media.service.js         # Download + store creatives locally
│   │   ├── dashboard.service.js     # Aggregation queries
│   │   ├── query-raw.service.js     # SQL parsing, validation, read-only exec
│   │   ├── query-builder.service.js # JSON → Knex query construction
│   │   ├── query-schema.service.js  # Table/column introspection
│   │   ├── export.service.js        # CSV/PDF generation
│   │   └── cache.service.js         # In-memory cache wrapper
│   │
│   ├── jobs/
│   │   ├── index.js                 # Registers all cron jobs
│   │   ├── daily-sync.job.js        # Full Meta data sync (3 AM)
│   │   ├── incremental-sync.job.js  # Active campaigns every 2 hours
│   │   ├── fireberry-sync.job.js    # Sync clients + tokens from Fireberry (every 6h)
│   │   └── token-check.job.js       # Weekly token validity check
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.js       # JWT + API Key verification
│   │   ├── query-guard.middleware.js # SQL sanitization, timeout, row limits
│   │   └── error.middleware.js      # Global error handler
│   │
│   ├── utils/
│   │   ├── logger.js
│   │   ├── meta-helpers.js          # Pagination, rate-limit helpers
│   │   └── kpi-calculator.js        # Derived KPI computations
│   │
│   └── data/
│       └── media/                   # Docker volume mount point
│           ├── images/
│           └── videos/
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── index.html
│   │
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   │
│   │   ├── api/
│   │   │   ├── client.js            # Axios instance with JWT interceptor
│   │   │   ├── auth.api.js
│   │   │   ├── clients.api.js
│   │   │   ├── campaigns.api.js
│   │   │   ├── ads.api.js
│   │   │   ├── performance.api.js
│   │   │   ├── dashboard.api.js
│   │   │   ├── query.api.js         # Query API calls
│   │   │   ├── sync.api.js
│   │   │   └── export.api.js
│   │   │
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── IndustryOverviewPage.jsx
│   │   │   ├── IndustryDetailPage.jsx
│   │   │   ├── ClientListPage.jsx
│   │   │   ├── ClientDetailPage.jsx
│   │   │   ├── CampaignDetailPage.jsx
│   │   │   ├── CreativeGalleryPage.jsx
│   │   │   ├── AdDetailPage.jsx
│   │   │   ├── QueryExplorerPage.jsx  # Raw SQL + Builder UI
│   │   │   ├── SyncStatusPage.jsx
│   │   │   └── SettingsPage.jsx
│   │   │
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   ├── TopBar.jsx
│   │   │   │   └── MainLayout.jsx
│   │   │   ├── filters/
│   │   │   │   ├── FilterBar.jsx
│   │   │   │   ├── DateRangePicker.jsx
│   │   │   │   ├── IndustryFilter.jsx
│   │   │   │   ├── StatusFilter.jsx
│   │   │   │   └── ClientFilter.jsx
│   │   │   ├── charts/
│   │   │   │   ├── SpendChart.jsx
│   │   │   │   ├── KPICard.jsx
│   │   │   │   ├── TrendLine.jsx
│   │   │   │   └── ComparisonBar.jsx
│   │   │   ├── gallery/
│   │   │   │   ├── CreativeCard.jsx
│   │   │   │   ├── CreativeGrid.jsx
│   │   │   │   └── MediaViewer.jsx
│   │   │   ├── query/
│   │   │   │   ├── RawQueryEditor.jsx
│   │   │   │   ├── QueryBuilder.jsx
│   │   │   │   ├── ResultsTable.jsx
│   │   │   │   └── SavedQueries.jsx
│   │   │   ├── tables/
│   │   │   │   ├── CampaignTable.jsx
│   │   │   │   ├── AdTable.jsx
│   │   │   │   └── SortableHeader.jsx
│   │   │   └── common/
│   │   │       ├── Loader.jsx
│   │   │       ├── Badge.jsx
│   │   │       ├── Modal.jsx
│   │   │       └── Pagination.jsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useAuth.js
│   │   │   ├── useFilters.js
│   │   │   ├── useDashboard.js
│   │   │   └── usePagination.js
│   │   │
│   │   ├── context/
│   │   │   ├── AuthContext.jsx
│   │   │   └── FilterContext.jsx
│   │   │
│   │   └── utils/
│   │       ├── formatters.js        # Currency, percentage, date
│   │       └── constants.js         # Status labels, KPI definitions
│   │
│   └── public/
│       └── favicon.ico
│
└── scripts/
    ├── setup.sh                     # First-time setup helper
    └── reset-db.sh                  # Drop and recreate DB
```

---

## Database Schema

### Entity Relationship

```
industries
    |
    +--< clients
            |
            +--< ad_accounts
                    |
                    +--< campaigns
                            |
                            +--< adsets
                            |       |
                            |       +--< ads
                            |
                            +--< performance_snapshots
                                    (also linked to adsets, ads)

users ──< saved_queries
users ──< api_keys
sync_logs (linked to ad_accounts)
```

### Tables

#### industries
```sql
CREATE TABLE industries (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE,
    parent_id     INTEGER REFERENCES industries(id),
    tags          TEXT[],
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

#### clients
```sql
CREATE TABLE clients (
    id                    SERIAL PRIMARY KEY,
    fireberry_account_id  VARCHAR(100) UNIQUE,     -- Fireberry ObjectType 1 accountid
    client_name           VARCHAR(200) NOT NULL,
    brand_name            VARCHAR(200),
    industry_id           INTEGER REFERENCES industries(id),
    contact_name          VARCHAR(200),
    contact_email         VARCHAR(200),
    contact_phone         VARCHAR(50),
    account_manager       VARCHAR(200),
    logo_url              TEXT,                     -- From Fireberry pcfsystemfield1445
    website_url           TEXT,                     -- From Fireberry websiteurl
    drive_url             TEXT,                     -- From Fireberry pcfsystemfield114
    fireberry_status      VARCHAR(50),              -- From Fireberry statuscode
    notes                 TEXT,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

#### ad_accounts
```sql
CREATE TABLE ad_accounts (
    id                     VARCHAR(50) PRIMARY KEY,   -- Meta's act_XXXXX
    client_id              INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    fireberry_record_id    VARCHAR(100),              -- ObjectType 1013 customobject1013id
    account_name           VARCHAR(200),
    page_id                VARCHAR(100),              -- Facebook Page ID (from Fireberry pcfsystemfield104)
    currency               VARCHAR(10) DEFAULT 'USD',
    timezone               VARCHAR(50),
    status                 VARCHAR(20),               -- ACTIVE, DISABLED, etc.
    access_token           TEXT,                       -- Per-client token (from Fireberry pcfsystemfield100)
    token_type             VARCHAR(20),                -- 'system_user' | 'user' | null
    token_expires          TIMESTAMPTZ,
    token_source           VARCHAR(20) DEFAULT 'fireberry', -- 'fireberry' | 'manual' | 'business'
    use_business_token     BOOLEAN DEFAULT true,       -- Fallback to global token
    is_active              BOOLEAN DEFAULT true,
    last_synced_at         TIMESTAMPTZ,
    last_token_sync        TIMESTAMPTZ,               -- Last time token was refreshed from Fireberry
    created_at             TIMESTAMPTZ DEFAULT NOW()
);
```

#### campaigns
```sql
CREATE TABLE campaigns (
    id              VARCHAR(50) PRIMARY KEY,      -- Meta campaign ID
    ad_account_id   VARCHAR(50) REFERENCES ad_accounts(id) ON DELETE CASCADE,
    client_id       INTEGER REFERENCES clients(id),
    name            VARCHAR(500),
    objective       VARCHAR(100),
    status          VARCHAR(50),                  -- ACTIVE, PAUSED, ARCHIVED, DELETED
    buying_type     VARCHAR(50),
    daily_budget    BIGINT,                       -- In cents
    lifetime_budget BIGINT,
    start_date      DATE,
    end_date        DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### adsets
```sql
CREATE TABLE adsets (
    id                VARCHAR(50) PRIMARY KEY,
    campaign_id       VARCHAR(50) REFERENCES campaigns(id) ON DELETE CASCADE,
    name              VARCHAR(500),
    status            VARCHAR(50),
    optimization_goal VARCHAR(100),
    daily_budget      BIGINT,
    lifetime_budget   BIGINT,
    targeting         JSONB,
    placements        JSONB,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

#### ads
```sql
CREATE TABLE ads (
    id              VARCHAR(50) PRIMARY KEY,
    adset_id        VARCHAR(50) REFERENCES adsets(id) ON DELETE CASCADE,
    campaign_id     VARCHAR(50) REFERENCES campaigns(id),
    client_id       INTEGER REFERENCES clients(id),
    name            VARCHAR(500),
    status          VARCHAR(50),
    creative_id     VARCHAR(50),
    image_url       TEXT,
    video_url       TEXT,
    thumbnail_url   TEXT,
    local_image     VARCHAR(500),                -- Local path after download
    local_video     VARCHAR(500),
    body_text       TEXT,                        -- Ad copy
    cta_type        VARCHAR(50),
    link_url        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### performance_snapshots
```sql
CREATE TABLE performance_snapshots (
    id              SERIAL PRIMARY KEY,
    date            DATE NOT NULL,
    ad_account_id   VARCHAR(50) REFERENCES ad_accounts(id),
    campaign_id     VARCHAR(50) REFERENCES campaigns(id),
    adset_id        VARCHAR(50),
    ad_id           VARCHAR(50),
    level           VARCHAR(20) NOT NULL,        -- 'campaign', 'adset', 'ad'
    impressions     BIGINT DEFAULT 0,
    reach           BIGINT DEFAULT 0,
    clicks          BIGINT DEFAULT 0,
    ctr             NUMERIC(8,4),
    cpc             NUMERIC(10,4),
    cpm             NUMERIC(10,4),
    spend           NUMERIC(12,4) DEFAULT 0,
    leads           INTEGER DEFAULT 0,
    purchases       INTEGER DEFAULT 0,
    roas            NUMERIC(10,4),
    frequency       NUMERIC(8,4),
    conversions     INTEGER DEFAULT 0,
    cost_per_result NUMERIC(10,4),
    actions         JSONB,                       -- Raw actions array from Meta
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(date, ad_id, level)
);

CREATE INDEX idx_perf_date ON performance_snapshots(date);
CREATE INDEX idx_perf_campaign ON performance_snapshots(campaign_id, date);
CREATE INDEX idx_perf_ad ON performance_snapshots(ad_id, date);
CREATE INDEX idx_perf_account_date ON performance_snapshots(ad_account_id, date);
```

#### users
```sql
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(200) UNIQUE NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    name          VARCHAR(200),
    role          VARCHAR(20) DEFAULT 'viewer',  -- admin, manager, viewer
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

#### sync_logs
```sql
CREATE TABLE sync_logs (
    id              SERIAL PRIMARY KEY,
    ad_account_id   VARCHAR(50),
    sync_type       VARCHAR(20),                 -- 'full', 'incremental'
    status          VARCHAR(20),                 -- 'running', 'completed', 'failed'
    token_source    VARCHAR(20),                 -- 'account', 'business'
    records_synced  INTEGER DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);
```

#### saved_queries
```sql
CREATE TABLE saved_queries (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    type        VARCHAR(10) NOT NULL,            -- 'raw' or 'builder'
    query_body  JSONB NOT NULL,
    is_public   BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

#### api_keys
```sql
CREATE TABLE api_keys (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    key_hash    VARCHAR(200) NOT NULL,
    name        VARCHAR(200),
    permissions VARCHAR(20) DEFAULT 'read',
    last_used   TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API Endpoints

All routes prefixed with `/api/v1/`.

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Email + password → JWT |
| POST | `/auth/register` | Create user (admin only) |
| GET | `/auth/me` | Current user info |

### Fireberry
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/fireberry/sync-clients` | Pull all clients from Fireberry ObjectType 1 → upsert |
| POST | `/fireberry/sync-tokens` | Pull all tokens from Fireberry ObjectType 1013 → update ad_accounts |
| POST | `/fireberry/sync-all` | Run both syncs |
| GET | `/fireberry/status` | Last sync timestamps, record counts, errors |
| GET | `/fireberry/preview-clients` | Preview what would be imported (dry run) |
| GET | `/fireberry/preview-tokens` | Preview tokens that would be updated (dry run) |

### Clients
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clients` | List all (with industry, pagination) |
| GET | `/clients/:id` | Detail with ad accounts, campaign counts |
| POST | `/clients` | Create |
| PUT | `/clients/:id` | Update |
| DELETE | `/clients/:id` | Soft delete |

### Ad Accounts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ad-accounts` | List all |
| GET | `/ad-accounts/discover` | Auto-discover from Business Manager |
| POST | `/ad-accounts/import` | Import selected accounts with tokens |
| POST | `/ad-accounts/import-all` | Import all using business token |
| PUT | `/ad-accounts/:id` | Update token/settings |
| DELETE | `/ad-accounts/:id` | Disconnect |
| GET | `/ad-accounts/:id/token-status` | Check token validity + expiry |
| POST | `/ad-accounts/:id/refresh-token` | Update token manually |
| POST | `/ad-accounts/validate-all` | Bulk check all tokens |

### Campaigns / Ad Sets / Ads
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/campaigns?client_id=&status=&objective=&date_from=&date_to=` | Filtered list |
| GET | `/campaigns/:id` | Campaign detail |
| GET | `/campaigns/:id/adsets` | Ad sets for campaign |
| GET | `/adsets/:id/ads` | Ads for ad set |
| GET | `/ads/:id` | Ad detail |
| GET | `/ads/:id/performance?date_from=&date_to=` | Performance history |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard/overview?date_from=&date_to=` | Total spend, leads, ROAS |
| GET | `/dashboard/by-industry?date_from=&date_to=` | KPIs per industry |
| GET | `/dashboard/by-client/:id?date_from=&date_to=` | KPIs for one client |
| GET | `/dashboard/top-ads?sort_by=ctr&limit=20` | Best performing ads |
| GET | `/performance/trends?campaign_id=&metric=spend&granularity=day` | Time series |

### Creative Gallery
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/gallery?industry=&client=&status=&sort=ctr&type=image` | Paginated grid |
| GET | `/gallery/:ad_id` | Single ad with full metrics + media |

### Industries
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/industries` | List with client counts |
| POST | `/industries` | Create |
| PUT | `/industries/:id` | Update |
| DELETE | `/industries/:id` | Delete (only if no clients) |

### Sync
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sync/trigger/:ad_account_id` | Manual sync one account |
| POST | `/sync/trigger-all` | Manual full sync |
| GET | `/sync/status` | Recent sync logs |
| GET | `/sync/status/:id` | Detail of one sync run |

### Query API
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/query/raw` | Admin only | Execute read-only SQL |
| POST | `/query/builder` | All roles + API Key | Structured JSON query |
| GET | `/query/schema` | All roles + API Key | List queryable tables |
| GET | `/query/schema/:table` | All roles + API Key | Columns, types, relationships |
| GET | `/query/schema/relationships` | All roles + API Key | All join paths |
| POST | `/query/saved` | Admin + Manager | Save a query |
| GET | `/query/saved` | All roles | List saved queries |
| GET | `/query/saved/:id` | All roles | Get saved query |
| POST | `/query/saved/:id/run` | All roles + API Key | Execute saved query |
| DELETE | `/query/saved/:id` | Owner or Admin | Delete saved query |

### Export (Phase 2)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/export/csv?type=campaigns&filters=...` | Download CSV |
| GET | `/export/pdf/client/:id?date_from=&date_to=` | Client report PDF |

---

## Query API Details

### Raw SQL Endpoint

```
POST /api/v1/query/raw
Authorization: Bearer <admin-jwt>
```
```json
{
    "sql": "SELECT c.name, SUM(ps.spend) as total_spend FROM campaigns c JOIN performance_snapshots ps ON ps.campaign_id = c.id WHERE ps.date >= '2026-01-01' GROUP BY c.name ORDER BY total_spend DESC",
    "params": [],
    "limit": 100,
    "offset": 0
}
```

**Safeguards:**
- Read-only — only `SELECT` statements, wrapped in read-only transaction
- Admin role required
- 10s query timeout
- Max 10,000 rows per request
- Blocks `pg_*` and `information_schema` access (except whitelist)

### Structured Query Builder

```
POST /api/v1/query/builder
Authorization: Bearer <jwt> | X-API-Key: ak_xxx
```
```json
{
    "entity": "ads",
    "joins": ["campaigns", "clients", "performance_snapshots"],
    "fields": [
        "ads.name",
        "clients.client_name",
        "campaigns.objective",
        "SUM(performance_snapshots.spend) as total_spend",
        "AVG(performance_snapshots.ctr) as avg_ctr"
    ],
    "filters": {
        "clients.industry_id": 3,
        "campaigns.status": "ACTIVE",
        "performance_snapshots.date": { "gte": "2026-01-01", "lte": "2026-03-26" }
    },
    "group_by": ["ads.name", "clients.client_name", "campaigns.objective"],
    "order_by": { "field": "total_spend", "direction": "desc" },
    "limit": 50,
    "offset": 0
}
```

**Features:**
- Whitelisted entities: `clients`, `campaigns`, `adsets`, `ads`, `performance_snapshots`, `industries`, `ad_accounts`
- Pre-defined join relationships (no arbitrary joins)
- Aggregations: `SUM`, `AVG`, `COUNT`, `MIN`, `MAX`
- Filter operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `like`, `between`
- Pagination built-in

### Query API Permissions

| Feature | Admin | Manager | Viewer | API Key |
|---------|-------|---------|--------|---------|
| Raw SQL | Yes | No | No | No |
| Query Builder | Yes | Yes | Yes | Yes |
| Save Queries | Yes | Yes | No | No |
| Schema Discovery | Yes | Yes | Yes | Yes |

---

## Data Sync Strategy

### Meta API Fields

1. **Campaigns**: `GET /{ad_account_id}/campaigns?fields=id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time,buying_type`
2. **Ad Sets**: `GET /{campaign_id}/adsets?fields=id,name,status,optimization_goal,daily_budget,lifetime_budget,targeting,publisher_platforms`
3. **Ads**: `GET /{adset_id}/ads?fields=id,name,status,creative{id,image_url,video_id,body,call_to_action_type,thumbnail_url}`
4. **Insights**: `GET /{object_id}/insights?fields=impressions,reach,clicks,ctr,cpc,cpm,spend,actions,cost_per_action_type,frequency&time_increment=1`

### Sync Flow

```
For each ad_account where is_active = true:
  1. Resolve token (per-account → business → skip)
  2. Validate token: GET /me?access_token=...
  3. If invalid → mark account, log error, skip
  4. Fetch all campaigns (cursor pagination) → upsert
  5. For each campaign → fetch ad sets → upsert
  6. For each ad set → fetch ads → upsert
  7. For each ad with image/video URL:
     - Check if local file exists
     - If not → download to /data/media/, generate thumbnail
  8. Fetch insights for date range:
     - Full sync: last 90 days
     - Incremental: last 2 days
  9. Upsert performance_snapshots (ON CONFLICT DO UPDATE)
  10. Update ad_account.last_synced_at
  11. Write sync_log entry with token_source
```

### Sync Schedule

| Job | Schedule | Scope |
|-----|----------|-------|
| `fireberry-sync` | `0 */6 * * *` (every 6h) | Sync clients + tokens from Fireberry |
| `daily-sync` | `0 3 * * *` (3:00 AM) | All accounts, 90 days insights |
| `incremental-sync` | `0 */2 * * *` (every 2h) | Active campaigns, last 2 days |
| `token-check` | `0 8 * * 1` (Monday 8 AM) | Check all token expiry |

**Sync order matters:** Fireberry sync runs first (tokens updated) → then Meta sync uses those tokens.

### Rate Limiting

- Cursor-based pagination (not offset)
- 200ms delay between API calls per account
- Respect `x-business-use-case-usage` headers
- Exponential backoff on 429 responses
- All API errors logged to sync_logs

---

## Local Media Storage

### Structure

```
/data/media/
├── images/
│   └── {ad_account_id}/
│       ├── {ad_id}_original.jpg
│       └── {ad_id}_thumb.jpg        # 300px thumbnail via sharp
└── videos/
    └── {ad_account_id}/
        ├── {ad_id}_original.mp4
        └── {ad_id}_thumb.jpg        # Video thumbnail from Meta
```

### Serving

```javascript
app.use('/media', express.static('data/media'));
```

Frontend references: `/media/images/{account_id}/{ad_id}_thumb.jpg`

### Config

- `DOWNLOAD_VIDEOS=false` in `.env` to skip video downloads (store Meta URLs + thumbnails only)
- Estimated storage: ~2-5 GB for images, 10-20 GB with videos (50 clients, 2000 ads)

---

## Authentication

### JWT Auth (Internal Users)

1. Admin creates users via `/api/v1/auth/register`
2. Login: POST email + password → bcrypt compare → JWT (24h expiry)
3. Every `/api/v1/*` route (except `/auth/login`) validates `Authorization: Bearer <token>`
4. Roles: `admin` (full access), `manager` (read/write), `viewer` (read-only)
5. First run: seed creates default admin from `.env` variables

### API Key Auth (External Tools)

- For BI dashboards, Retool, external services
- Generated via Settings page, stored hashed in `api_keys` table
- Sent via `X-API-Key` header
- Read-only access to Query Builder and Schema endpoints
- Auth middleware checks JWT first, falls back to API Key

---

## Docker Compose

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ads_dashboard
      POSTGRES_USER: ads_user
      POSTGRES_PASSWORD: ${DB_PASSWORD:-localdev123}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ads_user -d ads_dashboard"]
      interval: 5s
      retries: 5

  backend:
    build: ./backend
    environment:
      NODE_ENV: production
      PORT: 3800
      DATABASE_URL: postgres://ads_user:${DB_PASSWORD:-localdev123}@postgres:5432/ads_dashboard
      JWT_SECRET: ${JWT_SECRET:-change-me-in-production}
      FIREBERRY_TOKEN: ${FIREBERRY_TOKEN}
      FIREBERRY_API_URL: ${FIREBERRY_API_URL:-https://api.powerlink.co.il/api}
      META_BUSINESS_ID: ${META_BUSINESS_ID}
      META_BUSINESS_TOKEN: ${META_BUSINESS_TOKEN}
      META_API_VERSION: ${META_API_VERSION:-v21.0}
      DEFAULT_ADMIN_EMAIL: ${DEFAULT_ADMIN_EMAIL:-admin@local}
      DEFAULT_ADMIN_PASSWORD: ${DEFAULT_ADMIN_PASSWORD:-admin123}
      DOWNLOAD_VIDEOS: ${DOWNLOAD_VIDEOS:-false}
    volumes:
      - media_data:/app/data/media
    ports:
      - "3800:3800"
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

volumes:
  pgdata:
  media_data:
```

---

## Environment Variables

```env
# Fireberry (PowerLink CRM) — Source of truth for clients + tokens
FIREBERRY_TOKEN=your-fireberry-token-here
FIREBERRY_API_URL=https://api.powerlink.co.il/api

# Facebook Business Manager
META_BUSINESS_ID=123456789
META_BUSINESS_TOKEN=EAAxxxxxxx
META_API_VERSION=v21.0

# Database
DB_PASSWORD=localdev123

# Auth
JWT_SECRET=change-me-in-production
DEFAULT_ADMIN_EMAIL=admin@local
DEFAULT_ADMIN_PASSWORD=admin123

# Media
DOWNLOAD_VIDEOS=false
```

---

## Frontend Routing

```
/login                      → LoginPage
/                           → DashboardPage
/industries                 → IndustryOverviewPage
/industries/:id             → IndustryDetailPage
/clients                    → ClientListPage
/clients/:id                → ClientDetailPage
/clients/:id/campaigns/:cid → CampaignDetailPage
/gallery                    → CreativeGalleryPage
/ads/:id                    → AdDetailPage
/query                      → QueryExplorerPage
/sync                       → SyncStatusPage
/settings                   → SettingsPage
```

---

## MVP Phases

### Phase 1 — Core
- Docker Compose + Postgres + migrations
- Auth (JWT + API Keys)
- Industry + Client CRUD
- Ad Account import (discover from Business Manager + manual token entry)
- Token resolver service (dual token model)
- Sync service (campaigns, ad sets, ads, insights)
- Media download service
- Dashboard overview + filters
- Creative gallery
- Query API (raw + builder + schema + saved queries)

### Phase 2 — Analytics
- Trend charts (Recharts time series)
- Industry benchmark calculations
- Performance alerts (threshold-based)
- CSV/PDF export
- Improved sync (error recovery, partial retries)

### Phase 3 — Intelligence
- AI creative tagging
- Auto insights generation
- "Similar winning ads" clustering by industry
- Recommendations engine
