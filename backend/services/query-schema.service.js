const db = require('../config/db');
const { log } = require('../utils/logger');

const QUERYABLE_TABLES = [
  'industries', 'clients', 'ad_accounts', 'campaigns',
  'adsets', 'ads', 'performance_snapshots'
];

async function listTables() {
  const startTime = Date.now();
  log('DEBUG', 'query', 'Entry: listTables');

  try {
    const tables = await db.raw(`
      SELECT table_name,
             (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
      FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_name = ANY(?)
      ORDER BY t.table_name
    `, [QUERYABLE_TABLES]);

    const duration = Date.now() - startTime;
    log('DEBUG', 'query', 'Exit: listTables', { tableCount: tables.rows.length, duration });
    return tables.rows;
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'query', 'Error in listTables', { error: err.message, stack: err.stack, duration });
    throw err;
  }
}

async function getTableSchema(tableName) {
  const startTime = Date.now();
  log('DEBUG', 'query', 'Entry: getTableSchema', { tableName });

  if (!QUERYABLE_TABLES.includes(tableName)) {
    log('WARN', 'query', 'Validation failed: table not queryable', { tableName });
    throw Object.assign(new Error(`Table "${tableName}" is not queryable`), { status: 400 });
  }

  try {
    log('DEBUG', 'query', 'Fetching columns', { tableName });
    const columns = await db.raw(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ?
      ORDER BY ordinal_position
    `, [tableName]);

    log('DEBUG', 'query', 'Fetching foreign keys', { tableName });
    const foreignKeys = await db.raw(`
      SELECT
        kcu.column_name,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = ?
    `, [tableName]);

    const duration = Date.now() - startTime;
    log('DEBUG', 'query', 'Exit: getTableSchema', { tableName, columnCount: columns.rows.length, fkCount: foreignKeys.rows.length, duration });

    return {
      table: tableName,
      columns: columns.rows,
      foreign_keys: foreignKeys.rows
    };
  } catch (err) {
    if (!err.status) {
      const duration = Date.now() - startTime;
      log('ERROR', 'query', 'Error in getTableSchema', { tableName, error: err.message, stack: err.stack, duration });
    }
    throw err;
  }
}

async function getRelationships() {
  const startTime = Date.now();
  log('DEBUG', 'query', 'Entry: getRelationships');

  try {
    const fks = await db.raw(`
      SELECT
        tc.table_name AS from_table,
        kcu.column_name AS from_column,
        ccu.table_name AS to_table,
        ccu.column_name AS to_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = ANY(?)
      ORDER BY tc.table_name
    `, [QUERYABLE_TABLES]);

    const duration = Date.now() - startTime;
    log('DEBUG', 'query', 'Exit: getRelationships', { relationshipCount: fks.rows.length, duration });
    return fks.rows;
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'query', 'Error in getRelationships', { error: err.message, stack: err.stack, duration });
    throw err;
  }
}

module.exports = { listTables, getTableSchema, getRelationships };
