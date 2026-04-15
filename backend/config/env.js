const { log } = require('../utils/logger');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

const REQUIRED_IN_PROD = [
  'JWT_SECRET',
  'DATABASE_URL',
  'FIREBERRY_TOKEN',
  'META_BUSINESS_TOKEN',
  'DEFAULT_ADMIN_PASSWORD',
  'CORS_ORIGIN'
];

function validate() {
  if (!isProd) return;

  const missing = REQUIRED_IN_PROD.filter((k) => !process.env[k]);
  if (missing.length) {
    log('ERROR', 'env', 'Missing required env vars in production', { missing });
    process.exit(1);
  }

  if (process.env.JWT_SECRET === 'change-me-in-production' || process.env.JWT_SECRET.length < 32) {
    log('ERROR', 'env', 'JWT_SECRET must be set to a strong value (>=32 chars) in production');
    process.exit(1);
  }

  if (process.env.DEFAULT_ADMIN_PASSWORD === 'admin123') {
    log('ERROR', 'env', 'DEFAULT_ADMIN_PASSWORD must not use the insecure default in production');
    process.exit(1);
  }
}

module.exports = { validate, isProd, NODE_ENV };
