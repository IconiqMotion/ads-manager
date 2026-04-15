const { Router } = require('express');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/fireberry.controller');

const router = Router();

router.post('/sync-clients', authMiddleware, requireRole('admin'), ctrl.syncClients);
router.post('/sync-tokens', authMiddleware, requireRole('admin'), ctrl.syncTokens);
router.post('/sync-all', authMiddleware, requireRole('admin'), ctrl.syncAll);
router.get('/status', authMiddleware, ctrl.status);
router.get('/preview-clients', authMiddleware, requireRole('admin'), ctrl.previewClients);
router.get('/preview-tokens', authMiddleware, requireRole('admin'), ctrl.previewTokens);

module.exports = router;
