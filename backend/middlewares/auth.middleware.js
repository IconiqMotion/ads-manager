const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { jwtSecret } = require('../config/auth');
const { log } = require('../utils/logger');
const db = require('../config/db');

function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function authMiddleware(req, res, next) {
  // Try JWT first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, jwtSecret);
      const user = await db('users').where({ id: decoded.userId }).first();
      if (!user) {
        log('WARN', 'auth', 'JWT valid but user not found', { requestId: req.requestId, userId: decoded.userId });
        return res.status(401).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      }
      req.user = { id: user.id, email: user.email, role: user.role, name: user.name };
      log('DEBUG', 'auth', 'JWT auth success', { userId: user.id, role: user.role });
      return next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: { code: 'TOKEN_EXPIRED', message: 'Token expired' } });
      }
      log('WARN', 'auth', 'JWT verification failed', { requestId: req.requestId, error: err.message });
      return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
    }
  }

  // Try API Key
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    const keyHash = hashApiKey(apiKey);
    const keyRecord = await db('api_keys').where({ key_hash: keyHash }).first();

    if (!keyRecord) {
      log('WARN', 'auth', 'Invalid API key', { requestId: req.requestId });
      return res.status(401).json({ error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } });
    }

    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
      log('WARN', 'auth', 'Expired API key', { requestId: req.requestId, keyId: keyRecord.id });
      return res.status(401).json({ error: { code: 'API_KEY_EXPIRED', message: 'API key expired' } });
    }

    await db('api_keys').where({ id: keyRecord.id }).update({ last_used: new Date() });

    const user = await db('users').where({ id: keyRecord.user_id }).first();
    req.user = { id: user.id, email: user.email, role: 'api_key', permissions: keyRecord.permissions };
    log('DEBUG', 'auth', 'API key auth success', { keyId: keyRecord.id, userId: user.id });
    return next();
  }

  log('DEBUG', 'auth', 'No auth provided', { path: req.path });
  return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role) && req.user.role !== 'admin') {
      log('WARN', 'auth', 'Insufficient role', {
        requestId: req.requestId,
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles
      });
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole, hashApiKey };
