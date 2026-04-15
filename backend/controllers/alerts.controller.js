const db = require('../config/db');
const { evaluateAlerts } = require('../services/alerts.service');
const { log } = require('../utils/logger');

async function listRules(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'alerts', 'Entry: listRules', { requestId: req.requestId });
  try {
    const rules = await db('alert_rules').orderBy('created_at', 'desc');
    log('INFO', 'alerts', 'Exit: listRules', { requestId: req.requestId, count: rules.length, duration: Date.now() - startTime });
    res.json({ data: rules });
  } catch (err) {
    log('ERROR', 'alerts', 'Error in listRules', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function createRule(req, res, next) {
  const startTime = Date.now();
  log('INFO', 'alerts', 'Entry: createRule', { requestId: req.requestId, body: req.body });
  try {
    const { name, metric, condition, threshold, scope, scope_id } = req.body;
    if (!name || !metric || !condition || threshold == null) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'name, metric, condition, threshold required' } });
    }
    const validMetrics = ['ctr', 'cpc', 'spend', 'leads', 'roas', 'cpm'];
    if (!validMetrics.includes(metric)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Invalid metric. Valid: ${validMetrics.join(', ')}` } });
    }
    const [rule] = await db('alert_rules').insert({
      user_id: req.user.id, name, metric, condition, threshold,
      scope: scope || 'all', scope_id: scope_id || null
    }).returning('*');
    log('INFO', 'alerts', 'Exit: createRule', { requestId: req.requestId, ruleId: rule.id, duration: Date.now() - startTime });
    res.status(201).json({ data: rule });
  } catch (err) {
    log('ERROR', 'alerts', 'Error in createRule', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function deleteRule(req, res, next) {
  try {
    const deleted = await db('alert_rules').where({ id: req.params.id }).del();
    if (!deleted) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rule not found' } });
    res.json({ data: { message: 'Rule deleted' } });
  } catch (err) { next(err); }
}

async function listTriggers(req, res, next) {
  const startTime = Date.now();
  log('DEBUG', 'alerts', 'Entry: listTriggers', { requestId: req.requestId });
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    let query = db('alert_triggers as at')
      .select('at.*', 'ar.name as rule_name')
      .leftJoin('alert_rules as ar', 'at.rule_id', 'ar.id')
      .orderBy('at.triggered_at', 'desc');

    if (req.query.unread === 'true') {
      query = query.where('at.is_read', false);
    }

    const [{ count: total }] = await query.clone().clearSelect().clearOrder().count('at.id as count');
    const data = await query.limit(limit).offset(offset);

    log('INFO', 'alerts', 'Exit: listTriggers', { requestId: req.requestId, count: data.length, duration: Date.now() - startTime });
    res.json({ data, meta: { page, limit, total: parseInt(total) } });
  } catch (err) {
    log('ERROR', 'alerts', 'Error in listTriggers', { requestId: req.requestId, error: err.message, duration: Date.now() - startTime });
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const ids = req.body.ids;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'ids array required' } });
    }
    await db('alert_triggers').whereIn('id', ids).update({ is_read: true });
    res.json({ data: { message: `${ids.length} alerts marked as read` } });
  } catch (err) { next(err); }
}

async function unreadCount(req, res, next) {
  try {
    const [{ count }] = await db('alert_triggers').where({ is_read: false }).count('* as count');
    res.json({ data: { unread: parseInt(count) } });
  } catch (err) { next(err); }
}

async function triggerEvaluation(req, res, next) {
  try {
    log('INFO', 'alerts', 'Manual evaluation triggered', { requestId: req.requestId });
    const result = await evaluateAlerts();
    res.json({ data: result });
  } catch (err) { next(err); }
}

module.exports = { listRules, createRule, deleteRule, listTriggers, markRead, unreadCount, triggerEvaluation };
