const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@local';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

  const exists = await knex('users').where({ email }).first();
  if (!exists) {
    const hash = await bcrypt.hash(password, 10);
    await knex('users').insert({
      email,
      password_hash: hash,
      name: 'Admin',
      role: 'admin'
    });
  }
};
