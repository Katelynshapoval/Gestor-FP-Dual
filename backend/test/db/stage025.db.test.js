// Migration 025 (document types in the database) — end-to-end on the ISOLATED
// verification database <DBNAME>_verify (decision D8), never on DBNAME.
//
//   DB_INTEGRATION=1 node --test test/db/stage025.db.test.js
//   (KEEP_VERIFY=1 keeps the verification database afterwards)
//
// Rebuilds <DBNAME>_verify up to 024 with SYNTHETIC rows, applies 025 and
// checks: the 13 existing types get the rules of documentCatalogue.js; the
// document triggers keep accepting and refusing exactly what they did, now from
// `ambito`; a type added by the centre is accepted only on its own parent and
// must be generated from a template; the rollback refuses while a custom type
// exists, then restores the 024 schema; 025 applies again; TIPO_DOCUMENTO
// events are allowed and, being permanent, block the rollback. Tests run in order and depend on each other.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const BASE = process.env.DBNAME;
const VERIFY = `${BASE}_verify`;
const enabled = process.env.DB_INTEGRATION === '1' && process.env.NODE_ENV !== 'production'
  && Boolean(BASE) && !/_verify$/.test(BASE);
const opts = { skip: enabled ? false : 'DB_INTEGRATION=1 no definido' };
const BACKEND = path.join(__dirname, '..', '..');

let conn;
let schemaDump;
let schema024;
const fx = {};

function verifyDb(...args) {
  const r = spawnSync(process.execPath, [path.join(BACKEND, 'scripts', 'verifyDb.js'), ...args], {
    env: { ...process.env, DBNAME: BASE }, encoding: 'utf8',
  });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
}

async function sqlError(promise) {
  try {
    await promise;
  } catch (err) {
    return err.sqlMessage || err.message;
  }
  return null;
}

async function one(sql, params = []) {
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

async function dump() {
  const { connect } = require('../../scripts/lib/connect');
  const c = await connect(null);
  try {
    return await schemaDump.dumpSchema(c, VERIFY, { exclude: ['schema_migrations'] });
  } finally {
    await c.end();
  }
}

const idTipo = async (nombre) => (await one('SELECT id_tipo_documento AS id FROM dual_tipos_documento WHERE nombre = ?', [nombre])).id;

// A document of `tipo` on one parent: { alumno | empresa | reserva }.
async function documento(tipo, padre) {
  const id = await idTipo(tipo);
  const [r] = await conn.query(
    `INSERT INTO dual_documentos (id_solicitud_alumno, id_solicitud_empresa, id_reserva, id_tipo_documento, es_actual)
     VALUES (?, ?, ?, ?, 0)`,
    [padre === 'alumno' ? fx.solAlumno : null, padre === 'empresa' ? fx.solEmpresa : null, padre === 'reserva' ? fx.reserva : null, id],
  );
  return r.insertId;
}

test.before(async () => {
  if (!enabled) return;
  const created = verifyDb('create', '--to', '024');
  assert.ok(created.ok, created.out);
  const { connect } = require('../../scripts/lib/connect');
  conn = await connect(VERIFY);
  schemaDump = require('../../scripts/lib/schemaDump');
});

test.after(async () => {
  if (conn) await conn.end();
  if (enabled && process.env.KEEP_VERIFY !== '1') verifyDb('drop');
});

test('fixtures: a student application, a company application and a reservation (synthetic)', opts, async () => {
  const [cv] = await conn.query("INSERT INTO dual_convocatorias (nombre, fecha_inicio, fecha_fin, activa) VALUES ('2095/2096', '2095-09-01', '2096-08-31', 1)");
  const [esp] = await conn.query("INSERT INTO dual_especialidades (codigo, nombre, turno) VALUES ('SINT_025', 'Ciclo sintético 025', 0)");
  const [e] = await conn.query("INSERT INTO ge_empresas (cif, empresa, observaciones) VALUES ('B00000250', 'EMPRESA SINTÉTICA 025', '')");
  const [d] = await conn.query(
    `INSERT INTO ge_domicilios (idempresa, domicilio, cp, provincia, localidad, especialidad)
     VALUES (?, 'Calle Ficticia 1', '50000', 'Zaragoza', 'Zaragoza', '')`, [e.insertId]);
  const [c] = await conn.query(
    `INSERT INTO ge_contactos (iddomicilio, dni, nombre, email, telefono, cargo, observaciones)
     VALUES (?, '00000000T', 'Contacto Sintético', 'contacto@example.test', '600000000', 'Gerente', '')`, [d.insertId]);
  const [se] = await conn.query(
    `INSERT INTO dual_solicitudes_empresa
       (id_empresa, id_convocatoria, id_representante_legal, id_coordinador_empresa, id_domicilio_legal, id_domicilio_trabajo, descripcion_puesto)
     VALUES (?, ?, ?, ?, ?, ?, 'Puesto sintético')`, [e.insertId, cv.insertId, c.insertId, c.insertId, d.insertId, d.insertId]);
  await conn.query("UPDATE dual_solicitudes_empresa SET id_estado_validacion = fn_id_estado_validacion('VALIDADO') WHERE id_solicitud_empresa = ?", [se.insertId]);
  const [of] = await conn.query(
    'INSERT INTO dual_solicitud_empresa_especialidades (id_solicitud_empresa, id_especialidad, cantidad_alumnos) VALUES (?, ?, 2)', [se.insertId, esp.insertId]);
  const [a] = await conn.query(
    `INSERT INTO gf_alumnosfct (nombre, dni, domicilio, cp, localidad, telalumno, email, id_especialidad_dual, observaciones)
     VALUES ('ALUMNO SINTÉTICO 025', '00000250X', 'Calle Ficticia 2', '50000', 'Zaragoza', '600000001', 'alumno@example.test', ?, '')`, [esp.insertId]);
  const [sa] = await conn.query(
    'INSERT INTO dual_solicitudes_alumno (id_alumno, id_convocatoria, id_especialidad) VALUES (?, ?, ?)', [a.insertId, cv.insertId, esp.insertId]);
  await conn.query("UPDATE dual_solicitudes_alumno SET id_estado_validacion = fn_id_estado_validacion('VALIDADO') WHERE id_solicitud_alumno = ?", [sa.insertId]);
  await conn.query('SET autocommit = 0');
  const [[r]] = await conn.query('CALL sp_reservar_alumno(?, ?)', [sa.insertId, of.insertId]);
  await conn.query('COMMIT');
  await conn.query('SET autocommit = 1');
  Object.assign(fx, { solEmpresa: se.insertId, solAlumno: sa.insertId, reserva: r[0].id_reserva });
  schema024 = await dump();
});

test('025 applies and the 13 existing types get the rules of documentCatalogue.js', opts, async () => {
  const r = verifyDb('migrate', '--to', '025');
  assert.ok(r.ok, r.out);
  const resumen = await one('SELECT COUNT(*) n, SUM(es_sistema) s, SUM(activo) a, SUM(generado) g FROM dual_tipos_documento');
  assert.deepEqual([resumen.n, Number(resumen.s), Number(resumen.a), Number(resumen.g)], [13, 13, 9, 3]);

  const { CATALOGUE } = require('../../src/services/documentCatalogue');
  const [rows] = await conn.query('SELECT * FROM dual_tipos_documento');
  const porNombre = Object.fromEntries(rows.map((t) => [t.nombre, t]));
  for (const def of CATALOGUE) {
    const t = porNombre[def.clave];
    assert.ok(t, def.clave);
    assert.equal(t.nombre_mostrar, def.nombre, def.clave);
    assert.equal(t.ambito, def.ambito, def.clave);
    assert.equal(Boolean(t.generado), Boolean(def.generated), def.clave);
    assert.equal(Boolean(t.activo), !def.legacy, def.clave);
    const firmas = def.signers || [];
    // documentCatalogue.js describes today's rules: the centre signs the
    // convenio since 027 (firma_centro set there), not yet at 025.
    const centro = def.clave === 'CONVENIO' ? false : firmas.includes('GESTOR');
    assert.deepEqual(
      [Boolean(t.firma_empresa), Boolean(t.firma_centro), Boolean(t.firma_alumno)],
      [firmas.includes('EMPRESA'), centro, firmas.includes('ALUMNO')], def.clave);
    assert.equal(t.familia_contrato, def.contractFamily || null, def.clave);
  }
  assert.deepEqual(rows.filter((t) => t.requerido).map((t) => t.nombre).sort(), ['ANEXO_DGA', 'ANEXO_II', 'ANEXO_III', 'CONVENIO', 'CV']);
  assert.equal(porNombre.OTRO.ambito, null);
});

test('the document triggers accept and refuse exactly what they did before, now from `ambito`', opts, async () => {
  const casos = [
    ['CV', 'alumno'], ['ANEXO_DGA', 'alumno'], ['FORMULARIO', 'alumno'], ['ANEXO_2', 'alumno'],
    ['CONVENIO', 'empresa'], ['ANEXO_XIV', 'empresa'], ['ANEXO_G', 'empresa'], ['EXCEL', 'empresa'],
    ['ANEXO_II', 'reserva'], ['ANEXO_III', 'reserva'], ['CALENDARIO', 'reserva'], ['ANEXO_H', 'reserva'],
  ];
  for (const [tipo, padre] of casos) {
    for (const otro of ['alumno', 'empresa', 'reserva']) {
      const err = await sqlError(documento(tipo, otro));
      if (otro === padre) assert.equal(err, null, `${tipo} en ${otro}`);
      else assert.match(String(err), /no corresponde al registro padre/, `${tipo} en ${otro}`);
    }
  }
  for (const otro of ['alumno', 'empresa', 'reserva']) assert.equal(await sqlError(documento('OTRO', otro)), null, `OTRO en ${otro}`);

  // The update trigger: moving a convenio to a reservation is refused.
  const id = await documento('CONVENIO', 'empresa');
  assert.match(String(await sqlError(conn.query(
    'UPDATE dual_documentos SET id_solicitud_empresa = NULL, id_reserva = ? WHERE id_documento = ?', [fx.reserva, id]))),
  /no corresponde al registro padre/);
  // The other rules are unchanged.
  assert.match(String(await sqlError(conn.query(
    "UPDATE dual_documentos SET id_estado_validacion = fn_id_estado_validacion('RECHAZADO') WHERE id_documento = ?", [id]))), /requiere motivo/);
});

test('a type added by the centre: only on its own parent, generated from a template, consistent rules', opts, async () => {
  await conn.query(
    `INSERT INTO dual_tipos_documento (nombre, nombre_mostrar, ambito, generado, firma_empresa, firma_centro, firma_alumno, requerido, familia_contrato)
     VALUES ('ANEXO_IV', 'Anexo IV', 'reserva', 1, 1, 1, 0, 1, 'beca')`);
  const t = await one("SELECT es_sistema, activo, orden FROM dual_tipos_documento WHERE nombre = 'ANEXO_IV'");
  assert.deepEqual([t.es_sistema, t.activo, t.orden], [0, 1, 100]);
  assert.equal(await sqlError(documento('ANEXO_IV', 'reserva')), null);
  assert.match(String(await sqlError(documento('ANEXO_IV', 'empresa'))), /no corresponde al registro padre/);

  const nuevo = (cols, vals) => sqlError(conn.query(`INSERT INTO dual_tipos_documento (nombre, nombre_mostrar, ${cols}) VALUES ('X', 'X', ${vals})`));
  assert.match(String(await nuevo('ambito, generado', "'reserva', 0")), /chk_tipos_documento_generado/, 'must be generated');
  assert.match(String(await nuevo('ambito, generado', 'NULL, 1')), /chk_tipos_documento_generado/, 'needs a parent');
  assert.match(String(await nuevo('ambito, generado', "'empleo', 1")), /chk_tipos_documento_ambito/);
  assert.match(String(await nuevo('ambito, generado, familia_contrato', "'solicitud_empresa', 1, 'beca'")), /chk_tipos_documento_familia/);
  assert.match(String(await nuevo('ambito, generado, familia_contrato', "'reserva', 1, 'otro'")), /chk_tipos_documento_familia/);
  assert.match(String(await nuevo('ambito, generado, firma_alumno', "'solicitud_empresa', 1, 1")), /chk_tipos_documento_firmas/);
  assert.match(String(await nuevo('ambito, generado, firma_empresa', "'solicitud_alumno', 1, 1")), /chk_tipos_documento_firmas/);
  assert.match(String(await sqlError(conn.query(
    "INSERT INTO dual_tipos_documento (nombre, nombre_mostrar, ambito, generado) VALUES ('ANEXO_IV_B', 'Anexo IV', 'reserva', 1)"))),
  /Duplicate/, 'visible names are unique');
});

test('the rollback refuses while a custom type exists, then restores the 024 schema', opts, async () => {
  let r = verifyDb('rollback', '025');
  assert.ok(!r.ok);
  assert.match(r.out, /tipos de documento creados por el centro/);
  assert.ok(await one("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'dual_tipos_documento' AND COLUMN_NAME = 'ambito'", [VERIFY]),
    'nothing changed');

  await conn.query("DELETE FROM dual_documentos WHERE id_tipo_documento = (SELECT id_tipo_documento FROM dual_tipos_documento WHERE nombre = 'ANEXO_IV')");
  await conn.query("DELETE FROM dual_tipos_documento WHERE nombre = 'ANEXO_IV'");
  r = verifyDb('rollback', '025');
  assert.ok(r.ok, r.out);
  assert.deepEqual(await dump(), schema024);
});

test('025 applies again after the rollback', opts, async () => {
  const r = verifyDb('migrate', '--to', '025');
  assert.ok(r.ok, r.out);
  assert.equal(Number((await one('SELECT SUM(es_sistema) s FROM dual_tipos_documento')).s), 13);
});

test('audit: TIPO_DOCUMENTO events are allowed, cannot be deleted, and then block the rollback', opts, async () => {
  await conn.query("INSERT INTO dual_eventos (entidad, id_entidad, accion) VALUES ('TIPO_DOCUMENTO', 1, 'EDITAR')");
  assert.match(String(await sqlError(conn.query("DELETE FROM dual_eventos WHERE entidad = 'TIPO_DOCUMENTO'"))), /no se puede borrar/);
  const r = verifyDb('rollback', '025');
  assert.ok(!r.ok);
  assert.match(r.out, /eventos TIPO_DOCUMENTO/);
  assert.ok(await one("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'dual_tipos_documento' AND COLUMN_NAME = 'ambito'", [VERIFY]),
    'nothing changed');
});
