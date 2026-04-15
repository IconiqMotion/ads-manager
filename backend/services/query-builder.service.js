const { log, generateId } = require('../utils/logger');
const db = require('../config/db');

const ALLOWED_ENTITIES = ['clients', 'campaigns', 'adsets', 'ads', 'performance_snapshots', 'industries', 'ad_accounts'];

const JOIN_MAP = {
  clients: { industries: ['clients.industry_id', 'industries.id'] },
  campaigns: {
    ad_accounts: ['campaigns.ad_account_id', 'ad_accounts.id'],
    clients: ['campaigns.client_id', 'clients.id'],
    performance_snapshots: ['campaigns.id', 'performance_snapshots.campaign_id']
  },
  adsets: {
    campaigns: ['adsets.campaign_id', 'campaigns.id']
  },
  ads: {
    adsets: ['ads.adset_id', 'adsets.id'],
    campaigns: ['ads.campaign_id', 'campaigns.id'],
    clients: ['ads.client_id', 'clients.id'],
    performance_snapshots: ['ads.id', 'performance_snapshots.ad_id']
  },
  performance_snapshots: {
    campaigns: ['performance_snapshots.campaign_id', 'campaigns.id'],
    ads: ['performance_snapshots.ad_id', 'ads.id'],
    ad_accounts: ['performance_snapshots.ad_account_id', 'ad_accounts.id']
  },
  industries: {
    clients: ['industries.id', 'clients.industry_id']
  },
  ad_accounts: {
    clients: ['ad_accounts.client_id', 'clients.id'],
    campaigns: ['ad_accounts.id', 'campaigns.ad_account_id']
  }
};

const ALLOWED_AGGREGATES = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'];
const ALLOWED_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'like', 'between'];

async function executeBuilderQuery(spec, userId) {
  const queryId = generateId();

  log('INFO', 'query', 'Builder query', { queryId, userId, entity: spec.entity, joins: spec.joins });

  // Validate entity
  if (!ALLOWED_ENTITIES.includes(spec.entity)) {
    throw Object.assign(new Error(`Entity "${spec.entity}" is not queryable`), { status: 400 });
  }

  // Validate joins
  for (const join of (spec.joins || [])) {
    if (!JOIN_MAP[spec.entity]?.[join]) {
      throw Object.assign(new Error(`Join "${join}" not allowed from "${spec.entity}"`), { status: 400 });
    }
  }

  // Validate aggregations in fields
  for (const field of (spec.fields || [])) {
    const match = field.match(/^(\w+)\s*\(/);
    if (match && !ALLOWED_AGGREGATES.includes(match[1].toUpperCase())) {
      throw Object.assign(new Error(`Aggregation "${match[1]}" not allowed`), { status: 400 });
    }
  }

  // Build query
  const limit = Math.min(spec.limit || 100, 10000);
  const offset = spec.offset || 0;

  let query = db(spec.entity);

  // Joins
  for (const join of (spec.joins || [])) {
    const [left, right] = JOIN_MAP[spec.entity][join];
    query = query.leftJoin(join, left, right);
  }

  // Fields
  if (spec.fields && spec.fields.length > 0) {
    query = query.select(spec.fields.map(f => db.raw(f)));
  } else {
    query = query.select(`${spec.entity}.*`);
  }

  // Filters
  for (const [field, condition] of Object.entries(spec.filters || {})) {
    if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
      for (const [op, value] of Object.entries(condition)) {
        if (!ALLOWED_OPERATORS.includes(op)) {
          throw Object.assign(new Error(`Operator "${op}" not allowed`), { status: 400 });
        }
        switch (op) {
          case 'eq': query = query.where(field, value); break;
          case 'neq': query = query.whereNot(field, value); break;
          case 'gt': query = query.where(field, '>', value); break;
          case 'gte': query = query.where(field, '>=', value); break;
          case 'lt': query = query.where(field, '<', value); break;
          case 'lte': query = query.where(field, '<=', value); break;
          case 'in': query = query.whereIn(field, value); break;
          case 'like': query = query.whereILike(field, `%${value}%`); break;
          case 'between': query = query.whereBetween(field, value); break;
        }
      }
    } else {
      query = query.where(field, condition);
    }
  }

  // Group by
  if (spec.group_by && spec.group_by.length > 0) {
    query = query.groupBy(spec.group_by);
  }

  // Order by
  if (spec.order_by) {
    query = query.orderBy(spec.order_by.field, spec.order_by.direction || 'desc');
  }

  query = query.limit(limit).offset(offset);

  const startTime = Date.now();
  try {
    const rows = await query;
    const duration = Date.now() - startTime;

    log('INFO', 'query', 'Builder query executed', { queryId, userId, rowCount: rows.length, duration });

    if (duration > 5000) {
      log('WARN', 'query', 'Slow builder query', { queryId, duration });
    }

    return { rows, rowCount: rows.length, duration };
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'query', 'Builder query failed', { queryId, userId, duration, error: err.message });
    throw Object.assign(new Error(`Query error: ${err.message}`), { status: 400 });
  }
}

module.exports = { executeBuilderQuery };
