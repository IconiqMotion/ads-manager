const { Router } = require('express');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/auth.controller');

const router = Router();

router.post('/login', ctrl.login);
router.post('/register', authMiddleware, requireRole('admin'), ctrl.register);
router.get('/me', authMiddleware, ctrl.me);
router.post('/api-keys', authMiddleware, ctrl.createApiKey);
router.get('/api-keys', authMiddleware, ctrl.listApiKeys);
router.delete('/api-keys/:id', authMiddleware, ctrl.deleteApiKey);

module.exports = router;
