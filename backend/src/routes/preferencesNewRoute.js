const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/preferencesNewService');

const router = Router();

// GET /preferencias?id_especialidad=X
router.get('/preferencias', asyncHandler(svc.getByEspecialidad));

module.exports = router;
