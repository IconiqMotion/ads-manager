const { Router } = require('express');
const { authMiddleware } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/dashboard.controller');

const router = Router();

router.get('/trends', authMiddleware, ctrl.trends);

module.exports = router;
