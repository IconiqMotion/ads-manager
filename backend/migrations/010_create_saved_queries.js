exports.up = function (knex) {
  return knex.schema.createTable('saved_queries', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users');
    table.string('name', 200).notNullable();
    table.text('description');
    table.string('type', 10).notNullable(); // 'raw' or 'builder'
    table.jsonb('query_body').notNullable();
    table.boolean('is_public').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('saved_queries');
};
