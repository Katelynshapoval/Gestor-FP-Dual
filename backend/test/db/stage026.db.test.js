// Migration 026 (one convenio per company) — end-to-end on the ISOLATED
// verification database <DBNAME>_verify (decision D8), never on DBNAME.
//
//   DB_INTEGRATION=1 node --test test/db/stage026.db.test.js
//   (KEEP_VERIFY=1 keeps the verification database afterwards)
//
// Rebuilds <DBNAME>_verify up to 025 with SYNTHETIC rows, applies 026 and
// checks: inherited copies need their origin (and only they have one); at most
// one open renewal per company application, with a reason; the two new emails
// and the new variable are valid templates and the unedited «solicitud
// recibida» text mentions a kept convenio; the rollback refuses while a renewal
// or an inherited convenio exists, then restores the 025 schema and texts; 026
// applies again. Tests run in order and depend on each other.
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
let schema025;
let textos025;
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

const textos = async () => (await conn.query(
  `SELECT p.clave, p.cuerpo, h.cuerpo AS original FROM dual_correo_plantillas p
     LEFT JOIN dual_correo_plantillas_historial h ON h.clave_plantilla = p.clave AND h.version = 1
    ORDER BY p.clave`))[0];

const convenio = async (idSolicitud, extra = {}) => {
  const cols = { id_solicitud_empresa: idSolicitud, id_tipo_documento: fx.tipoConvenio, archivo: Buffer.from('%PDF-1.4 x'), es_actual: 0, ...extra };
  const [r] = await conn.query(`INSERT INTO dual_documentos (${Object.keys(cols).join(', ')}) VALUES (?)`, [Object.values(cols)]);
  return r.insertId;
};

test.before(async () => {
  if (!enabled) return;
  const created = verifyDb('create', '--to', '025');
  assert.ok(created.ok, created.out);
  const { connect } = require('../../scripts/lib/connect');
  conn = await connect(VERIFY);
  schemaDump = require('../../scripts/lib/schemaDump');
});

test.after(async () => {
  if (conn) await conn.end();
  if (enabled && process.env.KEEP_VERIFY !== '1') verifyDb('drop');
});

test('fixtures: a company with an application in two convocatorias and a validated convenio (synthetic)', opts, async () => {
  const [c1] = await conn.query("INSERT INTO dual_convocatorias (nombre, fecha_inicio, fecha_fin, activa) VALUES ('2097/2098', '2097-09-01', '2098-08-31', 0)");
  const [c2] = await conn.query("INSERT INTO dual_convocatorias (nombre, fecha_inicio, fecha_fin, activa) VALUES ('2098/2099', '2098-09-01', '2099-08-31', 1)");
  const [e] = await conn.query("INSERT INTO ge_empresas (cif, empresa, observaciones) VALUES ('B00000260', 'EMPRESA SINTÉTICA 026', '')");
  const [d] = await conn.query(
    "INSERT INTO ge_domicilios (idempresa, domicilio, cp, provincia, localidad, especialidad) VALUES (?, 'Calle Ficticia 1', '50000', 'Zaragoza', 'Zaragoza', '')", [e.insertId]);
  const [c] = await conn.query(
    `INSERT INTO ge_contactos (iddomicilio, dni, nombre, email, telefono, cargo, observaciones)
     VALUES (?, '00000000T', 'Contacto Sintético', 'contacto@example.test', '600000000', 'Gerente', '')`, [d.insertId]);
  const solicitud = async (idConv) => (await conn.query(
    `INSERT INTO dual_solicitudes_empresa
       (id_empresa, id_convocatoria, id_representante_legal, id_coordinador_empresa, id_domicilio_legal, id_domicilio_trabajo, descripcion_puesto)
     VALUES (?, ?, ?, ?, ?, ?, 'Puesto sintético')`, [e.insertId, idConv, c.insertId, c.insertId, d.insertId, d.insertId]))[0].insertId;
  const activar = async (id) => {
    await conn.query('UPDATE dual_convocatorias SET activa = 0 WHERE activa = 1');
    await conn.query('UPDATE dual_convocatorias SET activa = 1 WHERE id_convocatoria = ?', [id]);
  };
  await activar(c1.insertId);
  fx.sol1 = await solicitud(c1.insertId);
  await activar(c2.insertId);
  fx.sol2 = await solicitud(c2.insertId);
  fx.tipoConvenio = (await one("SELECT id_tipo_documento AS id FROM dual_tipos_documento WHERE nombre = 'CONVENIO'")).id;
  fx.conv1 = await convenio(fx.sol1, { es_actual: 1, origen_documento: 'GENERADO' });
  schema025 = await dump();
  textos025 = await textos();
});

test('026 applies: renewals table, the two emails, the new variable and the updated unedited text', opts, async () => {
  const r = verifyDb('migrate', '--to', '026');
  assert.ok(r.ok, r.out);
  const n = async (sql) => Number((await one(sql)).n);
  assert.equal(await n('SELECT COUNT(*) n FROM dual_correo_plantillas'), 24);
  assert.equal(await n('SELECT COUNT(*) n FROM dual_correo_variables'), 132);
  assert.equal(await n('SELECT COUNT(*) n FROM dual_convenio_renovaciones'), 0);
  assert.equal(await n("SELECT COUNT(*) n FROM dual_correo_adjuntos WHERE clave_plantilla = 'convenio_renovar_empresa'"), 1);
  const recibida = await one("SELECT cuerpo, version FROM dual_correo_plantillas WHERE clave = 'solicitud_empresa_recibida'");
  assert.match(recibida.cuerpo, /\{\{#convenio_vigente\}\}Vuestro convenio sigue vigente/);
  assert.equal(recibida.version, 1);
  const original = await one("SELECT cuerpo FROM dual_correo_plantillas_historial WHERE clave_plantilla = 'solicitud_empresa_recibida' AND version = 1");
  assert.equal(original.cuerpo, recibida.cuerpo, '«Restaurar original» goes back to the same text');

  // Every changed template is valid with its own variables.
  const plantilla = require('../../src/mail/plantilla');
  for (const clave of ['convenio_renovar_empresa', 'convenio_renovar_centro', 'solicitud_empresa_recibida']) {
    const fila = await one('SELECT asunto, cuerpo FROM dual_correo_plantillas WHERE clave = ?', [clave]);
    const [vars] = await conn.query('SELECT variable, tipo, etiqueta, obligatoria, opcional FROM dual_correo_variables WHERE clave_plantilla = ?', [clave]);
    assert.deepEqual(plantilla.validar(fila, vars), [], clave);
    const historial = await one('SELECT cuerpo FROM dual_correo_plantillas_historial WHERE clave_plantilla = ? AND version = 1', [clave]);
    assert.equal(historial.cuerpo, fila.cuerpo, `${clave}: version 1 in the history`);
  }
});

test('inherited convenio: a copy needs its origin, and only a copy has one', opts, async () => {
  const copia = await convenio(fx.sol2, { es_actual: 1, origen_documento: 'HEREDADO', id_documento_origen: fx.conv1 });
  assert.ok(copia);
  assert.match(String(await sqlError(convenio(fx.sol2, { origen_documento: 'HEREDADO' }))), /chk_documentos_heredado/);
  assert.match(String(await sqlError(convenio(fx.sol2, { origen_documento: 'GENERADO', id_documento_origen: fx.conv1 }))), /chk_documentos_heredado/);
  assert.match(String(await sqlError(convenio(fx.sol2, { origen_documento: 'OTRO' }))), /chk_documentos_origen/);
  assert.match(String(await sqlError(conn.query('DELETE FROM dual_documentos WHERE id_documento = ?', [fx.conv1]))), /foreign key/i,
    'the original cannot disappear while a copy points to it');
  fx.copia = copia;
});

test('renewals: one open per application, with a valid reason; a resolved one frees the slot', opts, async () => {
  const abrir = (extra = {}) => conn.query(
    'INSERT INTO dual_convenio_renovaciones SET ?',
    [{ id_solicitud_empresa: fx.sol2, motivo: 'CICLOS', detalle: 'se ha añadido el ciclo B', ciclos_antes: 'A', ciclos_ahora: 'A, B', id_documento_anterior: fx.copia, ...extra }],
  );
  const [r1] = await abrir();
  assert.match(String(await sqlError(abrir({ motivo: 'MANUAL', detalle: 'otra' }))), /Duplicate/);
  assert.match(String(await sqlError(abrir({ id_solicitud_empresa: fx.sol1, detalle: '   ' }))), /chk_dcr_detalle/);
  assert.match(String(await sqlError(abrir({ id_solicitud_empresa: fx.sol1, motivo: 'OTRO' }))), /chk_dcr_motivo/);
  await conn.query('UPDATE dual_convenio_renovaciones SET resuelta_en = NOW() WHERE id_renovacion = ?', [r1.insertId]);
  const [r2] = await abrir({ motivo: 'MANUAL', detalle: 'cambio de representante legal' });
  assert.ok(r2.insertId > r1.insertId);
  assert.equal(Number((await one('SELECT COUNT(*) n FROM dual_convenio_renovaciones WHERE id_solicitud_empresa = ?', [fx.sol2])).n), 2);
});

test('the rollback refuses while renewals or inherited convenios exist, then restores the 025 schema and texts', opts, async () => {
  let r = verifyDb('rollback', '026');
  assert.ok(!r.ok);
  assert.match(r.out, /renovaciones de convenio/);
  assert.ok(await one("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'dual_convenio_renovaciones'", [VERIFY]), 'nothing changed');

  await conn.query('DELETE FROM dual_convenio_renovaciones');
  r = verifyDb('rollback', '026');
  assert.ok(!r.ok);
  assert.match(r.out, /convenios heredados/);

  await conn.query('DELETE FROM dual_documentos WHERE id_documento = ?', [fx.copia]);
  r = verifyDb('rollback', '026');
  assert.ok(r.ok, r.out);
  assert.deepEqual(await dump(), schema025);
  assert.deepEqual(await textos(), textos025);
});

test('026 applies again after the rollback', opts, async () => {
  const r = verifyDb('migrate', '--to', '026');
  assert.ok(r.ok, r.out);
  assert.equal(Number((await one('SELECT COUNT(*) n FROM dual_correo_plantillas')).n), 24);
});
