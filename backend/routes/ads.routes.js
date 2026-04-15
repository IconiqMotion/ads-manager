const { Router } = require('express');
const { authMiddleware } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/ads.controller');

const router = Router();

router.get('/:id', authMiddleware, ctrl.getById);
router.get('/:id/performance', authMiddleware, ctrl.getPerformance);
router.patch('/:id/industry', authMiddleware, ctrl.updateIndustry);
router.post('/:id/classify-industry', authMiddleware, ctrl.classifyIndustry);

module.exports = router;
