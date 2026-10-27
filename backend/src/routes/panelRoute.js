const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const svc = require('../services/panelService');

const router = Router();

// Staff dashboard counters for one convocatoria (Phase 4).
router.get('/panel/resumen', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.resumen));

module.exports = router;
