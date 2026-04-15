exports.up = function (knex) {
  return knex.schema.createTable('alert_rules', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users');
    table.string('name', 200).notNullable();
    table.string('metric', 50).notNullable(); // 'ctr', 'cpc', 'spend', 'leads', 'roas'
    table.string('condition', 10).notNullable(); // 'lt', 'gt', 'eq'
    table.decimal('threshold', 12, 4).notNullable();
    table.string('scope', 20).defaultTo('all'); // 'all', 'client', 'campaign', 'industry'
    table.integer('scope_id'); // client_id, campaign_id, or industry_id
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  }).then(() => {
    return knex.schema.createTable('alert_triggers', (table) => {
      table.increments('id').primary();
      table.integer('rule_id').references('id').inTable('alert_rules').onDelete('CASCADE');
      table.string('entity_type', 20); // 'campaign', 'ad', 'client'
      table.string('entity_id', 100);
      table.string('entity_name', 500);
      table.string('metric', 50);
      table.decimal('value', 12, 4);
      table.decimal('threshold', 12, 4);
      table.string('condition', 10);
      table.boolean('is_read').defaultTo(false);
      table.timestamp('triggered_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('alert_triggers')
    .then(() => knex.schema.dropTableIfExists('alert_rules'));
};
