const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/reservasService');

const router = Router();

// Empresa: available students matching own specialities
router.get('/alumnos/disponibles', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.getAlumnosDisponibles));

// Empresa: own offer quotas
router.get('/cupos/empresa', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.getCuposEmpresa));

// Admin / Coordinador: all reservations
router.get('/reservas', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getAll));

// Empresa: own reservations
router.get('/reservas/empresa', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.getMisReservas));

// Alumno: own reservations
router.get('/reservas/alumno', requireAuth, requireRole('ALUMNO'), asyncHandler(svc.getReservasAlumno));

// Admin / Coordinador: eligible company offers for a student
router.get('/reservas/ofertas-elegibles', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getOfertasElegibles));

// Empresa: reserve a student
router.post('/reservas', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.reservar));

// Admin / Coordinador: reserve a student for a company offer
router.post('/reservas/admin', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.reservarAdmin));

// Empresa: cancel own pending reservation (motivo required)
router.post('/reservas/:id/cancelar', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.cancelar));

// Admin / Coordinador: cancel pending or confirmed reservation
router.post('/reservas/:id/cancelar-admin', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.cancelarAdmin));

// Admin / Coordinador: atomic reassignment to another eligible offer
router.post('/reservas/:id/reasignar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.reasignar));

// Admin / Coordinador: confirm reservation
router.post('/reservas/:id/confirmar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.confirmar));

module.exports = router;
