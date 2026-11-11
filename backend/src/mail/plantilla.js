// Email template language (migration 022). Pure functions: no database, no mail.
//
//   {{variable}}                    value, HTML-escaped (SEC-10)
//   {{#variable}} … {{/variable}}   shown only when the value is not empty
//   {{^variable}} … {{/variable}}   shown only when the value is empty
//   **texto**                       bold
//   [texto](https://… | {{enlace}}) link; only http(s) addresses become links
//   blank line                      new paragraph; a single line break is kept
//   a paragraph that is only a LISTA variable becomes a bulleted list
//
// The administrator's text is escaped too, so a template can never inject HTML.
// Values are inserted last, through placeholders, so a value is never read as
// markup or as another variable.

const NOMBRE = /^[a-z][a-z0-9_]*$/;
const ETIQUETA = /\{\{\s*([#^/]?)\s*([^{}]*?)\s*\}\}/g;
const MAX_ASUNTO = 200;
const MAX_CUERPO = 10000;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const esUrl = (value) => /^https?:\/\/[^\s<>"']+$/i.test(String(value || '').trim());

function vacio(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === '';
}

function comoLista(value) {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean);
  return String(value ?? '').split('\n').map((v) => v.trim()).filter(Boolean);
}

// ── Parsing ─────────────────────────────────────────────────────────────────

// Returns { nodos, errores, usadas } where nodos is a tree of
// { t: 'texto', v } | { t: 'var', nombre } | { t: 'bloque', nombre, inverso, hijos }.
function analizar(texto) {
  const fuente = String(texto ?? '');
  const raiz = { hijos: [] };
  const pila = [raiz];
  const errores = [];
  const usadas = new Set();
  let ultimo = 0;
  const top = () => pila[pila.length - 1];

  for (const m of fuente.matchAll(ETIQUETA)) {
    if (m.index > ultimo) top().hijos.push({ t: 'texto', v: fuente.slice(ultimo, m.index) });
    ultimo = m.index + m[0].length;
    const [, marca, nombre] = m;
    if (!NOMBRE.test(nombre)) {
      errores.push(`La etiqueta «${m[0]}» no es válida: usa los botones de variables.`);
      continue;
    }
    usadas.add(nombre);
    if (marca === '#' || marca === '^') {
      const bloque = { t: 'bloque', nombre, inverso: marca === '^', hijos: [] };
      top().hijos.push(bloque);
      pila.push(bloque);
    } else if (marca === '/') {
      if (pila.length === 1) {
        errores.push(`Sobra el cierre «{{/${nombre}}}»: no hay ningún bloque abierto.`);
      } else if (top().nombre !== nombre) {
        errores.push(`El bloque «${top().nombre}» se cierra con «{{/${nombre}}}»: debe cerrarse con «{{/${top().nombre}}}».`);
      } else {
        pila.pop();
      }
    } else {
      top().hijos.push({ t: 'var', nombre });
    }
  }
  if (ultimo < fuente.length) top().hijos.push({ t: 'texto', v: fuente.slice(ultimo) });
  for (const abierto of pila.slice(1).reverse()) {
    errores.push(`Falta cerrar el bloque «${abierto.nombre}» con «{{/${abierto.nombre}}}».`);
  }
  // Stray braces left after removing valid tags: "{{nombre}" or "{nombre}}".
  const resto = fuente.replace(ETIQUETA, '');
  if (resto.includes('{{') || resto.includes('}}')) {
    errores.push('Hay llaves «{{ }}» sin cerrar o mal escritas.');
  }
  return { nodos: raiz.hijos, errores, usadas };
}

// Resolves blocks; variables are kept as {{name}} for the next step.
function resolverBloques(nodos, valores) {
  return nodos
    .map((n) => {
      if (n.t === 'texto') return n.v;
      if (n.t === 'var') return `{{${n.nombre}}}`;
      const mostrar = n.inverso ? vacio(valores[n.nombre]) : !vacio(valores[n.nombre]);
      return mostrar ? resolverBloques(n.hijos, valores) : '';
    })
    .join('');
}

// ── Validation ──────────────────────────────────────────────────────────────

// variables: rows of dual_correo_variables ({ variable, tipo, etiqueta, obligatoria }).
// Returns a list of messages in Spanish; empty = valid.
function validar({ asunto, cuerpo }, variables = []) {
  const errores = [];
  const porNombre = new Map(variables.map((v) => [v.variable, v]));
  const a = String(asunto ?? '');
  const c = String(cuerpo ?? '');

  if (!a.trim()) errores.push('El asunto no puede estar vacío.');
  if (a.length > MAX_ASUNTO) errores.push(`El asunto no puede superar ${MAX_ASUNTO} caracteres.`);
  if (/[\r\n]/.test(a)) errores.push('El asunto debe ocupar una sola línea.');
  if (!c.trim()) errores.push('El texto del correo no puede estar vacío.');
  if (c.length > MAX_CUERPO) errores.push(`El texto del correo no puede superar ${MAX_CUERPO} caracteres.`);

  const pa = analizar(a);
  const pc = analizar(c);
  errores.push(...pa.errores.map((e) => `Asunto: ${e}`), ...pc.errores);

  const desconocidas = [...new Set([...pa.usadas, ...pc.usadas])].filter((n) => !porNombre.has(n));
  for (const n of desconocidas) errores.push(`La variable «{{${n}}}» no existe en este correo.`);

  for (const n of pa.usadas) {
    const v = porNombre.get(n);
    if (v && v.tipo !== 'TEXTO') errores.push(`«${v.etiqueta}» no se puede usar en el asunto.`);
  }
  for (const v of variables) {
    if (Number(v.obligatoria) === 1 && !pc.usadas.has(v.variable)) {
      errores.push(`Falta «${v.etiqueta}» ({{${v.variable}}}): este correo no funciona sin ella.`);
    }
  }

  for (const m of c.matchAll(/\[([^\]\n]*)\]\(([^)\n]*)\)/g)) {
    const destino = m[2].trim();
    const comoVar = destino.match(/^\{\{\s*([a-z][a-z0-9_]*)\s*\}\}$/);
    const ok = comoVar ? porNombre.get(comoVar[1])?.tipo === 'ENLACE' : esUrl(destino);
    if (!ok) errores.push(`El enlace «${m[0]}» no es válido: usa una dirección https://… o una variable de enlace.`);
    if (!m[1].trim()) errores.push(`El enlace «${m[0]}» no tiene texto.`);
  }
  return [...new Set(errores)];
}

// ── Rendering ───────────────────────────────────────────────────────────────

function tipoDe(variables, nombre) {
  return variables.find((v) => v.variable === nombre)?.tipo || 'TEXTO';
}

function renderAsunto(asunto, valores = {}, variables = []) {
  const { nodos } = analizar(asunto);
  return resolverBloques(nodos, valores)
    .replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_, n) =>
      tipoDe(variables, n) === 'LISTA' ? comoLista(valores[n]).join(', ') : String(valores[n] ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
}

const P_STYLE = 'margin:0 0 14px';

function renderParrafo(texto, valores, variables) {
  const marcas = [];
  const marca = (nombre) => `\u0000${marcas.push(nombre) - 1}\u0000`;

  let s = escapeHtml(texto).replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_, n) => marca(n));

  s = s.replace(/\[([^\]\n]+)\]\(\s*([^)\s]+)\s*\)/g, (m, etiqueta, destino) => {
    const ref = destino.match(/^\u0000(\d+)\u0000$/);
    const url = ref ? String(valores[marcas[Number(ref[1])]] ?? '').trim() : destino.replace(/&amp;/g, '&');
    if (!esUrl(url)) return etiqueta;
    return `<a href="${escapeHtml(url)}" style="color:#bd1710">${etiqueta}</a>`;
  });
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\n/g, '<br>');

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const nombre = marcas[Number(i)];
    const valor = valores[nombre];
    const tipo = tipoDe(variables, nombre);
    if (tipo === 'LISTA') return escapeHtml(comoLista(valor).join(', '));
    if (tipo === 'ENLACE' && esUrl(valor)) {
      const url = escapeHtml(String(valor).trim());
      return `<a href="${url}" style="color:#bd1710">${url}</a>`;
    }
    return escapeHtml(valor);
  });
}

function renderCuerpo(cuerpo, valores = {}, variables = []) {
  const { nodos } = analizar(cuerpo);
  const resuelto = resolverBloques(nodos, valores).replace(/\r\n/g, '\n');
  return resuelto
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const sola = p.match(/^\{\{([a-z][a-z0-9_]*)\}\}$/);
      if (sola && tipoDe(variables, sola[1]) === 'LISTA') {
        const items = comoLista(valores[sola[1]]);
        if (!items.length) return '';
        return `<ul style="margin:0 0 14px;padding-left:22px">${items.map((it) => `<li>${escapeHtml(it)}</li>`).join('')}</ul>`;
      }
      return `<p style="${P_STYLE}">${renderParrafo(p, valores, variables)}</p>`;
    })
    .join('');
}

// The whole email: body plus the shared footer.
function envolver(htmlCuerpo, htmlPie = '') {
  const pie = htmlPie
    ? `<div style="margin-top:22px;padding-top:12px;border-top:1px solid #e8e6df;color:#55554d;font-size:13px">${htmlPie}</div>`
    : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1c1c1a;max-width:600px">${htmlCuerpo}${pie}</div>`;
}

// Example values for previews and test emails, from the `ejemplo` column.
function ejemplos(variables = []) {
  return Object.fromEntries(variables.map((v) => [v.variable, v.tipo === 'LISTA' ? comoLista(v.ejemplo) : v.ejemplo]));
}

module.exports = {
  analizar,
  validar,
  renderAsunto,
  renderCuerpo,
  envolver,
  ejemplos,
  escapeHtml,
  MAX_ASUNTO,
  MAX_CUERPO,
};
