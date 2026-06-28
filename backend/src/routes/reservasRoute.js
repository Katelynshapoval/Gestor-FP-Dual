const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const svc = require('../services/reservasService');

const router = Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// EMPRESA: view available students matching own specialities
router.get('/alumnos/disponibles', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.getAlumnosDisponibles));

// EMPRESA: own quota
router.get('/cupos/empresa', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.getCuposEmpresa));

// Admin/Coordinador: all reservations
router.get('/reservas', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getAll));

// EMPRESA: own reservations
router.get('/reservas/empresa', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.getMisReservas));

// EMPRESA: reserve a student
router.post('/reservas', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.reservar));

// EMPRESA: cancel own reservation (must supply motivo)
router.post('/reservas/:id/cancelar', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.cancelar));

// Admin/Coordinador: confirm reservation
router.post('/reservas/:id/confirmar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.confirmar));

module.exports = router;
