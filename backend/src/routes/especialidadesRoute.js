const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/especialidadesService');

const router = Router();

router.get('/especialidades', asyncHandler(svc.getAll));

module.exports = router;
