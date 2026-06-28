const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/transportesService');

const router = Router();

router.get('/transportes', asyncHandler(svc.getAll));
router.get('/tiposContrato', asyncHandler(svc.getTiposContrato));

module.exports = router;
