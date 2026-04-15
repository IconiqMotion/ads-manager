exports.up = function (knex) {
  return knex.schema.createTable('insights', (table) => {
    table.increments('id').primary();
    table.string('type', 50).notNullable(); // 'top_mover', 'worst_performer', 'anomaly', 'recommendation', 'creative_winner'
    table.string('scope', 20); // 'campaign', 'ad', 'client', 'industry', 'global'
    table.string('scope_id', 100);
    table.string('title', 500).notNullable();
    table.text('description');
    table.jsonb('data'); // Flexible payload (metrics, comparison, etc.)
    table.string('severity', 20).defaultTo('info'); // 'info', 'warning', 'critical'
    table.string('period', 20); // 'daily', 'weekly'
    table.date('period_date');
    table.boolean('is_read').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('insights');
};
