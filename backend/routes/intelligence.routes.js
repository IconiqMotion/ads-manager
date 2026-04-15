const { Router } = require('express');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/intelligence.controller');

const router = Router();

// AI Tagging
router.post('/tag/:id', authMiddleware, requireRole('admin'), ctrl.tagSingleAd);
router.post('/tag-batch', authMiddleware, requireRole('admin'), ctrl.tagBatch);

// Insights
router.post('/insights/generate', authMiddleware, requireRole('admin'), ctrl.generateInsightsHandler);
router.get('/insights', authMiddleware, ctrl.listInsights);
router.post('/insights/mark-read', authMiddleware, ctrl.markInsightsRead);

// Clustering
router.get('/similar/:id', authMiddleware, ctrl.similarAds);
router.get('/industry-styles/:id', authMiddleware, ctrl.industryStyles);

// Image Similarity (RAG)
router.post('/similar-by-image', authMiddleware, ctrl.similarByImage);
router.post('/backfill-embeddings', authMiddleware, requireRole('admin'), ctrl.backfillEmbeddingsHandler);

// Logo Removal
router.post('/remove-logo/:ad_id', authMiddleware, ctrl.removeLogoHandler);
router.post('/remove-logo-batch', authMiddleware, requireRole('admin'), ctrl.batchRemoveLogoHandler);

// Recommendations
router.get('/budget-recommendations/:id', authMiddleware, ctrl.budgetRecommendations);
router.get('/creative-recommendations/:id', authMiddleware, ctrl.creativeRecommendations);

module.exports = router;
