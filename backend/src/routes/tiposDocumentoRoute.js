// Document types the centre can add (migration 025). Reading is for staff
// (the Plantillas page uses it); creating and editing, for administrators.
const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/tiposDocumento');

const router = Router();

router.get('/tipos-documento', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.list));
router.post('/tipos-documento', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.create));
router.put('/tipos-documento/:clave', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.update));

module.exports = router;
