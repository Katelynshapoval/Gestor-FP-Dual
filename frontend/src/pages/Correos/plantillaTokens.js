// Client-side helpers for the email template editor. The backend validates and
// renders (src/mail/plantilla.js); these only colour the text while typing and
// insert variables at the cursor.

const ETIQUETA = /(\{\{\s*[#^/]?\s*[^{}]*?\s*\}\})|(\*\*)/g;
const PARTES = /^\{\{\s*([#^/]?)\s*([^{}]*?)\s*\}\}$/;

// Splits a template into segments for highlighting:
//   { tipo: "texto" | "variable" | "bloque" | "desconocida" | "negrita", texto, nombre? }
export function segmentar(texto, nombres = new Set()) {
  const out = [];
  const fuente = String(texto ?? "");
  let ultimo = 0;
  for (const m of fuente.matchAll(ETIQUETA)) {
    if (m.index > ultimo)
      out.push({ tipo: "texto", texto: fuente.slice(ultimo, m.index) });
    ultimo = m.index + m[0].length;
    if (m[2]) {
      out.push({ tipo: "negrita", texto: m[0] });
      continue;
    }
    const [, marca, nombre] = m[0].match(PARTES);
    const conocida = nombres.has(nombre);
    out.push({
      tipo: !conocida ? "desconocida" : marca ? "bloque" : "variable",
      texto: m[0],
      nombre,
    });
  }
  if (ultimo < fuente.length)
    out.push({ tipo: "texto", texto: fuente.slice(ultimo) });
  return out;
}

// Variables used in a template ({{x}}, {{#x}}, {{^x}}, {{/x}}).
export function variablesUsadas(texto) {
  const usadas = new Set();
  for (const m of String(texto ?? "").matchAll(
    /\{\{\s*[#^/]?\s*([a-z][a-z0-9_]*)\s*\}\}/g,
  ))
    usadas.add(m[1]);
  return usadas;
}

// Inserts `fragmento` over the selection [inicio, fin) of `valor`.
// Returns the new value and the caret position after the insertion.
export function insertar(valor, inicio, fin, fragmento) {
  const a = Math.max(0, Math.min(inicio ?? valor.length, valor.length));
  const b = Math.max(a, Math.min(fin ?? a, valor.length));
  return {
    valor: valor.slice(0, a) + fragmento + valor.slice(b),
    cursor: a + fragmento.length,
  };
}

// Wraps the selection with `antes`/`despues` (bold, link). With no selection the
// placeholder is inserted and selected so the user can type over it.
export function envolver(valor, inicio, fin, antes, despues, relleno) {
  const a = Math.max(0, Math.min(inicio ?? valor.length, valor.length));
  const b = Math.max(a, Math.min(fin ?? a, valor.length));
  const sel = valor.slice(a, b) || relleno;
  return {
    valor: valor.slice(0, a) + antes + sel + despues + valor.slice(b),
    seleccion: [a + antes.length, a + antes.length + sel.length],
  };
}
