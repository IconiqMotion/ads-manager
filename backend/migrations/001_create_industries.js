exports.up = function (knex) {
  return knex.schema.createTable('industries', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable().unique();
    table.integer('parent_id').references('id').inTable('industries');
    table.specificType('tags', 'TEXT[]');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('industries');
};
