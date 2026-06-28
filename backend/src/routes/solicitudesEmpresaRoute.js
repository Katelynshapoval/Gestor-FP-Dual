const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const svc = require('../services/solicitudesEmpresaService');

const router = Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Pública: envío de nueva solicitud de empresa
router.post('/solicitudes/empresa', asyncHandler(svc.create));

// Empresa autenticada: reaplicar en la convocatoria activa
router.post('/solicitudes/empresa/reapply', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.reapply));

// Empresa autenticada: ver su propia solicitud activa
router.get('/solicitudes/empresa/mia', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.getMia));

// Admin/Coordinador: lista completa normalizada (sustituye a /getAllCompanies)
router.get('/solicitudes/empresa/todas', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getTodas));

// Admin/Coordinador: lista estándar con filtros
router.get('/solicitudes/empresa', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getAll));

// Detalle de una solicitud (admin, coordinador y empresa dueña)
router.get('/solicitudes/empresa/:id', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'), asyncHandler(svc.getById));

// Especialidades y cupos de una solicitud
router.get('/solicitudes/empresa/:id/especialidades', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'), asyncHandler(svc.getEspecialidades));

// Documentos de una solicitud
router.get('/solicitudes/empresa/:id/documentos', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'), asyncHandler(svc.getDocumentos));

// Validar / rechazar solicitud
router.post('/solicitudes/empresa/:id/validar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.validar));
router.post('/solicitudes/empresa/:id/rechazar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.rechazar));

module.exports = router;
