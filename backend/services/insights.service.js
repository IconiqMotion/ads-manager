const db = require('../config/db');
const { log, generateId } = require('../utils/logger');

async function generateInsights({ period = 'daily' } = {}) {
  const startTime = Date.now();
  const genId = generateId();
  log('INFO', 'insights', '=== INSIGHT GENERATION START ===', { genId, period });

  try {
    const today = new Date().toISOString().split('T')[0];
    const daysBack = period === 'weekly' ? 7 : 1;
    const fromDate = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];
    const prevFromDate = new Date(Date.now() - daysBack * 2 * 86400000).toISOString().split('T')[0];

    // Get current period stats per campaign
    const current = await db('performance_snapshots as ps')
      .join('campaigns as c', 'ps.campaign_id', 'c.id')
      .join('clients as cl', 'c.client_id', 'cl.id')
      .where('ps.level', 'ad')
      .whereBetween('ps.date', [fromDate, today])
      .groupBy('c.id', 'c.name', 'cl.client_name', 'cl.id')
      .select(
        'c.id as campaign_id', 'c.name as campaign_name',
        'cl.client_name', 'cl.id as client_id',
        db.raw('SUM(ps.spend)::numeric as spend'),
        db.raw('SUM(ps.impressions)::bigint as impressions'),
        db.raw('SUM(ps.clicks)::bigint as clicks'),
        db.raw('SUM(ps.leads)::int as leads'),
        db.raw('CASE WHEN SUM(ps.impressions) > 0 THEN SUM(ps.clicks)::float / SUM(ps.impressions) * 100 ELSE 0 END as ctr'),
        db.raw('CASE WHEN SUM(ps.clicks) > 0 THEN SUM(ps.spend)::float / SUM(ps.clicks) ELSE 0 END as cpc')
      )
      .having(db.raw('SUM(ps.impressions) > 0'));

    // Get previous period for comparison
    const previous = await db('performance_snapshots as ps')
      .join('campaigns as c', 'ps.campaign_id', 'c.id')
      .where('ps.level', 'ad')
      .whereBetween('ps.date', [prevFromDate, fromDate])
      .groupBy('c.id')
      .select('c.id as campaign_id',
        db.raw('SUM(ps.spend)::numeric as spend'),
        db.raw('SUM(ps.clicks)::bigint as clicks'),
        db.raw('SUM(ps.leads)::int as leads'),
        db.raw('CASE WHEN SUM(ps.impressions) > 0 THEN SUM(ps.clicks)::float / SUM(ps.impressions) * 100 ELSE 0 END as ctr')
      );

    const prevMap = {};
    previous.forEach(p => { prevMap[p.campaign_id] = p; });

    const insights = [];

    for (const camp of current) {
      const prev = prevMap[camp.campaign_id];
      const spend = parseFloat(camp.spend) || 0;
      const ctr = parseFloat(camp.ctr) || 0;
      const cpc = parseFloat(camp.cpc) || 0;

      // Top mover — spend increased > 50%
      if (prev && parseFloat(prev.spend) > 0) {
        const spendChange = ((spend - parseFloat(prev.spend)) / parseFloat(prev.spend)) * 100;
        if (spendChange > 50) {
          insights.push({
            type: 'top_mover', scope: 'campaign', scope_id: camp.campaign_id,
            title: `${camp.campaign_name} spend increased ${spendChange.toFixed(0)}%`,
            description: `Campaign for ${camp.client_name}: spend went from ${parseFloat(prev.spend).toFixed(2)} to ${spend.toFixed(2)}`,
            data: JSON.stringify({ spend, prevSpend: parseFloat(prev.spend), change: spendChange }),
            severity: 'info', period, period_date: today
          });
        }
      }

      // Worst performer — CTR below 0.5% with significant spend
      if (ctr < 0.5 && spend > 50) {
        insights.push({
          type: 'worst_performer', scope: 'campaign', scope_id: camp.campaign_id,
          title: `${camp.campaign_name} has very low CTR (${ctr.toFixed(2)}%)`,
          description: `Campaign for ${camp.client_name}: spending ${spend.toFixed(2)} with only ${ctr.toFixed(2)}% CTR`,
          data: JSON.stringify({ spend, ctr, cpc, clicks: parseInt(camp.clicks) }),
          severity: 'warning', period, period_date: today
        });
      }

      // High performer
      if (ctr > 3 && spend > 20) {
        insights.push({
          type: 'creative_winner', scope: 'campaign', scope_id: camp.campaign_id,
          title: `${camp.campaign_name} performing well (CTR ${ctr.toFixed(2)}%)`,
          description: `Campaign for ${camp.client_name}: strong ${ctr.toFixed(2)}% CTR`,
          data: JSON.stringify({ spend, ctr, cpc, leads: parseInt(camp.leads) }),
          severity: 'info', period, period_date: today
        });
      }

      // Anomaly — CTR dropped > 50% vs previous
      if (prev && parseFloat(prev.ctr) > 0.5) {
        const ctrChange = ((ctr - parseFloat(prev.ctr)) / parseFloat(prev.ctr)) * 100;
        if (ctrChange < -50) {
          insights.push({
            type: 'anomaly', scope: 'campaign', scope_id: camp.campaign_id,
            title: `${camp.campaign_name} CTR dropped ${Math.abs(ctrChange).toFixed(0)}%`,
            description: `CTR went from ${parseFloat(prev.ctr).toFixed(2)}% to ${ctr.toFixed(2)}% for ${camp.client_name}`,
            data: JSON.stringify({ ctr, prevCtr: parseFloat(prev.ctr), change: ctrChange }),
            severity: 'critical', period, period_date: today
          });
        }
      }
    }

    // Deduplicate — don't insert if same insight exists for same campaign today
    let inserted = 0;
    for (const insight of insights) {
      const exists = await db('insights')
        .where({ type: insight.type, scope_id: insight.scope_id, period_date: insight.period_date })
        .first();
      if (!exists) {
        await db('insights').insert(insight);
        inserted++;
      }
    }

    const duration = Date.now() - startTime;
    log('INFO', 'insights', '=== INSIGHT GENERATION COMPLETE ===', {
      genId, campaignsAnalyzed: current.length, insightsGenerated: insights.length, inserted, duration
    });

    return { campaignsAnalyzed: current.length, insightsGenerated: insights.length, inserted };
  } catch (err) {
    log('ERROR', 'insights', 'Insight generation failed', { genId, error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

module.exports = { generateInsights };
