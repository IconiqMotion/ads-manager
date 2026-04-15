exports.up = function (knex) {
  return knex.schema.createTable('performance_snapshots', (table) => {
    table.increments('id').primary();
    table.date('date').notNullable();
    table.string('ad_account_id', 50).references('id').inTable('ad_accounts');
    table.string('campaign_id', 50).references('id').inTable('campaigns');
    table.string('adset_id', 50);
    table.string('ad_id', 50);
    table.string('level', 20).notNullable(); // 'campaign', 'adset', 'ad'
    table.bigInteger('impressions').defaultTo(0);
    table.bigInteger('reach').defaultTo(0);
    table.bigInteger('clicks').defaultTo(0);
    table.decimal('ctr', 8, 4);
    table.decimal('cpc', 10, 4);
    table.decimal('cpm', 10, 4);
    table.decimal('spend', 12, 4).defaultTo(0);
    table.integer('leads').defaultTo(0);
    table.integer('purchases').defaultTo(0);
    table.decimal('roas', 10, 4);
    table.decimal('frequency', 8, 4);
    table.integer('conversions').defaultTo(0);
    table.decimal('cost_per_result', 10, 4);
    table.jsonb('actions');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.unique(['date', 'ad_id', 'level']);
    table.index('date', 'idx_perf_date');
    table.index(['campaign_id', 'date'], 'idx_perf_campaign');
    table.index(['ad_id', 'date'], 'idx_perf_ad');
    table.index(['ad_account_id', 'date'], 'idx_perf_account_date');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('performance_snapshots');
};
