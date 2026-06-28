const { Router } = require('express');
const svc = require('../services/transportesService');

const router = Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/transportes', asyncHandler(svc.getAll));
router.get('/tiposContrato', asyncHandler(svc.getTiposContrato));

module.exports = router;
