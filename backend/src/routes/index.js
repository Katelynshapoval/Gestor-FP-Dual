const { Router } = require('express');

const router = Router();

// Manejador de errores asíncrono global para todas las rutas
router.use((err, req, res, next) => {
  console.error('Error no controlado en ruta:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// Rutas del nuevo esquema
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

// Ruta de compatibilidad para la subida pública de convenio
router.use(require('./convenioPublicoRoute'));

module.exports = router;
