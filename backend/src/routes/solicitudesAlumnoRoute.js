const { Router } = require('express');
const multer = require('multer');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/solicitudesAlumnoService');
const cambios = require('../services/alumnoCambiosService');
const baja = require('../services/bajaService').handlers('SOLICITUD_ALUMNO');

const router = Router();

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error('Solo se aceptan archivos PDF.'));
    cb(null, true);
  },
});

// Public: submit student application with CV + Anexo DGA
router.post(
  '/solicitudes/alumno',
  pdfUpload.fields([{ name: 'cv', maxCount: 1 }, { name: 'anexoDga', maxCount: 1 }]),
  asyncHandler(svc.create)
);

// Alumno: own current application (must be registered before /:id)
router.get('/solicitudes/alumno/mia', requireAuth, requireRole('ALUMNO'), asyncHandler(svc.getMia));
router.get('/solicitudes/alumno/mia/datos', requireAuth, requireRole('ALUMNO'), asyncHandler(cambios.getMisDatos));
router.post('/solicitudes/alumno/mia/cambios', requireAuth, requireRole('ALUMNO'), asyncHandler(cambios.upsertMiCambio));

// Admin / Coordinador
router.get('/solicitudes/alumno', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getAll));
router.get('/solicitudes/alumno/:id', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getById));
router.post('/solicitudes/alumno/:id/validar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.validar));
router.post('/solicitudes/alumno/:id/rechazar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.rechazar));
router.post('/solicitudes/alumno/:id/reabrir', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.reabrir));

// Corrección de datos del alumno (Administración only). The DNI is never editable.
router.get('/solicitudes/alumno/:id/datos', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.getDatos));
router.put('/solicitudes/alumno/:id/datos', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.putDatos));
router.get('/solicitudes/alumno/:id/cambios', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(cambios.getCambio));
router.post('/solicitudes/alumno/:id/cambios/:idCambio/aprobar', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(cambios.aprobarCambio));
router.post('/solicitudes/alumno/:id/cambios/:idCambio/rechazar', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(cambios.rechazarCambio));

// Dar de baja / reactivar (Administración only, Phase 5)
router.get('/solicitudes/alumno/:id/baja', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(baja.preview));
router.post('/solicitudes/alumno/:id/baja', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(baja.baja));
router.post('/solicitudes/alumno/:id/reactivar', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(baja.reactivar));
router.get('/solicitudes/alumno/:id/documentos', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getDocumentos));

// Forward multer errors as 400 responses
router.use((err, req, res, next) => {
  if (err.name === 'MulterError' || err.message === 'Solo se aceptan archivos PDF.') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
