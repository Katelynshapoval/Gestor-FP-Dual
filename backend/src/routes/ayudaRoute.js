const path = require("path");
const fs = require("fs");
const { Router } = require("express");
const { optionalAuth } = require("../middleware/auth");

const MANUAL_PATH = path.resolve(__dirname, "../../../docs/MANUAL_DE_USUARIO.md");
const IMAGES_DIR = path.resolve(__dirname, "../../../docs/manual/imagenes");

function resolveManualImage(file) {
  const base = path.basename(String(file || ""));
  if (!/^[\w.-]+\.(png|jpe?g|webp|gif)$/i.test(base)) return null;
  const full = path.resolve(IMAGES_DIR, base);
  if (full !== path.join(IMAGES_DIR, base)) return null;
  return full;
}

// Which manual chapters each visitor gets. The other chapters (introduction,
// access, navigation, public applications, special cases) are for everyone.
// - Not signed in: general + empresa + alumno (they may be about to apply).
// - Empresa / alumno: general + their own chapter.
// - Administración / coordinación: everything.
const STAFF = ["ADMINISTRADOR", "COORDINADOR"];
const CAPITULOS_RESTRINGIDOS = {
  administrador: [],
  coordinador: [],
  empresa: [null, "EMPRESA"],
  alumno: [null, "ALUMNO"],
};

function capituloVisible(id, rol) {
  if (STAFF.includes(rol)) return true;
  const permitidos = CAPITULOS_RESTRINGIDOS[id];
  if (!permitidos) return true;
  return permitidos.includes(rol || null);
}

const ANCHOR = /^<a id="([^"]+)"><\/a>\s*$/;
const CHAPTER_HEADING = /^##\s+/;

// Removes the chapters the visitor may not see, their lines in the index and
// any link into them (the link text stays).
function manualParaRol(markdown, rol) {
  const lines = String(markdown || "").split(/\r?\n/);

  // A chapter starts at an anchor line followed (after blank lines) by a ## heading.
  const starts = [];
  for (let i = 0; i < lines.length; i += 1) {
    const anchor = lines[i].match(ANCHOR);
    if (!anchor) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    if (j < lines.length && CHAPTER_HEADING.test(lines[j])) starts.push({ line: i, id: anchor[1] });
  }

  const ocultos = new Set();
  const keep = lines.map(() => true);
  starts.forEach((start, index) => {
    if (capituloVisible(start.id, rol)) return;
    const end = index + 1 < starts.length ? starts[index + 1].line : lines.length;
    for (let i = start.line; i < end; i += 1) {
      keep[i] = false;
      const anchor = lines[i].match(ANCHOR);
      if (anchor) ocultos.add(anchor[1]);
    }
  });
  if (!ocultos.size) return markdown;

  const out = [];
  let skippingIndexEntry = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (!keep[i]) continue;
    const line = lines[i];
    // Index entry "N. [Title](#chapter)" and its indented list of sections.
    const entry = line.match(/^\d+\.\s+\[[^\]]*\]\(#([^)]+)\)\s*$/);
    if (entry) skippingIndexEntry = ocultos.has(entry[1]);
    else if (!/^\s+-\s/.test(line)) skippingIndexEntry = false;
    if (skippingIndexEntry) continue;
    out.push(line.replace(/\[([^\]]+)\]\(#([^)]+)\)/g, (match, text, id) => (ocultos.has(id) ? text : match)));
  }
  return out.join("\n");
}

const router = Router();

router.get("/ayuda/manual", optionalAuth, (req, res) => {
  fs.readFile(MANUAL_PATH, "utf8", (err, markdown) => {
    if (err) return res.status(404).json({ error: "El manual no está disponible." });
    res.set("Cache-Control", "private, no-store");
    res.json({ markdown: manualParaRol(markdown, req.user?.rol) });
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
module.exports.manualParaRol = manualParaRol;
