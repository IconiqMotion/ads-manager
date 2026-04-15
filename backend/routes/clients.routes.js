const { Router } = require('express');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/clients.controller');

const router = Router();

router.get('/', authMiddleware, ctrl.list);
router.get('/:id', authMiddleware, ctrl.getById);
router.post('/', authMiddleware, requireRole('admin', 'manager'), ctrl.create);
router.put('/:id', authMiddleware, requireRole('admin', 'manager'), ctrl.update);
router.delete('/:id', authMiddleware, requireRole('admin'), ctrl.remove);

module.exports = router;
