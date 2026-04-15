const { Router } = require('express');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/query.controller');

const router = Router();

// Raw SQL — admin only
router.post('/raw', authMiddleware, requireRole('admin'), ctrl.rawQuery);

// Builder — all authenticated + API key
router.post('/builder', authMiddleware, ctrl.builderQuery);

// Schema discovery
router.get('/schema', authMiddleware, ctrl.schema);
router.get('/schema/relationships', authMiddleware, ctrl.schemaRelationships);
router.get('/schema/:table', authMiddleware, ctrl.schemaTable);

// Saved queries
router.post('/saved', authMiddleware, requireRole('admin', 'manager'), ctrl.saveQuery);
router.get('/saved', authMiddleware, ctrl.listSaved);
router.get('/saved/:id', authMiddleware, ctrl.getSaved);
router.post('/saved/:id/run', authMiddleware, ctrl.runSaved);
router.delete('/saved/:id', authMiddleware, ctrl.deleteSaved);

module.exports = router;
