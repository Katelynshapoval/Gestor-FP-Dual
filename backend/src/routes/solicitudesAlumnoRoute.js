const { Router } = require('express');
const multer = require('multer');
const { requireAuth, requireRole } = require('../middleware/auth');
const svc = require('../services/solicitudesAlumnoService');

const router = Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Solo se aceptan archivos PDF.'));
    }
    cb(null, true);
  },
});

// Public: submit student application with CV + ANEXO_2
router.post(
  '/solicitudes/alumno',
  upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'anexo2', maxCount: 1 }]),
  asyncHandler(svc.create)
);

// Admin / Coordinador
router.get('/solicitudes/alumno', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getAll));
router.get('/solicitudes/alumno/:id', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getById));
router.post('/solicitudes/alumno/:id/validar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.validar));
router.post('/solicitudes/alumno/:id/rechazar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.rechazar));
router.get('/solicitudes/alumno/:id/documentos', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getDocumentos));

// Multer error handler for this router
router.use((err, req, res, next) => {
  if (err.name === 'MulterError' || err.message === 'Solo se aceptan archivos PDF.') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
