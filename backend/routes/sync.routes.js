const { Router } = require('express');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/sync.controller');

const router = Router();

router.post('/trigger/:ad_account_id', authMiddleware, requireRole('admin'), ctrl.triggerOne);
router.post('/trigger-all', authMiddleware, requireRole('admin'), ctrl.triggerAll);
router.get('/status', authMiddleware, ctrl.statusList);
router.get('/status/:id', authMiddleware, ctrl.statusDetail);

module.exports = router;
