exports.up = function (knex) {
  return knex.schema.alterTable('ads', (table) => {
    table.specificType('embedding', 'real[]').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('ads', (table) => {
    table.dropColumn('embedding');
  });
};
