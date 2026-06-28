const { Router } = require('express');
const svc = require('../services/preferencesNewService');

const router = Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /preferencias?id_especialidad=X — preferencias por especialidad
router.get('/preferencias', asyncHandler(svc.getByEspecialidad));

module.exports = router;
