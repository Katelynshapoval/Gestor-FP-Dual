// Email templates for tests, read from the rows migrations 022 and 023 insert,
// so the tests always use exactly the texts the database starts with.
//
//   correoSeed()                → { plantillas, variables, historial, adjuntos } (fresh copies;
//                                 adjuntos[].archivo is a string, read back as a Buffer)
//   correoDb(sql, params, seed) → rows for the template queries, undefined otherwise
//                                 (use it first in a fakePool handler)
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', '..', 'db', 'migrations', '022_correo_plantillas.sql');
const FILE_023 = path.join(__dirname, '..', '..', '..', 'db', 'migrations', '023_correo_adjuntos.sql');

// Parses `INSERT INTO `t` (cols) VALUES (...), (...) AS nueva ...;` as written by
// the migration: single-quoted strings ('' and \\ \n escapes), integers, NULL.
function parseInsert(sqlText, table) {
  const start = sqlText.indexOf(`INSERT INTO \`${table}\``);
  if (start < 0) throw new Error(`022: no hay INSERT para ${table}`);
  const colsOpen = sqlText.indexOf('(', start);
  const colsClose = sqlText.indexOf(')', colsOpen);
  const cols = sqlText.slice(colsOpen + 1, colsClose).split(',').map((c) => c.trim().replace(/`/g, ''));
  let i = sqlText.indexOf('VALUES', colsClose) + 'VALUES'.length;
  const rows = [];
  for (;;) {
    while (/[\s,]/.test(sqlText[i])) i += 1;
    if (sqlText[i] !== '(') break;
    i += 1;
    const values = [];
    for (;;) {
      while (/\s/.test(sqlText[i])) i += 1;
      if (sqlText[i] === "'") {
        let out = '';
        i += 1;
        for (;;) {
          const ch = sqlText[i];
          if (ch === '\\') {
            const next = sqlText[i + 1];
            out += next === 'n' ? '\n' : next;
            i += 2;
          } else if (ch === "'" && sqlText[i + 1] === "'") {
            out += "'";
            i += 2;
          } else if (ch === "'") {
            i += 1;
            break;
          } else {
            out += ch;
            i += 1;
          }
        }
        values.push(out);
      } else {
        const m = sqlText.slice(i).match(/^(NULL|-?\d+)/);
        if (!m) throw new Error(`022: valor no reconocido cerca de «${sqlText.slice(i, i + 30)}»`);
        values.push(m[1] === 'NULL' ? null : Number(m[1]));
        i += m[1].length;
      }
      while (/\s/.test(sqlText[i])) i += 1;
      if (sqlText[i] === ',') { i += 1; continue; }
      if (sqlText[i] === ')') { i += 1; break; }
      throw new Error(`022: se esperaba «,» o «)» cerca de «${sqlText.slice(i, i + 30)}»`);
    }
    rows.push(Object.fromEntries(cols.map((c, k) => [c, values[k]])));
  }
  return rows;
}

const TEXT = fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
const TEXT_023 = fs.readFileSync(FILE_023, 'utf8').replace(/\r\n/g, '\n');

// 022, then what 023 does to an unedited database: the merged emails keep
// version 1 with the merged text, the other email of each pair disappears,
// the new variables are added and each merged email carries its document.
function construir() {
  const base = {
    plantillas: parseInsert(TEXT, 'dual_correo_plantillas').map((r) => ({ ...r, version: 1, lleva_adjuntos: 0 })),
    variables: parseInsert(TEXT, 'dual_correo_variables'),
    historial: parseInsert(TEXT, 'dual_correo_plantillas_historial').map((h) => ({ ...h, lleva_adjuntos: 0, adjuntos: null })),
    adjuntos: [],
  };
  const fusion = parseInsert(TEXT_023, '_m023_fusion');
  for (const f of fusion) {
    base.plantillas = base.plantillas.filter((p) => p.clave !== f.sale);
    base.variables = base.variables.filter((v) => v.clave_plantilla !== f.sale);
    base.historial = base.historial.filter((h) => h.clave_plantilla !== f.sale);
    Object.assign(base.plantillas.find((p) => p.clave === f.clave), {
      nombre: f.nombre, cuando: f.cuando, asunto: f.asunto, cuerpo: f.cuerpo, lleva_adjuntos: 1,
    });
    Object.assign(base.historial.find((h) => h.clave_plantilla === f.clave && h.version === 1), {
      asunto: f.asunto, cuerpo: f.cuerpo, lleva_adjuntos: 1, adjuntos: f.nombre_adjunto,
    });
    base.adjuntos.push({
      id_adjunto: base.adjuntos.length + 1,
      clave_plantilla: f.clave,
      tipo: 'DOCUMENTO',
      documento: f.documento,
      nombre_archivo: null,
      mime_type: null,
      tamano: null,
      archivo: null,
      orden: 1,
      creado_en: '2026-11-11 10:00:00',
      subido_por: null,
    });
  }
  base.variables.push(...parseInsert(TEXT_023, 'dual_correo_variables'));
  return base;
}

const BASE = construir();

function correoSeed() {
  return JSON.parse(JSON.stringify(BASE));
}

const DEFAULT = correoSeed();

function correoDb(sql, params = [], seed = DEFAULT) {
  if (sql.includes('FROM dual_correo_plantillas WHERE clave IN')) {
    return seed.plantillas.filter((p) => params.includes(p.clave));
  }
  if (sql.includes('FROM dual_correo_adjuntos a') && sql.includes('WHERE a.clave_plantilla = ?')) {
    return seed.adjuntos
      .filter((a) => a.clave_plantilla === params[0])
      .map((a) => ({ ...a, archivo: a.archivo ? Buffer.from(a.archivo) : null }));
  }
  if (sql.includes('FROM dual_correo_variables WHERE clave_plantilla = ?')) {
    // Only the columns the query asks for, as the database would return.
    const columnas = sql.slice('SELECT '.length, sql.indexOf(' FROM')).split(',').map((c) => c.trim());
    return seed.variables
      .filter((v) => v.clave_plantilla === params[0])
      .sort((a, b) => a.orden - b.orden)
      .map((v) => Object.fromEntries(columnas.map((c) => [c, v[c]])));
  }
  if (sql.startsWith('SELECT clave, asunto, cuerpo FROM dual_correo_plantillas')) return seed.plantillas;
  if (sql.startsWith('SELECT clave_plantilla, variable')) return seed.variables;
  return undefined;
}

module.exports = { correoSeed, correoDb, parseInsert };
