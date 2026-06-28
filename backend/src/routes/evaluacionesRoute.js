const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/evaluacionesService');

const router = Router();

router.get(
  '/evaluaciones/:idSolicitudAlumno',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'),
  asyncHandler(svc.getByIdSolicitudAlumno)
);

router.post(
  '/evaluaciones',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'),
  asyncHandler(svc.guardar)
);

module.exports = router;
