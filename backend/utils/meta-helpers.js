const { RATE_LIMIT_DELAY_MS, BACKOFF_BASE_MS, MAX_RETRIES } = require('../config/meta-api');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimitDelay() {
  return sleep(RATE_LIMIT_DELAY_MS);
}

function getBackoffDelay(attempt) {
  return BACKOFF_BASE_MS * Math.pow(2, attempt);
}

module.exports = { sleep, rateLimitDelay, getBackoffDelay, MAX_RETRIES };
