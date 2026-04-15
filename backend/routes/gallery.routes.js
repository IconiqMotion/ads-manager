const { Router } = require('express');
const { authMiddleware } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/gallery.controller');

const router = Router();

router.get('/', authMiddleware, ctrl.list);
router.get('/:ad_id', authMiddleware, ctrl.getByAdId);

module.exports = router;
