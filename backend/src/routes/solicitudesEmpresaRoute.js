const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/solicitudesEmpresaService');

const router = Router();

// Public: submit new company application
router.post('/solicitudes/empresa', asyncHandler(svc.create));

// Empresa: re-apply for the active convocatoria
router.post('/solicitudes/empresa/reapply', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.reapply));

// Empresa: view own active application
router.get('/solicitudes/empresa/mia', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.getMia));

// Admin / Coordinador: full normalised list
router.get('/solicitudes/empresa/todas', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getTodas));

// Admin / Coordinador: standard list with filters
router.get('/solicitudes/empresa', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getAll));

// Detail (admin, coordinador, and the owning empresa)
router.get('/solicitudes/empresa/:id', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'), asyncHandler(svc.getById));
router.get('/solicitudes/empresa/:id/especialidades', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'), asyncHandler(svc.getEspecialidades));
router.get('/solicitudes/empresa/:id/documentos', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'), asyncHandler(svc.getDocumentos));

// Validate / reject application
router.post('/solicitudes/empresa/:id/validar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.validar));
router.post('/solicitudes/empresa/:id/rechazar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.rechazar));

module.exports = router;
