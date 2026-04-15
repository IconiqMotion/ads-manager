const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { jwtSecret, jwtExpiry, saltRounds } = require('../config/auth');
const { hashApiKey } = require('../middlewares/auth.middleware');
const { log } = require('../utils/logger');
const db = require('../config/db');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email and password required' } });
    }

    const user = await db('users').where({ email: email.toLowerCase() }).first();
    if (!user) {
      log('WARN', 'auth', 'Login failed - user not found', { requestId: req.requestId, email });
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      log('WARN', 'auth', 'Login failed - wrong password', { requestId: req.requestId, email });
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, jwtSecret, { expiresIn: jwtExpiry });

    log('INFO', 'auth', 'Login success', { requestId: req.requestId, userId: user.id, role: user.role });
    res.json({ data: { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } } });
  } catch (err) {
    next(err);
  }
}

async function register(req, res, next) {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email and password required' } });
    }

    const validRoles = ['admin', 'manager', 'viewer'];
    const userRole = validRoles.includes(role) ? role : 'viewer';

    const exists = await db('users').where({ email: email.toLowerCase() }).first();
    if (exists) {
      return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Email already registered' } });
    }

    const hash = await bcrypt.hash(password, saltRounds);
    const [user] = await db('users').insert({
      email: email.toLowerCase(),
      password_hash: hash,
      name: name || null,
      role: userRole
    }).returning(['id', 'email', 'name', 'role']);

    log('INFO', 'auth', 'User registered', { requestId: req.requestId, userId: user.id, role: userRole });
    res.status(201).json({ data: user });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json({ data: req.user });
}

async function createApiKey(req, res, next) {
  try {
    const { name, expires_in_days } = req.body;
    const rawKey = `ak_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = hashApiKey(rawKey);

    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000)
      : null;

    const [record] = await db('api_keys').insert({
      user_id: req.user.id,
      key_hash: keyHash,
      name: name || 'Unnamed key',
      permissions: 'read',
      expires_at: expiresAt
    }).returning(['id', 'name', 'permissions', 'expires_at', 'created_at']);

    log('INFO', 'auth', 'API key created', { requestId: req.requestId, userId: req.user.id, keyId: record.id });
    res.status(201).json({ data: { ...record, key: rawKey } });
  } catch (err) {
    next(err);
  }
}

async function listApiKeys(req, res, next) {
  try {
    const keys = await db('api_keys')
      .where({ user_id: req.user.id })
      .select('id', 'name', 'permissions', 'last_used', 'expires_at', 'created_at')
      .orderBy('created_at', 'desc');
    res.json({ data: keys });
  } catch (err) {
    next(err);
  }
}

async function deleteApiKey(req, res, next) {
  try {
    const { id } = req.params;
    const key = await db('api_keys').where({ id, user_id: req.user.id }).first();
    if (!key) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API key not found' } });
    }
    await db('api_keys').where({ id }).del();
    log('INFO', 'auth', 'API key deleted', { requestId: req.requestId, keyId: id });
    res.json({ data: { message: 'API key deleted' } });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, register, me, createApiKey, listApiKeys, deleteApiKey };
