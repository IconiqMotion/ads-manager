const { Router } = require('express');
const { authMiddleware } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/dashboard.controller');

const router = Router();

router.get('/overview', authMiddleware, ctrl.overview);
router.get('/by-industry', authMiddleware, ctrl.byIndustry);
router.get('/by-client/:id', authMiddleware, ctrl.byClient);
router.get('/top-ads', authMiddleware, ctrl.topAds);
router.get('/trends/compare', authMiddleware, ctrl.trendsComparison);
router.get('/benchmarks', authMiddleware, ctrl.benchmarks);

module.exports = router;
