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

// Re-upload CV or ANEXO_2 for a student application (admin / coordinador)
router.post(
  '/documentos/alumno/:idSolicitud/:tipo',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'),
  pdfUpload.single('archivo'),
  asyncHandler(svc.uploadAlumno)
);

// Upload CONVENIO for a company application
router.post(
  '/documentos/empresa/:idSolicitud/convenio',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'),
  pdfUpload.single('archivo'),
  asyncHandler(svc.uploadEmpresa)
);

// Upload ANEXO_H for a confirmed reservation
router.post(
  '/documentos/reserva/:idReserva/anexoh',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'),
  pdfUpload.single('archivo'),
  asyncHandler(svc.uploadReserva)
);

// Download document blob (authenticated)
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
