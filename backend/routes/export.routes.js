const { Router } = require('express');
const { authMiddleware } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/export.controller');

const router = Router();

router.get('/csv', authMiddleware, ctrl.exportCsv);

module.exports = router;
