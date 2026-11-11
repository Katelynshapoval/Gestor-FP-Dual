// Editable email templates and their attachments (migrations 022 and 023).
// Administrators only.
const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { pdfUpload, requirePdfSignature, NOT_PDF } = require('../middleware/pdfUpload');
const svc = require('../services/correosService');

const router = Router();
const admin = [requireAuth, requireRole('ADMINISTRADOR')];

router.get('/correos', ...admin, asyncHandler(svc.list));
router.get('/correos/:clave', ...admin, asyncHandler(svc.get));
router.put('/correos/:clave', ...admin, asyncHandler(svc.update));
router.post('/correos/:clave/restaurar', ...admin, asyncHandler(svc.restaurar));
router.post('/correos/:clave/vista-previa', ...admin, asyncHandler(svc.vistaPrevia));
router.post('/correos/:clave/prueba', ...admin, asyncHandler(svc.prueba));
router.post('/correos/:clave/adjuntos', ...admin, asyncHandler(svc.agregarDocumento));
router.post(
  '/correos/:clave/adjuntos/archivo',
  ...admin,
  pdfUpload.single('archivo'),
  requirePdfSignature,
  asyncHandler(svc.subirArchivo),
);
router.delete('/correos/:clave/adjuntos/:id', ...admin, asyncHandler(svc.quitarAdjunto));
router.get('/correos/:clave/adjuntos/:id/archivo', ...admin, asyncHandler(svc.descargarAdjunto));

// Upload errors (not a PDF, too large) as 400 responses.
router.use('/correos', (err, _req, res, next) => {
  if (err?.name === 'MulterError' || err?.message === NOT_PDF) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'El PDF es demasiado grande.' : err.message;
    return res.status(400).json({ error: message });
  }
  return next(err);
});

module.exports = router;
