const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const svc = require('../services/evaluacionesService');

const router = Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get(
  '/evaluaciones/:idSolicitudAlumno',
  requireAuth,
  requireRole('ADMINISTRADOR', 'COORDINADOR'),
  asyncHandler(svc.getByIdSolicitudAlumno)
);

router.post(
  '/evaluaciones',
  requireAuth,
  requireRole('ADMINISTRADOR', 'COORDINADOR'),
  asyncHandler(svc.guardar)
);

module.exports = router;
