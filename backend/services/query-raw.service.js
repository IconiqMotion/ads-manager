const { log, generateId } = require('../utils/logger');
const db = require('../config/db');

const BLOCKED_KEYWORDS = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE', 'COPY', 'EXECUTE'];
const BLOCKED_TABLES = ['PG_', 'INFORMATION_SCHEMA'];

async function executeRawQuery(sql, { params = [], limit = 100, offset = 0, userId } = {}) {
  const queryId = generateId();

  log('INFO', 'query', 'Raw query requested', { queryId, userId, sqlLength: sql.length, sqlPreview: sql.substring(0, 200) });

  // Validation 1: Must be SELECT
  const normalized = sql.trim().toUpperCase();
  if (!normalized.startsWith('SELECT')) {
    log('WARN', 'query', 'Non-SELECT blocked', { queryId, userId });
    throw Object.assign(new Error('Only SELECT queries are allowed'), { status: 400 });
  }

  // Validation 2: Blocked keywords
  const found = BLOCKED_KEYWORDS.filter(kw => normalized.includes(kw));
  if (found.length > 0) {
    log('WARN', 'query', 'Blocked keywords', { queryId, userId, keywords: found });
    throw Object.assign(new Error(`Blocked SQL keywords: ${found.join(', ')}`), { status: 400 });
  }

  // Validation 3: System tables
  if (BLOCKED_TABLES.some(t => normalized.includes(t))) {
    log('WARN', 'query', 'System table access blocked', { queryId, userId });
    throw Object.assign(new Error('Access to system tables is not allowed'), { status: 400 });
  }

  // Validation 4: Single statement
  const statements = sql.split(';').filter(s => s.trim());
  if (statements.length > 1) {
    throw Object.assign(new Error('Only single statements are allowed'), { status: 400 });
  }

  const cappedLimit = Math.min(limit, 10000);
  const startTime = Date.now();

  try {
    const result = await db.raw(
      `SELECT * FROM (${sql}) AS _q LIMIT ? OFFSET ?`,
      [...params, cappedLimit, offset]
    );

    const duration = Date.now() - startTime;

    log('INFO', 'query', 'Raw query executed', {
      queryId, userId, rowCount: result.rows?.length || 0, duration
    });

    if (duration > 5000) {
      log('WARN', 'query', 'Slow query', { queryId, userId, duration });
    }

    return {
      rows: result.rows,
      rowCount: result.rows?.length || 0,
      columns: result.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
      duration
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'query', 'Raw query failed', { queryId, userId, duration, error: err.message });
    throw Object.assign(new Error(`Query error: ${err.message}`), { status: 400 });
  }
}

module.exports = { executeRawQuery };
