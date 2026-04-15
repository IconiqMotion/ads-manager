const { Router } = require('express');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/industries.controller');

const router = Router();

router.get('/', authMiddleware, ctrl.list);
router.post('/', authMiddleware, requireRole('admin', 'manager'), ctrl.create);
router.put('/:id', authMiddleware, requireRole('admin', 'manager'), ctrl.update);
router.delete('/:id', authMiddleware, requireRole('admin'), ctrl.remove);
router.post('/classify', authMiddleware, requireRole('admin'), ctrl.classify);

module.exports = router;
