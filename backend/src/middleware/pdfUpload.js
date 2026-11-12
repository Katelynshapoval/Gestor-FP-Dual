// Shared multer setup for PDF uploads.
// SEC-008: the declared MIME type comes from the client, so after multer has
// read the files each one must also start with the PDF signature. Anything
// else is refused before a service stores it.
const multer = require('multer');

const NOT_PDF = 'Solo se aceptan archivos PDF.';
const PDF_SIGNATURE = Buffer.from('%PDF-');
// The PDF header may follow a few junk bytes; readers look in the first 1 KB.
const SIGNATURE_WINDOW = 1024;

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error(NOT_PDF));
    cb(null, true);
  },
});

function isPdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, SIGNATURE_WINDOW).indexOf(PDF_SIGNATURE) !== -1;
}

function uploadedFiles(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files) return Object.values(req.files).flat();
  return [];
}

function requirePdfSignature(req, res, next) {
  if (uploadedFiles(req).some((f) => !isPdf(f.buffer))) {
    return res.status(400).json({ error: NOT_PDF });
  }
  return next();
}

// Multer reports problems in English ("File too large"): say it in Spanish.
const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'El archivo supera el tamaño máximo de 10 MB. Comprímelo o escanéalo con menos calidad.',
  LIMIT_FILE_COUNT: 'Se han enviado demasiados archivos.',
  LIMIT_UNEXPECTED_FILE: 'Se ha enviado un archivo que no se esperaba.',
  LIMIT_PART_COUNT: 'El formulario tiene demasiados campos.',
  LIMIT_FIELD_VALUE: 'Un campo del formulario es demasiado largo.',
};

function uploadErrorMessage(err) {
  if (err?.name === 'MulterError') return MULTER_MESSAGES[err.code] || 'No se ha podido recibir el archivo.';
  return err?.message;
}

module.exports = { pdfUpload, requirePdfSignature, isPdf, NOT_PDF, uploadErrorMessage };
