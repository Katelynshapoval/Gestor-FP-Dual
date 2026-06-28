const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const svc = require('../services/convocatoriasService');

const router = Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Public: active convocatoria info
router.get('/convocatorias/activa', asyncHandler(svc.getActiva));

// Admin/Coordinador only
router.get('/convocatorias', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getAll));
router.post('/convocatorias', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.create));
router.post('/convocatorias/:id/activar', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.activar));

module.exports = router;
