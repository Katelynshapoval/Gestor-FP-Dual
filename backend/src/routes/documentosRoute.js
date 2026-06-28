const { Router } = require('express');
const multer = require('multer');
const { requireAuth, requireRole } = require('../middleware/auth');
const svc = require('../services/documentosService');

const router = Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Solo se aceptan archivos PDF.'));
    }
    cb(null, true);
  },
});

// Upload CV or ANEXO_2 for student application (public for initial submission, auth for re-upload)
router.post(
  '/documentos/alumno/:idSolicitud/:tipo',
  requireAuth,
  requireRole('ADMINISTRADOR', 'COORDINADOR'),
  upload.single('archivo'),
  asyncHandler(svc.uploadAlumno)
);

// Upload CONVENIO for company application (empresa or admin)
router.post(
  '/documentos/empresa/:idSolicitud/convenio',
  requireAuth,
  requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'),
  upload.single('archivo'),
  asyncHandler(svc.uploadEmpresa)
);

// Upload ANEXO_H for a reservation
router.post(
  '/documentos/reserva/:idReserva/anexoh',
  requireAuth,
  requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'),
  upload.single('archivo'),
  asyncHandler(svc.uploadReserva)
);

// Download document blob
router.get(
  '/documentos/:id/descargar',
  requireAuth,
  asyncHandler(svc.descargar)
);

// Validate / reject documents (admin/coordinador only)
router.post('/documentos/:id/validar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.validar));
router.post('/documentos/:id/rechazar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.rechazar));

// Multer error handler
router.use((err, req, res, next) => {
  if (err.name === 'MulterError' || err.message === 'Solo se aceptan archivos PDF.') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
