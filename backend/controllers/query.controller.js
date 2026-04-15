const { executeRawQuery } = require('../services/query-raw.service');
const { executeBuilderQuery } = require('../services/query-builder.service');
const schemaService = require('../services/query-schema.service');
const db = require('../config/db');
const { log } = require('../utils/logger');

async function rawQuery(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  log('INFO', 'query', 'ENTRY rawQuery', { requestId, sql: req.body.sql, limit: req.body.limit, offset: req.body.offset });
  try {
    const { sql, params, limit, offset } = req.body;
    if (!sql) {
      log('WARN', 'query', 'EXIT rawQuery — validation failed', { requestId, duration: Date.now() - startTime });
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'sql is required' } });
    }
    const result = await executeRawQuery(sql, { params, limit, offset, userId: req.user.id });
    log('INFO', 'query', 'EXIT rawQuery', { requestId, rowCount: result?.rows?.length ?? result?.length, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'query', 'ERROR rawQuery', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function builderQuery(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  log('INFO', 'query', 'ENTRY builderQuery', { requestId, table: req.body.table });
  try {
    const result = await executeBuilderQuery(req.body, req.user.id);
    log('INFO', 'query', 'EXIT builderQuery', { requestId, rowCount: result?.rows?.length ?? result?.length, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'query', 'ERROR builderQuery', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function schema(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  log('INFO', 'query', 'ENTRY schema', { requestId });
  try {
    const tables = await schemaService.listTables();
    log('INFO', 'query', 'EXIT schema', { requestId, tableCount: tables?.length, duration: Date.now() - startTime });
    res.json({ data: tables });
  } catch (err) {
    log('ERROR', 'query', 'ERROR schema', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function schemaTable(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  const table = req.params.table;
  log('INFO', 'query', 'ENTRY schemaTable', { requestId, table });
  try {
    const data = await schemaService.getTableSchema(table);
    log('INFO', 'query', 'EXIT schemaTable', { requestId, table, columnCount: data?.columns?.length ?? Object.keys(data || {}).length, duration: Date.now() - startTime });
    res.json({ data });
  } catch (err) {
    log('ERROR', 'query', 'ERROR schemaTable', { requestId, table, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function schemaRelationships(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  log('INFO', 'query', 'ENTRY schemaRelationships', { requestId });
  try {
    const data = await schemaService.getRelationships();
    log('INFO', 'query', 'EXIT schemaRelationships', { requestId, relationshipCount: data?.length, duration: Date.now() - startTime });
    res.json({ data });
  } catch (err) {
    log('ERROR', 'query', 'ERROR schemaRelationships', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function saveQuery(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  log('INFO', 'query', 'ENTRY saveQuery', { requestId, name: req.body.name, type: req.body.type });
  try {
    const { name, description, type, query_body, is_public } = req.body;
    if (!name || !type || !query_body) {
      log('WARN', 'query', 'EXIT saveQuery — validation failed', { requestId, duration: Date.now() - startTime });
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'name, type, and query_body required' } });
    }
    const [saved] = await db('saved_queries').insert({
      user_id: req.user.id, name, description, type,
      query_body: JSON.stringify(query_body), is_public: is_public || false
    }).returning('*');
    log('INFO', 'query', 'EXIT saveQuery', { requestId, savedId: saved.id, duration: Date.now() - startTime });
    res.status(201).json({ data: saved });
  } catch (err) {
    log('ERROR', 'query', 'ERROR saveQuery', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function listSaved(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  log('INFO', 'query', 'ENTRY listSaved', { requestId, userId: req.user.id });
  try {
    const queries = await db('saved_queries')
      .where(function () {
        this.where({ user_id: req.user.id }).orWhere({ is_public: true });
      })
      .select('id', 'name', 'description', 'type', 'is_public', 'created_at', 'updated_at')
      .orderBy('updated_at', 'desc');
    log('INFO', 'query', 'EXIT listSaved', { requestId, count: queries.length, duration: Date.now() - startTime });
    res.json({ data: queries });
  } catch (err) {
    log('ERROR', 'query', 'ERROR listSaved', { requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function getSaved(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  const id = req.params.id;
  log('INFO', 'query', 'ENTRY getSaved', { requestId, id });
  try {
    const q = await db('saved_queries').where({ id }).first();
    if (!q) {
      log('WARN', 'query', 'EXIT getSaved — not found', { requestId, id, duration: Date.now() - startTime });
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Query not found' } });
    }
    log('INFO', 'query', 'EXIT getSaved', { requestId, id, name: q.name, duration: Date.now() - startTime });
    res.json({ data: q });
  } catch (err) {
    log('ERROR', 'query', 'ERROR getSaved', { requestId, id, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function runSaved(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  const id = req.params.id;
  log('INFO', 'query', 'ENTRY runSaved', { requestId, id });
  try {
    const q = await db('saved_queries').where({ id }).first();
    if (!q) {
      log('WARN', 'query', 'EXIT runSaved — not found', { requestId, id, duration: Date.now() - startTime });
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Query not found' } });
    }

    const body = typeof q.query_body === 'string' ? JSON.parse(q.query_body) : q.query_body;

    if (q.type === 'raw') {
      // Only admin can run saved raw queries
      if (req.user.role !== 'admin') {
        log('WARN', 'query', 'EXIT runSaved — forbidden', { requestId, id, duration: Date.now() - startTime });
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only admins can run raw queries' } });
      }
      const result = await executeRawQuery(body.sql, { params: body.params, limit: body.limit, offset: body.offset, userId: req.user.id });
      log('INFO', 'query', 'EXIT runSaved (raw)', { requestId, id, rowCount: result?.rows?.length ?? result?.length, duration: Date.now() - startTime });
      return res.json({ data: result });
    }

    const result = await executeBuilderQuery(body, req.user.id);
    log('INFO', 'query', 'EXIT runSaved (builder)', { requestId, id, rowCount: result?.rows?.length ?? result?.length, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'query', 'ERROR runSaved', { requestId, id, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function deleteSaved(req, res, next) {
  const startTime = Date.now();
  const requestId = req.requestId;
  const id = req.params.id;
  log('INFO', 'query', 'ENTRY deleteSaved', { requestId, id });
  try {
    const q = await db('saved_queries').where({ id }).first();
    if (!q) {
      log('WARN', 'query', 'EXIT deleteSaved — not found', { requestId, id, duration: Date.now() - startTime });
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Query not found' } });
    }
    if (q.user_id !== req.user.id && req.user.role !== 'admin') {
      log('WARN', 'query', 'EXIT deleteSaved — forbidden', { requestId, id, duration: Date.now() - startTime });
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your query' } });
    }
    await db('saved_queries').where({ id }).del();
    log('INFO', 'query', 'EXIT deleteSaved', { requestId, id, duration: Date.now() - startTime });
    res.json({ data: { message: 'Query deleted' } });
  } catch (err) {
    log('ERROR', 'query', 'ERROR deleteSaved', { requestId, id, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

module.exports = { rawQuery, builderQuery, schema, schemaTable, schemaRelationships, saveQuery, listSaved, getSaved, runSaved, deleteSaved };
