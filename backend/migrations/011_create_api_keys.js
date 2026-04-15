exports.up = function (knex) {
  return knex.schema.createTable('api_keys', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users');
    table.string('key_hash', 200).notNullable();
    table.string('name', 200);
    table.string('permissions', 20).defaultTo('read');
    table.timestamp('last_used', { useTz: true });
    table.timestamp('expires_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('api_keys');
};
