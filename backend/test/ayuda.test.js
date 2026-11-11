const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { MANUAL_PATH, resolveManualImage } = require("../src/routes/ayudaRoute");

test("help manual is readable and image names cannot leave the folder", () => {
  assert.equal(fs.existsSync(MANUAL_PATH), true);
  const markdown = fs.readFileSync(MANUAL_PATH, "utf8");
  assert.match(markdown, /Manual de usuario/);
  assert.equal(resolveManualImage("../package.json"), null);
  assert.equal(resolveManualImage("..\\package.json"), null);
  assert.equal(resolveManualImage("inicio-sesion.png")?.endsWith("inicio-sesion.png"), true);
  assert.equal(fs.existsSync(resolveManualImage("inicio-sesion.png")), true);
});

test("the manual a visitor receives depends on their role", () => {
  const { manualParaRol } = require("../src/routes/ayudaRoute");
  const markdown = fs.readFileSync(MANUAL_PATH, "utf8");
  const capitulos = (rol) =>
    [...manualParaRol(markdown, rol).matchAll(/<a id="([^"]+)"><\/a>\s*\n\s*\n?## /g)].map((m) => m[1]);
  const general = ["introduccion", "acceso", "navegacion", "solicitudes-publicas", "situaciones-especiales"];
  const has = (rol, ids) => ids.forEach((id) => assert.ok(capitulos(rol).includes(id), `${rol} debería ver ${id}`));
  const lacks = (rol, ids) => ids.forEach((id) => assert.ok(!capitulos(rol).includes(id), `${rol} no debería ver ${id}`));

  has(undefined, [...general, "empresa", "alumno"]);
  lacks(undefined, ["administrador", "coordinador"]);
  has("EMPRESA", [...general, "empresa"]);
  lacks("EMPRESA", ["administrador", "coordinador", "alumno"]);
  has("ALUMNO", [...general, "alumno"]);
  lacks("ALUMNO", ["administrador", "coordinador", "empresa"]);
  for (const rol of ["ADMINISTRADOR", "COORDINADOR"]) {
    has(rol, [...general, "administrador", "coordinador", "empresa", "alumno"]);
  }

  // Index lines and links into hidden chapters go too.
  const alumno = manualParaRol(markdown, "ALUMNO");
  assert.doesNotMatch(alumno, /\]\(#(administrador|coordinador|empresa|baja|staff-[\w-]+|empresa-[\w-]+)\)/);
  assert.doesNotMatch(alumno, /Manual de empresa/);
});
