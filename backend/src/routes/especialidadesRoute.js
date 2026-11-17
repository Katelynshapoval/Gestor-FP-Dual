// Ciclos. The active list is public (the application forms use it); the full
// list and changes are for administrators (Configuración › Ciclos).
const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/especialidadesService');

const router = Router();

router.get('/especialidades', asyncHandler(svc.getAll));
router.get('/especialidades/todas', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.listAdmin));
router.post('/especialidades', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.create));
router.put('/especialidades/:id', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.update));

module.exports = router;
