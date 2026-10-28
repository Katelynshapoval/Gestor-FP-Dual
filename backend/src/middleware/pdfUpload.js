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

module.exports = { pdfUpload, requirePdfSignature, isPdf, NOT_PDF };
