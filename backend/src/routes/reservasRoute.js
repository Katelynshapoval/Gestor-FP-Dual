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

// Empresa: reserve a student
router.post('/reservas', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.reservar));

// Empresa: cancel own reservation (motivo required)
router.post('/reservas/:id/cancelar', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.cancelar));

// Admin / Coordinador: confirm reservation
router.post('/reservas/:id/confirmar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.confirmar));

module.exports = router;
