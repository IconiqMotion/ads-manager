const { log } = require('../utils/logger');

/**
 * Resolves the best available token for an ad account.
 * Priority: per-account token (from Fireberry) → business token → null
 */
function resolveToken(account) {
  log('DEBUG', 'token', 'Resolving token', {
    accountId: account.id,
    hasAccountToken: !!account.access_token,
    tokenExpires: account.token_expires,
    useBusinessFallback: account.use_business_token,
    tokenSource: account.token_source
  });

  // Step 1: Try per-account token
  if (account.access_token) {
    if (account.token_expires && new Date(account.token_expires) < new Date()) {
      log('WARN', 'token', 'Account token expired', {
        accountId: account.id,
        expiredAt: account.token_expires,
        source: account.token_source
      });
      // Fall through to business token
    } else {
      log('INFO', 'token', 'Using per-account token', { accountId: account.id, source: account.token_source });
      return { token: account.access_token, source: account.token_source || 'account' };
    }
  }

  // Step 2: Try business token
  if (account.use_business_token && process.env.META_BUSINESS_TOKEN) {
    log('INFO', 'token', 'Using business token fallback', { accountId: account.id });
    return { token: process.env.META_BUSINESS_TOKEN, source: 'business' };
  }

  // Step 3: No token
  log('ERROR', 'token', 'No valid token available', {
    accountId: account.id,
    hasAccountToken: !!account.access_token,
    accountTokenExpired: account.token_expires ? new Date(account.token_expires) < new Date() : null,
    hasBusinessToken: !!process.env.META_BUSINESS_TOKEN,
    useBusinessFallback: account.use_business_token
  });

  return null;
}

module.exports = { resolveToken };
