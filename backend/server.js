const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { log, generateId } = require('./utils/logger');
const errorHandler = require('./middlewares/error.middleware');
const db = require('./config/db');
const envConfig = require('./config/env');

envConfig.validate();

const app = express();
const PORT = process.env.PORT || 3800;

// Trust nginx/ALB in front of the app so req.ip reflects the client
app.set('trust proxy', 1);

// --- Middleware ---
app.use(helmet());

const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({
  origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()) : true,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  const requestId = generateId();
  req.requestId = requestId;
  const startTime = Date.now();

  log('INFO', 'http', 'Request', {
    requestId,
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    log(level, 'http', 'Response', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration
    });
  });

  next();
});

// Static media serving
const setupSwagger = require('./config/swagger');
setupSwagger(app);

const storage = require('./services/storage.service');
if (storage.isS3()) {
  app.get('/media/*', (req, res) => {
    const key = req.params[0];
    return res.redirect(302, storage.publicUrl(key));
  });
} else {
  app.use('/media', express.static(path.join(__dirname, 'data/media')));
}

// --- Health Check ---
app.get('/api/v1/health', async (req, res) => {
  const checks = {};
  const startTime = Date.now();

  // Database connection
  try {
    await db.raw('SELECT 1');
    checks.database = { status: 'ok' };
  } catch (err) {
    checks.database = { status: 'error', message: err.message };
  }

  // Table existence
  try {
    const tables = await db.raw(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const tableNames = tables.rows.map(r => r.table_name);
    const required = [
      'industries', 'clients', 'ad_accounts', 'campaigns', 'adsets',
      'ads', 'performance_snapshots', 'users', 'sync_logs',
      'saved_queries', 'api_keys'
    ];
    const missing = required.filter(t => !tableNames.includes(t));
    checks.tables = {
      status: missing.length === 0 ? 'ok' : 'warn',
      found: tableNames.length,
      missing: missing.length > 0 ? missing : undefined
    };
  } catch (err) {
    checks.tables = { status: 'error', message: err.message };
  }

  // Media directory
  const fs = require('fs');
  try {
    const testFile = path.join(__dirname, 'data/media/.healthcheck');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    checks.mediaStorage = { status: 'ok' };
  } catch (err) {
    checks.mediaStorage = { status: 'error', message: err.message };
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const duration = Date.now() - startTime;

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    duration,
    checks
  });
});

// --- Routes ---
app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1/fireberry', require('./routes/fireberry.routes'));
app.use('/api/v1/industries', require('./routes/industries.routes'));
app.use('/api/v1/clients', require('./routes/clients.routes'));
app.use('/api/v1/ad-accounts', require('./routes/ad-accounts.routes'));
app.use('/api/v1/campaigns', require('./routes/campaigns.routes'));
app.use('/api/v1/adsets', require('./routes/adsets.routes'));
app.use('/api/v1/ads', require('./routes/ads.routes'));
app.use('/api/v1/performance', require('./routes/performance.routes'));
app.use('/api/v1/dashboard', require('./routes/dashboard.routes'));
app.use('/api/v1/gallery', require('./routes/gallery.routes'));
app.use('/api/v1/query', require('./routes/query.routes'));
app.use('/api/v1/sync', require('./routes/sync.routes'));
app.use('/api/v1/alerts', require('./routes/alerts.routes'));
app.use('/api/v1/intelligence', require('./routes/intelligence.routes'));
app.use('/api/v1/export', require('./routes/export.routes'));

// --- Error handler (must be last) ---
app.use(errorHandler);

// --- Start server ---
async function start() {
  try {
    // Verify DB connection
    await db.raw('SELECT 1');
    log('INFO', 'server', 'Database connected');

    // Run migrations in production
    if (process.env.NODE_ENV === 'production') {
      log('INFO', 'server', 'Running migrations');
      await db.migrate.latest();
      log('INFO', 'server', 'Migrations complete');

      log('INFO', 'server', 'Running seeds');
      await db.seed.run();
      log('INFO', 'server', 'Seeds complete');
    }

    // Start cron jobs
    const registerJobs = require('./jobs');
    registerJobs();

    app.listen(PORT, () => {
      log('INFO', 'server', `Server started on port ${PORT}`, {
        env: process.env.NODE_ENV || 'development',
        port: PORT
      });
    });
  } catch (err) {
    log('ERROR', 'server', 'Failed to start', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

start();

module.exports = app;
