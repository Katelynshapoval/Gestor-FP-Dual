const { Router } = require('express');
const svc = require('../services/especialidadesService');

const router = Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/especialidades', asyncHandler(svc.getAll));

module.exports = router;
