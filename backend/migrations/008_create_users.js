exports.up = function (knex) {
  return knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('email', 200).notNullable().unique();
    table.string('password_hash', 200).notNullable();
    table.string('name', 200);
    table.string('role', 20).defaultTo('viewer'); // admin, manager, viewer
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('users');
};
