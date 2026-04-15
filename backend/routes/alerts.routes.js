const { Router } = require('express');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/alerts.controller');

const router = Router();

router.get('/rules', authMiddleware, ctrl.listRules);
router.post('/rules', authMiddleware, requireRole('admin', 'manager'), ctrl.createRule);
router.delete('/rules/:id', authMiddleware, requireRole('admin'), ctrl.deleteRule);
router.get('/triggers', authMiddleware, ctrl.listTriggers);
router.post('/triggers/mark-read', authMiddleware, ctrl.markRead);
router.get('/triggers/unread-count', authMiddleware, ctrl.unreadCount);
router.post('/evaluate', authMiddleware, requireRole('admin'), ctrl.triggerEvaluation);

module.exports = router;
