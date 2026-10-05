const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/empresaTutoresService');

const router = Router();

// EMPRESA: own tutors
router.get(
  '/tutores/empresa',
  requireAuth,
  requireRole('EMPRESA'),
  asyncHandler(svc.list)
);
router.post(
  '/tutores/empresa',
  requireAuth,
  requireRole('EMPRESA'),
  asyncHandler(svc.create)
);

// Staff (and EMPRESA for own company via ownership check): tutors by company id
router.get(
  '/tutores/empresa/:idEmpresa',
  requireAuth,
  requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'),
  asyncHandler(svc.list)
);
router.post(
  '/tutores/empresa/:idEmpresa',
  requireAuth,
  requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'),
  asyncHandler(svc.create)
);

router.patch(
  '/tutores/:id',
  requireAuth,
  requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'),
  asyncHandler(svc.update)
);
router.post(
  '/tutores/:id/desactivar',
  requireAuth,
  requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'),
  asyncHandler(svc.deactivate)
);

// Assign / clear tutor on a reservation
router.patch(
  '/reservas/:id/tutor',
  requireAuth,
  requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'),
  asyncHandler(svc.assignToReserva)
);

module.exports = router;
