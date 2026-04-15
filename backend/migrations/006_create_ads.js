exports.up = function (knex) {
  return knex.schema.createTable('ads', (table) => {
    table.string('id', 50).primary();
    table.string('adset_id', 50).references('id').inTable('adsets').onDelete('CASCADE');
    table.string('campaign_id', 50).references('id').inTable('campaigns');
    table.integer('client_id').references('id').inTable('clients');
    table.string('name', 500);
    table.string('status', 50);
    table.string('creative_id', 50);
    table.text('image_url');
    table.text('video_url');
    table.text('thumbnail_url');
    table.string('local_image', 500);
    table.string('local_video', 500);
    table.text('body_text');
    table.string('cta_type', 50);
    table.text('link_url');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('ads');
};
