const { Router } = require('express');
const multer = require('multer');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { pdfUpload, requirePdfSignature, NOT_PDF } = require('../middleware/pdfUpload');
const svc = require('../services/documentosService');
const plantillas = require('../services/plantillasService');

const router = Router();


// Re-upload a student document the caller is allowed to replace
router.post(
  '/documentos/alumno/:idSolicitud/:tipo',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'ALUMNO'),
  pdfUpload.single('archivo'), requirePdfSignature,
  asyncHandler(svc.uploadAlumno)
);

router.get('/documentos/alumno/mios', requireAuth, requireRole('ALUMNO'), asyncHandler(svc.getMios));

router.get('/documentos/seguimiento', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.seguimiento));

router.post('/documentos/generar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.generar));

router.post(
  '/documentos/subir',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA', 'ALUMNO'),
  pdfUpload.single('archivo'), requirePdfSignature,
  asyncHandler(svc.uploadContexto)
);

router.post(
  '/documentos/firmar',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA', 'ALUMNO'),
  asyncHandler(svc.firmarContexto)
);

router.post(
  '/documentos/:id/firmar',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA', 'ALUMNO'),
  asyncHandler(svc.firmar)
);

// Upload CONVENIO for a company application
router.post(
  '/documentos/empresa/:idSolicitud/convenio',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'),
  pdfUpload.single('archivo'), requirePdfSignature,
  asyncHandler(svc.uploadEmpresa)
);

// Upload the active reservation annex (Anexo II or III)
router.post(
  '/documentos/reserva/:idReserva/anexo',
  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR', 'EMPRESA'),
  pdfUpload.single('archivo'), requirePdfSignature,
  asyncHandler(svc.uploadReserva)
);

// Download document blob (authenticated, role-scoped)
router.get('/documentos/empresa', requireAuth, requireRole('EMPRESA'), asyncHandler(svc.getEmpresaDocumentos));
router.get('/documentos/:id/descargar', requireAuth, asyncHandler(svc.descargar));

// Validate / reject (admin / coordinador only)
router.post('/documentos/:id/validar',  requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.validar));
router.post('/documentos/:id/rechazar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.rechazar));

const docxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/documentos/plantillas', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(plantillas.list));
// SEC-6: templates are executed by docx-templates during generation, so only
// ADMINISTRADOR may upload them. Coordinators can still list and download.
router.post(
  '/documentos/plantillas',
  requireAuth, requireRole('ADMINISTRADOR'),
  docxUpload.single('archivo'),
  asyncHandler(plantillas.upload)
);
router.get('/documentos/plantillas/:id/descargar', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(plantillas.descargar));

// Forward multer errors as 400 responses
router.use((err, req, res, next) => {
  if (err.name === 'MulterError' || err.message === NOT_PDF) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
