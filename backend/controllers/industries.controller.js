const db = require('../config/db');
const { log } = require('../utils/logger');

async function list(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'industries', 'Entry: list', { requestId: req.requestId });
  try {
    const industries = await db('industries')
      .select('industries.*')
      .select(db.raw('COALESCE(client_counts.count, 0)::int as client_count'))
      .leftJoin(
        db('clients')
          .select('industry_id')
          .count('* as count')
          .groupBy('industry_id')
          .as('client_counts'),
        'industries.id', 'client_counts.industry_id'
      )
      .orderBy('industries.name');

    const duration = Date.now() - startTime;
    log('INFO', 'industries', 'Exit: list', { requestId: req.requestId, count: industries.length, duration });
    res.json({ data: industries });
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'industries', 'Error in list', { requestId: req.requestId, error: err.message, stack: err.stack, duration });
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name, parent_id, tags } = req.body;
    if (!name) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name is required' } });
    }

    const [industry] = await db('industries')
      .insert({ name, parent_id: parent_id || null, tags: tags || null })
      .returning('*');

    log('INFO', 'industries', 'Industry created', { requestId: req.requestId, id: industry.id, name });
    res.status(201).json({ data: industry });
  } catch (err) {
    if (err.code === '23505') {
      log('WARN', 'industries', 'Duplicate industry name', { requestId: req.requestId, name: req.body.name });
      return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Industry name already exists' } });
    }
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { name, parent_id, tags } = req.body;

    const [updated] = await db('industries')
      .where({ id })
      .update({ name, parent_id, tags })
      .returning('*');

    if (!updated) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Industry not found' } });
    }

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;

    const clientCount = await db('clients').where({ industry_id: id }).count('* as count').first();
    if (parseInt(clientCount.count) > 0) {
      return res.status(400).json({
        error: { code: 'HAS_DEPENDENTS', message: `Cannot delete: ${clientCount.count} clients linked to this industry` }
      });
    }

    const deleted = await db('industries').where({ id }).del();
    if (!deleted) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Industry not found' } });
    }

    log('INFO', 'industries', 'Industry deleted', { requestId: req.requestId, id });
    res.json({ data: { message: 'Industry deleted' } });
  } catch (err) {
    next(err);
  }
}

async function classify(req, res, next) {
  const startTime = Date.now();
  log('INFO', 'industries', 'Entry: classify from Facebook', { requestId: req.requestId });
  try {
    const { classifyClientsFromFacebook } = require('../services/industry-classifier.service');
    const result = await classifyClientsFromFacebook();
    log('INFO', 'industries', 'Exit: classify', { requestId: req.requestId, ...result, duration: Date.now() - startTime });
    res.json({ data: result });
  } catch (err) {
    log('ERROR', 'industries', 'Error in classify', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

module.exports = { list, create, update, remove, classify };
