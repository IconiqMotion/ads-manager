const { Router } = require('express');
const { authMiddleware } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/adsets.controller');

const router = Router();

router.get('/:id/ads', authMiddleware, ctrl.getAds);

module.exports = router;
