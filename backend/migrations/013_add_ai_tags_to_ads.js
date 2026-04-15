exports.up = function (knex) {
  return knex.schema.alterTable('ads', (table) => {
    table.jsonb('ai_tags'); // { colors: [], objects: [], mood: '', style: '', has_text_overlay: bool }
    table.timestamp('ai_tagged_at', { useTz: true });
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('ads', (table) => {
    table.dropColumn('ai_tags');
    table.dropColumn('ai_tagged_at');
  });
};
