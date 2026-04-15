exports.up = function (knex) {
  return knex.schema.alterTable('ads', (table) => {
    table.integer('industry_id').references('id').inTable('industries');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('ads', (table) => {
    table.dropColumn('industry_id');
  });
};
