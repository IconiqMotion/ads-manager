exports.up = function (knex) {
  return knex.schema.createTable('clients', (table) => {
    table.increments('id').primary();
    table.string('fireberry_account_id', 100).unique();
    table.string('client_name', 200).notNullable();
    table.string('brand_name', 200);
    table.integer('industry_id').references('id').inTable('industries');
    table.string('contact_name', 200);
    table.string('contact_email', 200);
    table.string('contact_phone', 50);
    table.string('account_manager', 200);
    table.text('logo_url');
    table.text('website_url');
    table.text('drive_url');
    table.string('fireberry_status', 50);
    table.text('notes');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('clients');
};
