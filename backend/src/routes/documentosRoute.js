const { Router } = require('express');
const multer = require('multer');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/documentosService');

const router = Router();

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error('Solo se aceptan archivos PDF.'));
    cb(null, true);
  },
});

// Re-upload a student document the caller is allowed to replace
router.post(
  '/documentos/alumno/:idSolicitud/:tipo',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'ALUMNO'),
  pdfUpload.single('archivo'),
  asyncHandler(svc.uploadAlumno)
);

router.get('/documentos/alumno/mios', requireAuth, requireRole('ALUMNO'), asyncHandler(svc.getMios));

router.post(
  '/documentos/subir',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA', 'ALUMNO'),
  pdfUpload.single('archivo'),
  asyncHandler(svc.uploadContexto)
);

router.post(
  '/documentos/firmar',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA', 'ALUMNO'),
  asyncHandler(svc.firmarContexto)
);

// Upload CONVENIO for a company application
router.post(
  '/documentos/empresa/:idSolicitud/convenio',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'),
  pdfUpload.single('archivo'),
  asyncHandler(svc.uploadEmpresa)
);

// Upload the active reservation annex (Anexo II or III)
router.post(
  '/documentos/reserva/:idReserva/anexo',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'),
  pdfUpload.single('archivo'),
  asyncHandler(svc.uploadReserva)
);

// Download document blob (authenticated, role-scoped)
router.get('/documentos/empresa', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.getEmpresaDocumentos));
router.get('/documentos/:id/descargar', requireAuth, asyncHandler(svc.descargar));

// Validate / reject (admin / coordinador only)
router.post('/documentos/:id/validar',  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.validar));
router.post('/documentos/:id/rechazar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.rechazar));

// Forward multer errors as 400 responses
router.use((err, req, res, next) => {
  if (err.name === 'MulterError' || err.message === 'Solo se aceptan archivos PDF.') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
