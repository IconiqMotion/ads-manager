exports.up = function (knex) {
  return knex.schema.createTable('adsets', (table) => {
    table.string('id', 50).primary();
    table.string('campaign_id', 50).references('id').inTable('campaigns').onDelete('CASCADE');
    table.string('name', 500);
    table.string('status', 50);
    table.string('optimization_goal', 100);
    table.bigInteger('daily_budget');
    table.bigInteger('lifetime_budget');
    table.jsonb('targeting');
    table.jsonb('placements');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('adsets');
};
