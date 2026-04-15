const db = require('../config/db');
const { log, generateId } = require('../utils/logger');

async function evaluateAlerts() {
  const startTime = Date.now();
  const evalId = generateId();
  log('INFO', 'alerts', '=== ALERT EVALUATION START ===', { evalId });

  try {
    const rules = await db('alert_rules').where({ is_active: true });
    if (rules.length === 0) {
      log('INFO', 'alerts', 'No active rules', { evalId });
      return { evaluated: 0, triggered: 0 };
    }

    // Get recent performance (last 7 days aggregated per campaign)
    const recentStats = await db('performance_snapshots as ps')
      .join('campaigns as c', 'ps.campaign_id', 'c.id')
      .join('clients as cl', 'c.client_id', 'cl.id')
      .where('ps.level', 'ad')
      .where('ps.date', '>=', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0])
      .groupBy('c.id', 'c.name', 'cl.id', 'cl.client_name', 'cl.industry_id')
      .select(
        'c.id as campaign_id', 'c.name as campaign_name',
        'cl.id as client_id', 'cl.client_name', 'cl.industry_id',
        db.raw('CASE WHEN SUM(ps.impressions) > 0 THEN (SUM(ps.clicks)::float / SUM(ps.impressions) * 100) ELSE 0 END as ctr'),
        db.raw('CASE WHEN SUM(ps.clicks) > 0 THEN (SUM(ps.spend)::float / SUM(ps.clicks)) ELSE 0 END as cpc'),
        db.raw('SUM(ps.spend)::numeric as spend'),
        db.raw('SUM(ps.leads)::int as leads'),
        db.raw('CASE WHEN SUM(ps.spend) > 0 AND SUM(ps.purchases) > 0 THEN (SUM(ps.purchases)::float / SUM(ps.spend)) ELSE 0 END as roas')
      );

    let triggered = 0;

    for (const rule of rules) {
      for (const stat of recentStats) {
        // Check scope
        if (rule.scope === 'client' && stat.client_id !== rule.scope_id) continue;
        if (rule.scope === 'industry' && stat.industry_id !== rule.scope_id) continue;
        if (rule.scope === 'campaign' && stat.campaign_id !== String(rule.scope_id)) continue;

        const value = parseFloat(stat[rule.metric]);
        if (isNaN(value)) continue;

        let fires = false;
        if (rule.condition === 'lt' && value < parseFloat(rule.threshold)) fires = true;
        if (rule.condition === 'gt' && value > parseFloat(rule.threshold)) fires = true;
        if (rule.condition === 'eq' && Math.abs(value - parseFloat(rule.threshold)) < 0.01) fires = true;

        if (fires) {
          // Check if already triggered for this campaign in last 24h
          const existing = await db('alert_triggers')
            .where({ rule_id: rule.id, entity_id: stat.campaign_id })
            .where('triggered_at', '>', new Date(Date.now() - 86400000))
            .first();

          if (!existing) {
            await db('alert_triggers').insert({
              rule_id: rule.id,
              entity_type: 'campaign',
              entity_id: stat.campaign_id,
              entity_name: stat.campaign_name,
              metric: rule.metric,
              value,
              threshold: rule.threshold,
              condition: rule.condition
            });
            triggered++;
            log('INFO', 'alerts', 'Alert triggered', {
              evalId, ruleName: rule.name, campaign: stat.campaign_name,
              metric: rule.metric, value, threshold: rule.threshold
            });
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    log('INFO', 'alerts', '=== ALERT EVALUATION COMPLETE ===', { evalId, rulesEvaluated: rules.length, campaignsChecked: recentStats.length, triggered, duration });

    return { evaluated: rules.length, campaignsChecked: recentStats.length, triggered };
  } catch (err) {
    log('ERROR', 'alerts', 'Alert evaluation failed', { evalId, error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

module.exports = { evaluateAlerts };
