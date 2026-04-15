exports.up = function (knex) {
  return knex.schema.createTable('campaigns', (table) => {
    table.string('id', 50).primary(); // Meta campaign ID
    table.string('ad_account_id', 50).references('id').inTable('ad_accounts').onDelete('CASCADE');
    table.integer('client_id').references('id').inTable('clients');
    table.string('name', 500);
    table.string('objective', 100);
    table.string('status', 50);
    table.string('buying_type', 50);
    table.bigInteger('daily_budget');
    table.bigInteger('lifetime_budget');
    table.date('start_date');
    table.date('end_date');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('campaigns');
};
