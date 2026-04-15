const NodeCache = require('node-cache');
const { log } = require('../utils/logger');

const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

function get(key) {
  const value = cache.get(key);
  if (value !== undefined) {
    log('DEBUG', 'cache', 'Cache hit', { key });
  }
  return value;
}

function set(key, value, ttl) {
  cache.set(key, value, ttl);
}

function del(key) {
  cache.del(key);
}

function invalidateSync() {
  // Clear all sync-dependent caches
  const keys = cache.keys();
  const syncKeys = keys.filter(k =>
    k.startsWith('dashboard:') || k.startsWith('industries:') || k.startsWith('gallery:')
  );
  if (syncKeys.length > 0) {
    cache.del(syncKeys);
    log('INFO', 'cache', 'Sync cache invalidated', { keysCleared: syncKeys.length });
  }
}

function flush() {
  cache.flushAll();
  log('INFO', 'cache', 'Cache flushed');
}

module.exports = { get, set, del, invalidateSync, flush };
