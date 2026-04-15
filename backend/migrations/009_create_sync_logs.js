exports.up = function (knex) {
  return knex.schema.createTable('sync_logs', (table) => {
    table.increments('id').primary();
    table.string('ad_account_id', 50);
    table.string('sync_type', 20); // 'full', 'incremental', 'fireberry_clients', 'fireberry_tokens'
    table.string('status', 20); // 'running', 'completed', 'failed'
    table.string('token_source', 20); // 'account', 'business', 'fireberry'
    table.integer('records_synced').defaultTo(0);
    table.text('error_message');
    table.timestamp('started_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true });
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('sync_logs');
};
