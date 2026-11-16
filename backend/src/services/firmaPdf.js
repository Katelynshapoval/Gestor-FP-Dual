// Signature images inside PDFs (migration 027, docs/tecnica/logica-de-negocio/documentos-y-firmas.md § 4).
//
// Marks. A template says where each person signs with <<firmaEmpresa>>,
// <<firmaCentro>>, <<firmaAlumno>> and <<firmaTutorLegal>>. Generation turns
// each one into an empty box that is a link to https://firma.invalid/<MARCA>.
// Chromium writes links as PDF annotations with their exact rectangle, so
// leerMarcas() finds page and rectangle of every box and removes the
// annotation: no link stays in the document.
//
// Stamping. estampar() draws each image inside the rectangle of its mark,
// keeping its proportions. A signer without a mark (uploaded PDFs, templates
// without the variable, older documents) goes on a "Hoja de firmas" page added
// once at the end; `_hoja` in the positions remembers the page and how many
// places are taken.
//
// Neither function touches the database.
const { PDFDocument, PDFName, PDFArray, PDFDict, StandardFonts, rgb } = require("pdf-lib");

const MARCAS = ["EMPRESA", "CENTRO", "ALUMNO", "TUTOR"];
const HOST = "firma.invalid";

// Template variable → mark, and the token docx-templates prints for it.
const VARIABLES_FIRMA = [
  ["firmaEmpresa", "EMPRESA", "Lugar de la firma de la empresa"],
  ["firmaCentro", "CENTRO", "Lugar de la firma y el sello del centro"],
  ["firmaAlumno", "ALUMNO", "Lugar de la firma del alumno"],
  ["firmaTutorLegal", "TUTOR", "Lugar de la firma del tutor legal (alumnos menores de edad)"],
];
const token = (marca) => `[[FIRMA:${marca}]]`;
const TOKEN_RE = /\[\[FIRMA:(EMPRESA|CENTRO|ALUMNO|TUTOR)\]\]/g;

// Box size in cm. The centre's image carries the seal, so it is taller.
const CAJA_CM = {
  EMPRESA: [5, 2.2],
  ALUMNO: [5, 2.2],
  TUTOR: [5, 2.2],
  CENTRO: [5.5, 3.2],
};

// Values generation adds to the template data: one token per variable.
function datosDeMarcas() {
  return Object.fromEntries(VARIABLES_FIRMA.map(([nombre, marca]) => [nombre, token(marca)]));
}

function cajaHtml(marca) {
  const [ancho, alto] = CAJA_CM[marca];
  return `<a href="https://${HOST}/${marca}" style="display:inline-block;width:${ancho}cm;max-width:100%;height:${alto}cm;text-decoration:none"></a>`;
}

// The tokens reach the HTML as plain text (mammoth escapes nothing in them).
function marcasEnHtml(html) {
  return String(html || "").replace(TOKEN_RE, (_, marca) => cajaHtml(marca));
}

// Marks a template text contains, for the warning in Documentos › Plantillas.
function marcasEnTexto(texto) {
  const plano = String(texto || "").replace(/\s+/g, "");
  return VARIABLES_FIRMA.filter(([nombre]) => plano.includes(`<<${nombre}>>`)).map(([, marca]) => marca);
}

const redondo = (n) => Math.round(n * 100) / 100;

// → { pdf: Buffer without the mark links, posiciones: { ALUMNO: { p, x, y, w, h }, … } | null }
async function leerMarcas(pdfBuffer) {
  let doc;
  try {
    doc = await PDFDocument.load(pdfBuffer);
  } catch {
    // A file pdf-lib cannot read simply has no marks: its signatures go on the
    // Hoja de firmas (or stay as a confirmation if it cannot be changed at all).
    return { pdf: Buffer.from(pdfBuffer), posiciones: null };
  }
  const posiciones = {};
  doc.getPages().forEach((page, index) => {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) return;
    for (let k = annots.size() - 1; k >= 0; k -= 1) {
      const annot = annots.lookupMaybe(k, PDFDict);
      const accion = annot?.lookupMaybe(PDFName.of("A"), PDFDict);
      const uri = accion?.lookup(PDFName.of("URI"));
      const destino = uri?.decodeText ? uri.decodeText() : "";
      const marca = new RegExp(`^https?://${HOST.replace(".", "\\.")}/([A-Z]+)`).exec(destino)?.[1];
      if (!marca || !MARCAS.includes(marca)) continue;
      const rect = annot.lookup(PDFName.of("Rect"), PDFArray).asRectangle();
      annots.remove(k);
      if (rect.width < 20 || rect.height < 10) continue; // a box Chromium squeezed to nothing
      posiciones[marca] = {
        p: index + 1,
        x: redondo(rect.x),
        y: redondo(rect.y),
        w: redondo(rect.width),
        h: redondo(rect.height),
      };
    }
  });
  if (!Object.keys(posiciones).length) return { pdf: Buffer.from(pdfBuffer), posiciones: null };
  return { pdf: Buffer.from(await doc.save()), posiciones };
}

// Largest size that fits the box, centred in it.
function encajar(imagen, caja) {
  const escala = Math.min(caja.w / imagen.width, caja.h / imagen.height);
  const width = imagen.width * escala;
  const height = imagen.height * escala;
  return { x: caja.x + (caja.w - width) / 2, y: caja.y + (caja.h - height) / 2, width, height };
}

// The standard fonts only know WinAnsi: anything else would throw.
function textoSeguro(texto, max = 60) {
  const limpio = String(texto || "")
    .normalize("NFC")
    .replace(/[^\x20-\x7E\u00A1-\u00FF]/g, "?")
    .trim();
  return limpio.slice(0, max);
}

const A4 = [595.28, 841.89];
const HOJA = { margen: 56, columnas: 2, alto: 170, primera: 690, plazas: 8 };

function plazaDeHoja(n) {
  const ancho = (A4[0] - HOJA.margen * 2) / HOJA.columnas;
  const columna = n % HOJA.columnas;
  const fila = Math.floor(n / HOJA.columnas);
  return { x: HOJA.margen + columna * ancho, top: HOJA.primera - fila * HOJA.alto, ancho: ancho - 16 };
}

function fechaEs(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const dos = (n) => String(n).padStart(2, "0");
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// sellos: [{ marca, png: Buffer, titulo, nombre }]
// → { pdf: Buffer, posiciones, ubicaciones: { ALUMNO: 'MARCA' | 'HOJA', … } }
// Throws when the PDF cannot be opened or changed (encrypted, damaged).
async function estampar(pdfBuffer, posiciones, sellos, { nombreDocumento = "", fecha = new Date() } = {}) {
  const doc = await PDFDocument.load(pdfBuffer);
  const nuevas = { ...(posiciones || {}) };
  const ubicaciones = {};
  let fuentes = null;

  for (const sello of sellos) {
    const imagen = await doc.embedPng(sello.png);
    const caja = nuevas[sello.marca];
    const pagina = caja ? doc.getPages()[caja.p - 1] : null;
    if (caja && pagina) {
      pagina.drawImage(imagen, encajar(imagen, caja));
      ubicaciones[sello.marca] = "MARCA";
      continue;
    }

    if (!fuentes) {
      fuentes = {
        normal: await doc.embedFont(StandardFonts.Helvetica),
        negrita: await doc.embedFont(StandardFonts.HelveticaBold),
      };
    }
    const gris = rgb(0.4, 0.4, 0.4);
    let hoja = nuevas._hoja && doc.getPages()[nuevas._hoja.p - 1] ? { ...nuevas._hoja } : null;
    if (!hoja || hoja.n >= HOJA.plazas) {
      const page = doc.addPage(A4);
      page.drawText("Hoja de firmas", { x: HOJA.margen, y: 770, size: 18, font: fuentes.negrita });
      if (nombreDocumento) {
        page.drawText(textoSeguro(nombreDocumento, 90), { x: HOJA.margen, y: 750, size: 11, font: fuentes.normal });
      }
      page.drawText("Las firmas de esta hoja corresponden al documento que la precede.", {
        x: HOJA.margen, y: 732, size: 9, font: fuentes.normal, color: gris,
      });
      page.drawLine({
        start: { x: HOJA.margen, y: 720 }, end: { x: A4[0] - HOJA.margen, y: 720 }, thickness: 0.5, color: gris,
      });
      hoja = { p: doc.getPageCount(), n: 0 };
    }
    const page = doc.getPages()[hoja.p - 1];
    const plaza = plazaDeHoja(hoja.n);
    page.drawText(textoSeguro(sello.titulo, 40), { x: plaza.x, y: plaza.top, size: 10, font: fuentes.negrita });
    if (sello.nombre) {
      page.drawText(textoSeguro(sello.nombre, 44), { x: plaza.x, y: plaza.top - 14, size: 9, font: fuentes.normal });
    }
    page.drawImage(imagen, encajar(imagen, { x: plaza.x, y: plaza.top - 118, w: plaza.ancho, h: 94 }));
    page.drawLine({
      start: { x: plaza.x, y: plaza.top - 124 }, end: { x: plaza.x + plaza.ancho, y: plaza.top - 124 },
      thickness: 0.5, color: gris,
    });
    page.drawText(`Firmado el ${fechaEs(fecha)}`, {
      x: plaza.x, y: plaza.top - 136, size: 8, font: fuentes.normal, color: gris,
    });
    nuevas._hoja = { p: hoja.p, n: hoja.n + 1 };
    ubicaciones[sello.marca] = "HOJA";
  }

  return { pdf: Buffer.from(await doc.save()), posiciones: nuevas, ubicaciones };
}

module.exports = {
  MARCAS,
  VARIABLES_FIRMA,
  CAJA_CM,
  datosDeMarcas,
  marcasEnHtml,
  marcasEnTexto,
  leerMarcas,
  estampar,
  encajar,
  textoSeguro,
};
