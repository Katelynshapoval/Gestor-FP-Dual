const path = require("path");
const fs = require("fs");
const { Router } = require("express");

const MANUAL_PATH = path.resolve(__dirname, "../../../docs/MANUAL_DE_USUARIO.md");
const IMAGES_DIR = path.resolve(__dirname, "../../../docs/manual/imagenes");

function resolveManualImage(file) {
  const base = path.basename(String(file || ""));
  if (!/^[\w.-]+\.(png|jpe?g|webp|gif)$/i.test(base)) return null;
  const full = path.resolve(IMAGES_DIR, base);
  if (full !== path.join(IMAGES_DIR, base)) return null;
  return full;
}

const router = Router();

router.get("/ayuda/manual", (_req, res) => {
  fs.readFile(MANUAL_PATH, "utf8", (err, markdown) => {
    if (err) return res.status(404).json({ error: "El manual no está disponible." });
    res.json({ markdown });
  });
});

router.get("/ayuda/imagenes/:file", (req, res) => {
  const full = resolveManualImage(req.params.file);
  if (!full) return res.status(400).json({ error: "Archivo no válido." });
  res.sendFile(full, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "Imagen no encontrada." });
  });
});

module.exports = router;
module.exports.MANUAL_PATH = MANUAL_PATH;
module.exports.resolveManualImage = resolveManualImage;
