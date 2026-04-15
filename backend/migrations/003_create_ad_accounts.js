exports.up = function (knex) {
  return knex.schema.createTable('ad_accounts', (table) => {
    table.string('id', 50).primary(); // Meta's act_XXXXX
    table.integer('client_id').references('id').inTable('clients').onDelete('CASCADE');
    table.string('fireberry_record_id', 100);
    table.string('account_name', 200);
    table.string('page_id', 100);
    table.string('currency', 10).defaultTo('USD');
    table.string('timezone', 50);
    table.string('status', 20);
    table.text('access_token');
    table.string('token_type', 20);
    table.timestamp('token_expires', { useTz: true });
    table.string('token_source', 20).defaultTo('fireberry');
    table.boolean('use_business_token').defaultTo(true);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_synced_at', { useTz: true });
    table.timestamp('last_token_sync', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('ad_accounts');
};
