const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const svc = require('../services/convocatoriasService');

const router = Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/convocatorias/activa', asyncHandler(svc.getActiva));

router.get('/convocatorias',  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getAll));
router.post('/convocatorias', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.create));
router.put('/convocatorias/:id', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.update));

module.exports = router;
