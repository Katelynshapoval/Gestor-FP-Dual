// Database improvement plan · Stage 1 (migration 017) — end-to-end on the
// ISOLATED verification database <DBNAME>_verify (decision D8), never on DBNAME.
//
//   DB_INTEGRATION=1 node --test test/db/stage1.db.test.js
//   (KEEP_VERIFY=1 keeps the verification database afterwards)
//
// The file rebuilds <DBNAME>_verify from the repository up to 016, fills it with
// SYNTHETIC rows only, then checks: the 017 guards stop without changing
// anything; 017 applies; applications keep their own speciality; one current
// document per parent and type (also under concurrent uploads through the
// backend); places cannot drop below active reservations; the protected tables
// are identical to DBNAME's; the rollback restores the 016 schema and 017 can be
// applied again. Tests run in order and depend on each other.
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

const PROTECTED = ['ge_contactos', 'ge_domicilios', 'ge_empresas', 'gf_alumnosfct'];
const BACKEND = path.join(__dirname, '..', '..');

let conn;
let schemaDump;
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

async function columnExists(table, column) {
  return Boolean(await one(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [VERIFY, table, column],
  ));
}

async function dump() {
  const { dumpSchema } = schemaDump;
  const { connect } = require('../../scripts/lib/connect');
  const c = await connect(null);
  try {
    return await dumpSchema(c, VERIFY, { exclude: ['schema_migrations'] });
  } finally {
    await c.end();
  }
}

async function activar(idConvocatoria) {
  await conn.query('UPDATE dual_convocatorias SET activa = 0 WHERE activa = 1');
  await conn.query('UPDATE dual_convocatorias SET activa = 1 WHERE id_convocatoria = ?', [idConvocatoria]);
}

// Synthetic company with one validated application in `idConvocatoria` and one
// offer per speciality: { idEmpresa, idSolicitud, ofertas: { [idEsp]: idOferta } }.
async function empresa(cif, idConvocatoria, plazas) {
  const [e] = await conn.query(
    "INSERT INTO ge_empresas (cif, empresa, observaciones) VALUES (?, ?, '')", [cif, `EMPRESA SINTÉTICA ${cif}`]);
  const [d] = await conn.query(
    `INSERT INTO ge_domicilios (idempresa, domicilio, cp, provincia, localidad, especialidad)
     VALUES (?, 'Calle Ficticia 1', '50000', 'Zaragoza', 'Zaragoza', '')`, [e.insertId]);
  const [c] = await conn.query(
    `INSERT INTO ge_contactos (iddomicilio, dni, nombre, email, telefono, cargo, observaciones)
     VALUES (?, '00000000T', 'Contacto Sintético', 'contacto@example.test', '600000000', 'Gerente', '')`, [d.insertId]);
  const [s] = await conn.query(
    `INSERT INTO dual_solicitudes_empresa
       (id_empresa, id_convocatoria, id_representante_legal, id_coordinador_empresa,
        id_domicilio_legal, id_domicilio_trabajo, descripcion_puesto)
     VALUES (?, ?, ?, ?, ?, ?, 'Puesto sintético')`,
    [e.insertId, idConvocatoria, c.insertId, c.insertId, d.insertId, d.insertId]);
  await conn.query("UPDATE dual_solicitudes_empresa SET id_estado_validacion = fn_id_estado_validacion('VALIDADO') WHERE id_solicitud_empresa = ?", [s.insertId]);
  const ofertas = {};
  for (const [idEsp, n] of Object.entries(plazas)) {
    const [o] = await conn.query(
      'INSERT INTO dual_solicitud_empresa_especialidades (id_solicitud_empresa, id_especialidad, cantidad_alumnos) VALUES (?, ?, ?)',
      [s.insertId, idEsp, n]);
    ofertas[idEsp] = o.insertId;
  }
  return { idEmpresa: e.insertId, idSolicitud: s.insertId, ofertas };
}

async function alumno(dni, idEsp) {
  const [a] = await conn.query(
    `INSERT INTO gf_alumnosfct (nombre, dni, domicilio, cp, localidad, telalumno, email, id_especialidad_dual, observaciones)
     VALUES (?, ?, 'Calle Ficticia 2', '50000', 'Zaragoza', '600000001', 'alumno@example.test', ?, '')`,
    [`ALUMNO SINTÉTICO ${dni}`, dni, idEsp]);
  return a.insertId;
}

// Before 017 the application has no speciality column.
async function solicitudPre017(idAlumno, idConvocatoria) {
  const [s] = await conn.query(
    'INSERT INTO dual_solicitudes_alumno (id_alumno, id_convocatoria) VALUES (?, ?)', [idAlumno, idConvocatoria]);
  await conn.query("UPDATE dual_solicitudes_alumno SET id_estado_validacion = fn_id_estado_validacion('VALIDADO') WHERE id_solicitud_alumno = ?", [s.insertId]);
  return s.insertId;
}

async function reservar(idSolicitudAlumno, idOferta) {
  const [[rows]] = await conn.query('CALL sp_reservar_alumno(?, ?)', [idSolicitudAlumno, idOferta]);
  return rows[0].id_reserva;
}

test.before(async () => {
  if (!enabled) return;
  const created = verifyDb('create', '--to', '016');
  assert.ok(created.ok, created.out);
  const { connect } = require('../../scripts/lib/connect');
  conn = await connect(VERIFY);
  schemaDump = require('../../scripts/lib/schemaDump');
});

test.after(async () => {
  if (conn) await conn.end();
  if (process.env.DBNAME === VERIFY) {
    await require('../../src/db/pool').end();
  }
  if (enabled && process.env.KEEP_VERIFY !== '1') verifyDb('drop');
});

test('fixtures: synthetic data on the 016 schema', opts, async () => {
  const [c1] = await conn.query("INSERT INTO dual_convocatorias (nombre, fecha_inicio, fecha_fin, activa) VALUES ('2091/2092', '2091-09-01', '2092-08-31', 1)");
  const [c2] = await conn.query("INSERT INTO dual_convocatorias (nombre, fecha_inicio, fecha_fin, activa) VALUES ('2092/2093', '2092-09-01', '2093-08-31', 0)");
  const [ea] = await conn.query("INSERT INTO dual_especialidades (codigo, nombre, turno) VALUES ('SINT_A', 'Ciclo sintético A', 0)");
  const [eb] = await conn.query("INSERT INTO dual_especialidades (codigo, nombre, turno) VALUES ('SINT_B', 'Ciclo sintético B', 0)");
  Object.assign(fx, { conv1: c1.insertId, conv2: c2.insertId, espA: ea.insertId, espB: eb.insertId });

  fx.emp1 = await empresa('B00000001', fx.conv1, { [fx.espA]: 2, [fx.espB]: 1 });
  fx.emp2 = await empresa('B00000002', fx.conv1, { [fx.espA]: 1 });
  fx.al1 = await alumno('00000001R', fx.espA);
  fx.al2 = await alumno('00000002W', fx.espA);
  fx.sol1 = await solicitudPre017(fx.al1, fx.conv1);
  fx.sol2 = await solicitudPre017(fx.al2, fx.conv1);
  fx.res1 = await reservar(fx.sol1, fx.emp1.ofertas[fx.espA]);
  fx.res2 = await reservar(fx.sol2, fx.emp1.ofertas[fx.espA]);
  const [[cv]] = await conn.query("CALL sp_guardar_documento(?, NULL, NULL, fn_id_tipo_documento('CV'), ?)", [fx.sol1, Buffer.from('%PDF-1.4 sintético')]);
  fx.cv1 = cv[0].id_documento;
  assert.equal(await columnExists('dual_solicitudes_alumno', 'id_especialidad'), false);
});

test('017 guards: a student with two applications stops the migration and nothing changes', opts, async () => {
  await activar(fx.conv2);
  fx.sol1b = await solicitudPre017(fx.al1, fx.conv2);
  await activar(fx.conv1);
  const before = await dump();

  const run = verifyDb('migrate', '--to', '017');
  assert.equal(run.ok, false);
  assert.match(run.out, /varias solicitudes/);
  assert.equal(await one("SELECT 1 AS x FROM schema_migrations WHERE version = '017'"), null);
  const after = (await dump()).filter((o) => o.name !== 'sp_017_comprobar');
  assert.deepEqual(schemaDump.diffSchemas(before, after), []);

  // Recovery as documented: the stopped run leaves only its guard procedure behind.
  await conn.query('DROP PROCEDURE IF EXISTS sp_017_comprobar');
  await conn.query('DELETE FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ?', [fx.sol1b]);
});

test('017 guards: two current documents for the same parent and type stop the migration', opts, async () => {
  const [dup] = await conn.query(
    `INSERT INTO dual_documentos (id_solicitud_alumno, id_tipo_documento, archivo, origen_documento)
     VALUES (?, fn_id_tipo_documento('CV'), ?, 'SUBIDA')`, [fx.sol1, Buffer.from('%PDF dup')]);
  const run = verifyDb('migrate', '--to', '017');
  assert.equal(run.ok, false);
  assert.match(run.out, /documentos actuales duplicados/);
  assert.equal(await columnExists('dual_documentos', 'padre_actual'), false);
  await conn.query('DROP PROCEDURE IF EXISTS sp_017_comprobar');
  await conn.query('DELETE FROM dual_documentos WHERE id_documento = ?', [dup.insertId]);
});

test('017 applies; the speciality is copied; protected tables are untouched', opts, async () => {
  fx.schema016 = await dump();
  const protectedBefore = fx.schema016.filter((o) => PROTECTED.includes(o.name));
  const run = verifyDb('migrate', '--to', '017');
  assert.ok(run.ok, run.out);
  assert.ok(await one("SELECT 1 AS x FROM schema_migrations WHERE version = '017'"));
  assert.equal(await one("SELECT 1 AS x FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME = 'sp_017_comprobar'", [VERIFY]), null);

  const rows = await conn.query('SELECT id_solicitud_alumno, id_especialidad FROM dual_solicitudes_alumno ORDER BY 1');
  assert.deepEqual(rows[0].map((r) => r.id_especialidad), [fx.espA, fx.espA]);
  const col = await one(
    "SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'dual_solicitudes_alumno' AND COLUMN_NAME = 'id_especialidad'", [VERIFY]);
  assert.equal(col.IS_NULLABLE, 'NO');

  fx.schema017 = await dump();
  const protectedAfter = fx.schema017.filter((o) => PROTECTED.includes(o.name));
  assert.equal(protectedAfter.length, 4);
  assert.deepEqual(protectedAfter, protectedBefore);
});

test('protected tables in the verification database equal those of the development database', opts, async () => {
  const { connect } = require('../../scripts/lib/connect');
  const c = await connect(null);
  try {
    const dev = (await schemaDump.dumpSchema(c, BASE)).filter((o) => PROTECTED.includes(o.name));
    assert.deepEqual(dev, fx.schema017.filter((o) => PROTECTED.includes(o.name)));
  } finally {
    await c.end();
  }
});

test('DB-01: an application keeps its ciclo when the student re-applies with another one', opts, async () => {
  // Re-application in the next convocatoria with ciclo B, as the backend does it:
  // the student's latest ciclo is written to gf_alumnosfct, the application gets its own.
  await activar(fx.conv2);
  await conn.query('UPDATE gf_alumnosfct SET id_especialidad_dual = ? WHERE idalumno = ?', [fx.espB, fx.al1]);
  const [s] = await conn.query(
    'INSERT INTO dual_solicitudes_alumno (id_alumno, id_convocatoria, id_especialidad) VALUES (?, ?, ?)',
    [fx.al1, fx.conv2, fx.espB]);
  fx.sol1b = s.insertId;
  await activar(fx.conv1);

  const old = await one('SELECT id_especialidad FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ?', [fx.sol1]);
  assert.equal(old.id_especialidad, fx.espA);

  // The first-year application can still be placed in a ciclo-A offer (before 017
  // the trigger compared with the student's NEW ciclo and refused) …
  fx.res1b = await reservar(fx.sol1, fx.emp2.ofertas[fx.espA]);
  assert.ok(fx.res1b);
  // … and not in a ciclo-B offer.
  assert.match(await sqlError(conn.query('CALL sp_reservar_alumno(?, ?)', [fx.sol1, fx.emp1.ofertas[fx.espB]])),
    /especialidad del alumno no coincide/);
});

test('DB-01: the backend lists each application under its own ciclo', opts, async () => {
  process.env.DBNAME = VERIFY; // the pool is created on first require, after this
  const workflow = require('../../src/services/documentosWorkflow');
  const items = await workflow.buildStaffList();
  const esp = (id) => items.find((i) => i.id_solicitud_alumno === id)?.especialidad;
  assert.equal(esp(fx.sol1), 'Ciclo sintético A');
  assert.equal(esp(fx.sol1b), 'Ciclo sintético B');
});

test('DB-01: an application needs a ciclo, and it cannot change while reservations are active', opts, async () => {
  assert.match(await sqlError(conn.query(
    'INSERT INTO dual_solicitudes_alumno (id_alumno, id_convocatoria) VALUES (?, ?)', [fx.al2, fx.conv2])),
    /debe indicar la especialidad|doesn't have a default value|cannot be null/);
  assert.match(await sqlError(conn.query(
    'UPDATE dual_solicitudes_alumno SET id_especialidad = ? WHERE id_solicitud_alumno = ?', [fx.espB, fx.sol1])),
    /reservas activas/);
});

test('DB-03: a second current document for the same parent and type is refused', opts, async () => {
  const err = await sqlError(conn.query(
    `INSERT INTO dual_documentos (id_solicitud_alumno, id_tipo_documento, archivo, origen_documento)
     VALUES (?, fn_id_tipo_documento('CV'), ?, 'SUBIDA')`, [fx.sol1, Buffer.from('%PDF dup')]));
  assert.match(err, /uq_dd_actual/);

  // History rows (es_actual = 0) are not restricted.
  const [h] = await conn.query(
    `INSERT INTO dual_documentos (id_solicitud_alumno, id_tipo_documento, archivo, es_actual, origen_documento)
     VALUES (?, fn_id_tipo_documento('CV'), ?, 0, 'SUBIDA')`, [fx.sol1, Buffer.from('%PDF old')]);
  assert.ok(h.insertId);

  // Replacing through the procedure keeps one current row and archives the old file.
  const [[again]] = await conn.query("CALL sp_guardar_documento(?, NULL, NULL, fn_id_tipo_documento('CV'), ?)", [fx.sol1, Buffer.from('%PDF v2')]);
  assert.equal(again[0].id_documento, fx.cv1);
  const cur = await one("SELECT COUNT(*) AS n FROM dual_documentos WHERE id_solicitud_alumno = ? AND id_tipo_documento = fn_id_tipo_documento('CV') AND es_actual = 1", [fx.sol1]);
  assert.equal(Number(cur.n), 1);
});

test('DB-03: concurrent first uploads through the backend leave exactly one current document', opts, async () => {
  const { saveByClave } = require('../../src/services/documentosStore');
  const uploads = await Promise.allSettled([1, 2, 3].map((i) =>
    saveByClave('CV', { id_solicitud_alumno: fx.sol2 }, Buffer.from(`%PDF concurrente ${i}`), { origen: 'SUBIDA' })));
  assert.deepEqual(uploads.map((u) => u.status), ['fulfilled', 'fulfilled', 'fulfilled'],
    JSON.stringify(uploads.filter((u) => u.status === 'rejected').map((u) => u.reason.message)));
  const ids = new Set(uploads.map((u) => u.value));
  assert.equal(ids.size, 1, 'the three uploads hit the same document row');
  const cur = await one("SELECT COUNT(*) AS n FROM dual_documentos WHERE id_solicitud_alumno = ? AND es_actual = 1", [fx.sol2]);
  assert.equal(Number(cur.n), 1);
  const ver = await one('SELECT COUNT(*) AS n FROM dual_documento_versiones WHERE id_documento = ?', [[...ids][0]]);
  assert.equal(Number(ver.n), 2, 'the first file is current, the other two writes archived one version each');
});

test('DB-03: an upload inside a transaction whose snapshot predates another upload does not duplicate', opts, async () => {
  const { connect } = require('../../scripts/lib/connect');
  const { saveByClave } = require('../../src/services/documentosStore');
  const tx = await connect(VERIFY);
  try {
    await tx.beginTransaction();
    await tx.query('SELECT COUNT(*) FROM dual_documentos'); // fixes this transaction's read view
    const idOther = await saveByClave('ANEXO_DGA', { id_solicitud_alumno: fx.sol2 }, Buffer.from('%PDF otra sesión'), { origen: 'SUBIDA' });
    const idMine = await saveByClave('ANEXO_DGA', { id_solicitud_alumno: fx.sol2 }, Buffer.from('%PDF esta sesión'), { origen: 'SUBIDA' }, { conn: tx });
    await tx.commit();
    assert.equal(idMine, idOther, 'the locking read in sp_guardar_documento finds the committed row');
  } finally {
    await tx.end();
  }
  const cur = await one("SELECT COUNT(*) AS n FROM dual_documentos WHERE id_solicitud_alumno = ? AND id_tipo_documento = fn_id_tipo_documento('ANEXO_DGA') AND es_actual = 1", [fx.sol2]);
  assert.equal(Number(cur.n), 1);
});

test('DB-10: places cannot drop below the active reservations', opts, async () => {
  const idOferta = fx.emp1.ofertas[fx.espA]; // 2 places, 2 pending reservations
  const setPlazas = (n) => conn.query('UPDATE dual_solicitud_empresa_especialidades SET cantidad_alumnos = ? WHERE id_solicitud_empresa_especialidad = ?', [n, idOferta]);
  assert.match(await sqlError(setPlazas(1)), /por debajo de las reservas activas/);
  assert.equal(await sqlError(setPlazas(3)), null);
  assert.equal(await sqlError(setPlazas(2)), null);
  await conn.query('CALL sp_cancelar_reserva(?, ?)', [fx.res2, 'Cancelación sintética']);
  assert.equal(await sqlError(setPlazas(1)), null, 'one active reservation left, one place is enough');
  assert.match(await sqlError(setPlazas(0)), /por debajo de las reservas activas/);
});

test('DB-10: the backend maps the refusal to HTTP 400', opts, async () => {
  const { mapSqlError } = require('../../src/helpers/dbHelpers');
  const msg = await sqlError(conn.query('UPDATE dual_solicitud_empresa_especialidades SET cantidad_alumnos = 0 WHERE id_solicitud_empresa_especialidad = ?', [fx.emp1.ofertas[fx.espA]]));
  assert.match(msg, /por debajo/);
  try {
    await conn.query('UPDATE dual_solicitud_empresa_especialidades SET cantidad_alumnos = 0 WHERE id_solicitud_empresa_especialidad = ?', [fx.emp1.ofertas[fx.espA]]);
  } catch (err) {
    assert.equal(mapSqlError(err).status, 400);
  }
});

test('rollback restores the 016 schema; 017 can then be applied again', opts, async () => {
  const rb = verifyDb('rollback', '017');
  assert.ok(rb.ok, rb.out);
  assert.deepEqual(schemaDump.diffSchemas(fx.schema016, await dump()), []);

  // The guard now sees the second application again: delete it, then re-apply.
  const blocked = verifyDb('migrate', '--to', '017');
  assert.equal(blocked.ok, false);
  await conn.query('DELETE FROM dual_reservas WHERE id_solicitud_alumno = ?', [fx.sol1b]);
  await conn.query('DELETE FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ?', [fx.sol1b]);
  await conn.query('DROP PROCEDURE IF EXISTS sp_017_comprobar');
  // Without the column, the year-1 reservations no longer match the student's latest
  // ciclo (B): the guard refuses to copy a wrong value. Fixing the data by hand is
  // the documented way out (the rollback header warns about it).
  const stillBlocked = verifyDb('migrate', '--to', '017');
  assert.match(stillBlocked.out, /otra especialidad/);
  await conn.query('DROP PROCEDURE IF EXISTS sp_017_comprobar');
  await conn.query('UPDATE gf_alumnosfct SET id_especialidad_dual = ? WHERE idalumno = ?', [fx.espA, fx.al1]);
  const again = verifyDb('migrate', '--to', '017');
  assert.ok(again.ok, again.out);
  assert.deepEqual(schemaDump.diffSchemas(fx.schema017, await dump()), []);
});
