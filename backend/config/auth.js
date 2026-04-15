const isProd = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET || (isProd ? null : 'dev-only-change-me-in-production');

if (isProd && !jwtSecret) {
  throw new Error('JWT_SECRET is required in production');
}

module.exports = {
  jwtSecret,
  jwtExpiry: '24h',
  saltRounds: 10
};
