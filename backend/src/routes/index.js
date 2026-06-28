const { Router } = require('express');

const router = Router();

router.use(require('./authRoute'));
router.use(require('./convocatoriasRoute'));
router.use(require('./especialidadesRoute'));
router.use(require('./transportesRoute'));
router.use(require('./preferencesNewRoute'));
router.use(require('./solicitudesAlumnoRoute'));
router.use(require('./solicitudesEmpresaRoute'));
router.use(require('./documentosRoute'));
router.use(require('./reservasRoute'));
router.use(require('./evaluacionesRoute'));
router.use(require('./convenioPublicoRoute'));

// Global error handler — must come after all routes
router.use((err, req, res, _next) => {
  console.error('Unhandled route error:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = router;
