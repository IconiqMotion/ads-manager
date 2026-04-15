const { Router } = require('express');
const { authMiddleware } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/campaigns.controller');

const router = Router();

router.get('/', authMiddleware, ctrl.list);
router.get('/:id', authMiddleware, ctrl.getById);
router.get('/:id/adsets', authMiddleware, ctrl.getAdSets);

module.exports = router;
