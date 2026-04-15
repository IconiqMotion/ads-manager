const { Router } = require('express');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/ad-accounts.controller');

const router = Router();

router.get('/', authMiddleware, ctrl.list);
router.get('/discover', authMiddleware, requireRole('admin'), ctrl.discover);
router.post('/import', authMiddleware, requireRole('admin'), ctrl.importAccounts);
router.post('/import-all', authMiddleware, requireRole('admin'), ctrl.importAll);
router.post('/validate-all', authMiddleware, requireRole('admin'), ctrl.validateAll);
router.get('/:id/token-status', authMiddleware, ctrl.tokenStatus);
router.put('/:id', authMiddleware, requireRole('admin'), ctrl.update);
router.delete('/:id', authMiddleware, requireRole('admin'), ctrl.remove);

module.exports = router;
