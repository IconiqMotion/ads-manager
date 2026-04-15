const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ads Manager API',
      version: '1.0.0',
      description: 'Facebook Ads Management Platform API',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth' },
      { name: 'Clients' },
      { name: 'Campaigns' },
      { name: 'Ad Sets' },
      { name: 'Ads' },
      { name: 'Gallery' },
      { name: 'Industries' },
      { name: 'Dashboard' },
      { name: 'Intelligence' },
      { name: 'Alerts' },
      { name: 'Sync' },
      { name: 'Query' },
      { name: 'Export' },
      { name: 'Ad Accounts' },
    ],
    paths: {
      // ── AUTH ──────────────────────────────────────────────
      '/auth/login': {
        post: {
          tags: ['Auth'], summary: 'Login',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' } }, required: ['email', 'password'] } } } },
          responses: { 200: { description: 'JWT token' }, 401: { description: 'Invalid credentials' } },
          security: []
        }
      },
      '/auth/me': {
        get: { tags: ['Auth'], summary: 'Get current user', responses: { 200: { description: 'User object' } } }
      },

      // ── CLIENTS ───────────────────────────────────────────
      '/clients': {
        get: {
          tags: ['Clients'], summary: 'List clients',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'industry_id', in: 'query', schema: { type: 'integer' } },
          ],
          responses: { 200: { description: 'Paginated client list' } }
        },
        post: {
          tags: ['Clients'], summary: 'Create client',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { client_name: { type: 'string' }, brand_name: { type: 'string' }, industry_id: { type: 'integer' } } } } } },
          responses: { 201: { description: 'Created client' } }
        }
      },
      '/clients/{id}': {
        get: { tags: ['Clients'], summary: 'Get client by ID', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Client object' }, 404: { description: 'Not found' } } },
        put: { tags: ['Clients'], summary: 'Update client', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { client_name: { type: 'string' }, industry_id: { type: 'integer' } } } } } }, responses: { 200: { description: 'Updated client' } } },
        delete: { tags: ['Clients'], summary: 'Delete client', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 204: { description: 'Deleted' } } }
      },

      // ── CAMPAIGNS ─────────────────────────────────────────
      '/campaigns': {
        get: {
          tags: ['Campaigns'], summary: 'List campaigns',
          parameters: [
            { name: 'client_id', in: 'query', schema: { type: 'integer' } },
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'] } },
          ],
          responses: { 200: { description: 'Campaign list' } }
        }
      },
      '/campaigns/{id}': {
        get: { tags: ['Campaigns'], summary: 'Get campaign', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Campaign object' } } }
      },
      '/campaigns/{id}/adsets': {
        get: { tags: ['Campaigns'], summary: 'Get ad sets for campaign', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Ad sets list' } } }
      },

      // ── AD SETS ───────────────────────────────────────────
      '/adsets/{id}/ads': {
        get: { tags: ['Ad Sets'], summary: 'Get ads for ad set', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Ads list' } } }
      },

      // ── ADS ───────────────────────────────────────────────
      '/ads/{id}': {
        get: { tags: ['Ads'], summary: 'Get ad by ID', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Ad object with resolved industry' } } }
      },
      '/ads/{id}/performance': {
        get: {
          tags: ['Ads'], summary: 'Get ad performance snapshots',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: { 200: { description: 'Daily performance snapshots' } }
        }
      },
      '/ads/{id}/industry': {
        patch: {
          tags: ['Ads'], summary: 'Manually set ad industry',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { industry_id: { type: 'integer', nullable: true } } } } } },
          responses: { 200: { description: 'Updated industry' } }
        }
      },
      '/ads/{id}/classify-industry': {
        post: {
          tags: ['Ads'], summary: 'AI-classify ad industry using GPT',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Classified industry' }, 422: { description: 'Classification failed' } }
        }
      },

      // ── GALLERY ───────────────────────────────────────────
      '/gallery': {
        get: {
          tags: ['Gallery'], summary: 'List ads for creative gallery',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 24 } },
            { name: 'sort', in: 'query', schema: { type: 'string', enum: ['spend', 'ctr', 'cpc', 'leads'] } },
            { name: 'industry', in: 'query', schema: { type: 'integer' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'client_id', in: 'query', schema: { type: 'integer' } },
            { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: { 200: { description: 'Paginated ad creatives with performance' } }
        }
      },

      // ── INDUSTRIES ────────────────────────────────────────
      '/industries': {
        get: { tags: ['Industries'], summary: 'List all industries', responses: { 200: { description: 'Industry list' } } },
        post: { tags: ['Industries'], summary: 'Create industry', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } } }, responses: { 201: { description: 'Created' } } }
      },
      '/industries/{id}': {
        put: { tags: ['Industries'], summary: 'Update industry', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } } }, responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['Industries'], summary: 'Delete industry', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 204: { description: 'Deleted' } } }
      },
      '/industries/classify': {
        post: { tags: ['Industries'], summary: 'Classify all clients from Facebook page categories', responses: { 200: { description: 'Classification result' } } }
      },

      // ── DASHBOARD ─────────────────────────────────────────
      '/dashboard/overview': {
        get: {
          tags: ['Dashboard'], summary: 'Get dashboard KPIs overview',
          parameters: [
            { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: { 200: { description: 'KPI metrics' } }
        }
      },
      '/dashboard/by-industry': {
        get: { tags: ['Dashboard'], summary: 'Performance breakdown by industry', responses: { 200: { description: 'Industry metrics' } } }
      },
      '/dashboard/by-client/{id}': {
        get: {
          tags: ['Dashboard'], summary: 'Performance for a specific client',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: 'Client metrics' } }
        }
      },
      '/dashboard/top-ads': {
        get: { tags: ['Dashboard'], summary: 'Top performing ads', responses: { 200: { description: 'Top ads list' } } }
      },
      '/dashboard/trends/compare': {
        get: { tags: ['Dashboard'], summary: 'Compare trends across periods', responses: { 200: { description: 'Trend comparison' } } }
      },
      '/dashboard/benchmarks': {
        get: { tags: ['Dashboard'], summary: 'Industry benchmarks', responses: { 200: { description: 'Benchmark data' } } }
      },

      // ── ALERTS ────────────────────────────────────────────
      '/alerts/rules': {
        get: { tags: ['Alerts'], summary: 'List alert rules', responses: { 200: { description: 'Alert rules list' } } },
        post: { tags: ['Alerts'], summary: 'Create alert rule', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 201: { description: 'Created' } } }
      },
      '/alerts/rules/{id}': {
        delete: { tags: ['Alerts'], summary: 'Delete alert rule', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 204: { description: 'Deleted' } } }
      },
      '/alerts/triggers': {
        get: { tags: ['Alerts'], summary: 'List alert triggers', responses: { 200: { description: 'Triggers list' } } }
      },
      '/alerts/triggers/unread-count': {
        get: { tags: ['Alerts'], summary: 'Get unread trigger count', responses: { 200: { description: 'Count' } } }
      },
      '/alerts/triggers/mark-read': {
        post: { tags: ['Alerts'], summary: 'Mark triggers as read', responses: { 200: { description: 'Marked' } } }
      },
      '/alerts/evaluate': {
        post: { tags: ['Alerts'], summary: 'Manually trigger alert evaluation', responses: { 200: { description: 'Evaluation result' } } }
      },

      // ── SYNC ──────────────────────────────────────────────
      '/sync/status': {
        get: { tags: ['Sync'], summary: 'Get sync status and logs', responses: { 200: { description: 'Sync logs' } } }
      },
      '/sync/trigger': {
        post: { tags: ['Sync'], summary: 'Manually trigger a sync', responses: { 200: { description: 'Sync started' } } }
      },

      // ── QUERY ─────────────────────────────────────────────
      '/query': {
        post: {
          tags: ['Query'], summary: 'Run a custom query',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'object' } } } } } },
          responses: { 200: { description: 'Query results' } }
        }
      },

      // ── EXPORT ────────────────────────────────────────────
      '/export/csv': {
        get: {
          tags: ['Export'], summary: 'Export data as CSV',
          parameters: [{ name: 'type', in: 'query', required: true, schema: { type: 'string', enum: ['campaigns', 'ads', 'clients'] } }],
          responses: { 200: { description: 'CSV file download' } }
        }
      },

      // ── AD ACCOUNTS ───────────────────────────────────────
      '/ad-accounts': {
        get: {
          tags: ['Ad Accounts'], summary: 'List ad accounts',
          parameters: [{ name: 'client_id', in: 'query', schema: { type: 'integer' } }],
          responses: { 200: { description: 'Ad account list' } }
        }
      },

      // ── INTELLIGENCE ──────────────────────────────────────
      '/intelligence/insights': {
        get: { tags: ['Intelligence'], summary: 'List AI insights', responses: { 200: { description: 'Insights list' } } }
      },
      '/intelligence/insights/generate': {
        post: { tags: ['Intelligence'], summary: 'Generate new AI insights (admin)', responses: { 200: { description: 'Generation result' } } }
      },
      '/intelligence/insights/mark-read': {
        post: { tags: ['Intelligence'], summary: 'Mark insights as read', responses: { 200: { description: 'Marked' } } }
      },
      '/intelligence/tag/{id}': {
        post: { tags: ['Intelligence'], summary: 'Tag single ad with AI industry (admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Tagged' } } }
      },
      '/intelligence/tag-batch': {
        post: { tags: ['Intelligence'], summary: 'Batch tag unclassified ads (admin)', responses: { 200: { description: 'Batch result' } } }
      },
      '/intelligence/similar/{id}': {
        get: { tags: ['Intelligence'], summary: 'Find ads similar to a given ad', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Similar ads' } } }
      },
      '/intelligence/industry-styles/{id}': {
        get: { tags: ['Intelligence'], summary: 'Get style analysis for an industry', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Style data' } } }
      },
      '/intelligence/budget-recommendations/{id}': {
        get: { tags: ['Intelligence'], summary: 'Get budget recommendations for a client', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Budget recommendations' } } }
      },
      '/intelligence/creative-recommendations/{id}': {
        get: { tags: ['Intelligence'], summary: 'Get creative recommendations for a client', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Creative recommendations' } } }
      },
    }
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

function setupSwagger(app) {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Ads Manager API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
  }));
  app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));
}

module.exports = setupSwagger;
