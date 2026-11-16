// Migration 028 (database clean-up) — end-to-end on the ISOLATED verification
// database <DBNAME>_verify (decision D8), never on DBNAME.
//
//   DB_INTEGRATION=1 node --test test/db/stage028.db.test.js
//   (KEEP_VERIFY=1 keeps the verification database afterwards)
//
// Rebuilds <DBNAME>_verify up to 027 with SYNTHETIC rows and checks: the guard
// stops 028 while a table it drops has rows; 028 applies; vw_plazas_oferta
// counts places and merges into the caller's query; one active convocatoria by
// a unique key; the shared trigger rules (also on insert); required documents
// read from dual_tipos_documento; estado_workflow values; a replaced file is
// not copied anywhere; the rollback restores the 027 schema; 028 applies again.
// Tests run in order and depend on each other.
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
let schema027;
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

const existe = async (tipo, nombre) => {
  const sql = {
    tabla: "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND TABLE_TYPE = 'BASE TABLE'",
    vista: 'SELECT 1 FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    rutina: 'SELECT 1 FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME = ?',
  }[tipo];
  return Boolean(await one(sql, [VERIFY, nombre]));
};

const documento = (cols) => conn.query(`INSERT INTO dual_documentos (${Object.keys(cols).join(', ')}) VALUES (?)`, [Object.values(cols)]);

test.before(async () => {
  if (!enabled) return;
  const created = verifyDb('create', '--to', '027');
  assert.ok(created.ok, created.out);
  const { connect } = require('../../scripts/lib/connect');
  conn = await connect(VERIFY);
  schemaDump = require('../../scripts/lib/schemaDump');
});

test.after(async () => {
  if (conn) await conn.end();
  if (enabled && process.env.KEEP_VERIFY !== '1') verifyDb('drop');
});

test('fixtures: a validated company offering 2 places and a validated student (synthetic)', opts, async () => {
  const [conv] = await conn.query("INSERT INTO dual_convocatorias (nombre, fecha_inicio, fecha_fin, activa) VALUES ('2096/2097', '2096-09-01', '2097-08-31', 1)");
  fx.conv = conv.insertId;
  const [esp] = await conn.query("INSERT INTO dual_especialidades (codigo, nombre, turno) VALUES ('SINT_028', 'Ciclo sintético 028', 0)");
  fx.esp = esp.insertId;
  const empresa = async (cif) => {
    const [e] = await conn.query("INSERT INTO ge_empresas (cif, empresa, observaciones) VALUES (?, 'EMPRESA SINTÉTICA 028', '')", [cif]);
    const [d] = await conn.query(
      "INSERT INTO ge_domicilios (idempresa, domicilio, cp, provincia, localidad, especialidad) VALUES (?, 'Calle Ficticia 1', '50000', 'Zaragoza', 'Zaragoza', '')", [e.insertId]);
    const [c] = await conn.query(
      `INSERT INTO ge_contactos (iddomicilio, dni, nombre, email, telefono, cargo, observaciones)
       VALUES (?, '00000000T', 'Contacto Sintético', 'contacto@example.test', '600000000', 'Gerente', '')`, [d.insertId]);
    return { id: e.insertId, dom: d.insertId, contacto: c.insertId };
  };
  fx.e = await empresa('B00000280');
  fx.otra = await empresa('B00000281');
  const [s] = await conn.query(
    `INSERT INTO dual_solicitudes_empresa
       (id_empresa, id_convocatoria, id_representante_legal, id_coordinador_empresa, id_domicilio_legal, id_domicilio_trabajo, descripcion_puesto)
     VALUES (?, ?, ?, ?, ?, ?, 'Puesto sintético')`, [fx.e.id, fx.conv, fx.e.contacto, fx.e.contacto, fx.e.dom, fx.e.dom]);
  fx.solEmpresa = s.insertId;
  await conn.query("UPDATE dual_solicitudes_empresa SET id_estado_validacion = fn_id_estado_validacion('VALIDADO') WHERE id_solicitud_empresa = ?", [fx.solEmpresa]);
  const [o] = await conn.query(
    'INSERT INTO dual_solicitud_empresa_especialidades (id_solicitud_empresa, id_especialidad, cantidad_alumnos) VALUES (?, ?, 2)', [fx.solEmpresa, fx.esp]);
  fx.oferta = o.insertId;
  const [a] = await conn.query(
    `INSERT INTO gf_alumnosfct (nombre, dni, domicilio, cp, localidad, telalumno, email, id_especialidad_dual, observaciones)
     VALUES ('ALUMNO SINTÉTICO 028', '00000028S', 'Calle Ficticia 2', '50000', 'Zaragoza', '600000001', 'alumno@example.test', ?, '')`, [fx.esp]);
  const [sa] = await conn.query('INSERT INTO dual_solicitudes_alumno (id_alumno, id_convocatoria, id_especialidad) VALUES (?, ?, ?)', [a.insertId, fx.conv, fx.esp]);
  fx.solAlumno = sa.insertId;
  await conn.query("UPDATE dual_solicitudes_alumno SET id_estado_validacion = fn_id_estado_validacion('VALIDADO') WHERE id_solicitud_alumno = ?", [fx.solAlumno]);
  schema027 = await dump();
});

test('the guard stops 028 before any change while a table it drops has rows', opts, async () => {
  await conn.query('INSERT INTO dual_empresa_transportes (id_empresa, id_transporte) VALUES (?, (SELECT MIN(id_transporte) FROM dual_transportes))', [fx.e.id]);
  const r = verifyDb('migrate', '--to', '028');
  assert.ok(!r.ok);
  assert.match(r.out, /dual_empresa_transportes tiene filas/);
  assert.ok(await existe('vista', 'vw_reservas_detalle'), 'nothing changed');
  assert.ok(await existe('tabla', 'dual_empresa_transportes'), 'nothing changed');
  // As with every guard, the guard procedure itself is left behind (db/README.md).
  await conn.query('DELETE FROM dual_empresa_transportes');
  await conn.query('DROP PROCEDURE IF EXISTS sp_028_comprobar');
});

test('028 applies: unused objects gone, one view, shared rule procedures', opts, async () => {
  const r = verifyDb('migrate', '--to', '028');
  assert.ok(r.ok, r.out);
  for (const v of ['vw_alumnos_disponibles', 'vw_cupos_empresa_disponibles', 'vw_reservas_detalle']) {
    assert.ok(!(await existe('vista', v)), v);
  }
  for (const t of ['dual_empresa_transportes', 'dual_documento_versiones']) assert.ok(!(await existe('tabla', t)), t);
  for (const p of ['fn_reservas_activas', 'fn_cupos_disponibles', 'sp_activar_convocatoria', 'sp_asignar_transporte_empresa']) {
    assert.ok(!(await existe('rutina', p)), p);
  }
  for (const p of ['sp_regla_motivo', 'sp_regla_documento', 'sp_regla_solicitud_empresa', 'sp_regla_usuario']) {
    assert.ok(await existe('rutina', p), p);
  }
  const vista = await one('SELECT SECURITY_TYPE AS s FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [VERIFY, 'vw_plazas_oferta']);
  assert.equal(vista.s, 'INVOKER');
  assert.equal(Number((await one('SELECT COUNT(*) AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?', [VERIFY])).n), 13);
});

test('vw_plazas_oferta counts pending and confirmed places and merges into the query', opts, async () => {
  const plazas = () => one('SELECT * FROM vw_plazas_oferta WHERE id_solicitud_empresa_especialidad = ?', [fx.oferta]);
  assert.deepEqual(
    { ...(await plazas()) },
    { id_solicitud_empresa_especialidad: fx.oferta, plazas_ofertadas: 2, plazas_pendientes: 0, plazas_confirmadas: 0, plazas_ocupadas: 0, plazas_disponibles: 2 },
  );
  const [r] = await conn.query('INSERT INTO dual_reservas (id_solicitud_alumno, id_solicitud_empresa_especialidad) VALUES (?, ?)', [fx.solAlumno, fx.oferta]);
  fx.reserva = r.insertId;
  let p = await plazas();
  assert.deepEqual([p.plazas_pendientes, p.plazas_ocupadas, p.plazas_disponibles], [1, 1, 1]);
  assert.equal(typeof p.plazas_disponibles, 'number');

  const [plan] = await conn.query(
    'EXPLAIN SELECT po.plazas_disponibles FROM vw_plazas_oferta po WHERE po.id_solicitud_empresa_especialidad = ?', [fx.oferta]);
  assert.ok(plan.some((row) => row.table === 'x' && row.key === 'ix_dual_reservas_oferta_estado'), JSON.stringify(plan));
  // Materialising the view would show a DERIVED step; only the per-offer
  // LATERAL count (DEPENDENT DERIVED) may appear.
  assert.ok(!plan.some((row) => row.select_type === 'DERIVED'), `the view is merged: ${JSON.stringify(plan)}`);

  await conn.query("UPDATE dual_reservas SET id_estado_reserva = 3, motivo = 'Prueba 028' WHERE id_reserva = ?", [fx.reserva]);
  p = await plazas();
  assert.deepEqual([p.plazas_pendientes, p.plazas_ocupadas, p.plazas_disponibles], [0, 0, 2]);
});

test('one active convocatoria: the unique key refuses a second one', opts, async () => {
  const err = await sqlError(conn.query("INSERT INTO dual_convocatorias (nombre, fecha_inicio, fecha_fin, activa) VALUES ('2097/2098', '2097-09-01', '2098-08-31', 1)"));
  assert.match(String(err), /uq_dual_convocatorias_una_activa/);
  const [c] = await conn.query("INSERT INTO dual_convocatorias (nombre, fecha_inicio, fecha_fin, activa) VALUES ('2097/2098', '2097-09-01', '2098-08-31', 0)");
  assert.match(String(await sqlError(conn.query('UPDATE dual_convocatorias SET activa = 1 WHERE id_convocatoria = ?', [c.insertId]))), /uq_dual_convocatorias_una_activa/);
  await conn.query('DELETE FROM dual_convocatorias WHERE id_convocatoria = ?', [c.insertId]);
});

test('shared trigger rules hold on insert and on update', opts, async () => {
  const cv = (await one("SELECT id_tipo_documento AS id FROM dual_tipos_documento WHERE nombre = 'CV'")).id;
  assert.match(String(await sqlError(documento({ id_solicitud_alumno: fx.solAlumno, id_tipo_documento: cv, archivo: Buffer.from('%PDF'), motivo: 'x' }))),
    /El motivo solo se guarda cuando un documento es rechazado/, 'now also on insert');
  assert.match(String(await sqlError(documento({ id_solicitud_empresa: fx.solEmpresa, id_tipo_documento: cv, archivo: Buffer.from('%PDF') }))),
    /no corresponde al registro padre/);
  assert.match(String(await sqlError(documento({ id_tipo_documento: cv, archivo: Buffer.from('%PDF') }))), /exactamente a una solicitud o reserva/);
  const [d] = await documento({ id_solicitud_alumno: fx.solAlumno, id_tipo_documento: cv, archivo: Buffer.from('%PDF cv') });
  fx.cv = d.insertId;
  assert.match(String(await sqlError(conn.query("UPDATE dual_documentos SET id_estado_validacion = fn_id_estado_validacion('RECHAZADO') WHERE id_documento = ?", [fx.cv]))),
    /Un documento rechazado requiere motivo/);

  assert.match(String(await sqlError(conn.query('UPDATE dual_solicitudes_empresa SET id_coordinador_empresa = ? WHERE id_solicitud_empresa = ?', [fx.otra.contacto, fx.solEmpresa]))),
    /misma empresa de la solicitud/);
  assert.match(String(await sqlError(conn.query("UPDATE dual_solicitudes_empresa SET motivo = 'x' WHERE id_solicitud_empresa = ?", [fx.solEmpresa]))),
    /solo se guarda cuando la solicitud de empresa es rechazada/);
  assert.match(String(await sqlError(conn.query("UPDATE dual_solicitudes_alumno SET id_estado_validacion = fn_id_estado_validacion('RECHAZADO') WHERE id_solicitud_alumno = ?", [fx.solAlumno]))),
    /solicitud de alumno rechazada requiere motivo/);

  const usuario = (rol, extra) => conn.query(
    `INSERT INTO dual_usuarios (nombre_mostrar, password_hash, id_rol, ${Object.keys(extra).join(', ')})
     VALUES ('Sintético', 'x', (SELECT id_rol FROM dual_roles WHERE nombre = ?), ?)`, [rol, Object.values(extra)]);
  assert.match(String(await sqlError(usuario('EMPRESA', { id_alumno: null }))), /debe estar vinculado a un contacto/);
  assert.match(String(await sqlError(usuario('COORDINADOR', { email: ' ' }))), /necesita un email de acceso/);
});

test('required documents come from dual_tipos_documento', opts, async () => {
  const validarAlumno = () => sqlError(conn.query('CALL sp_validar_solicitud_alumno(?)', [fx.solAlumno]));
  assert.match(String(await validarAlumno()), /faltan por validar: CV, Anexo DGA\./);
  await conn.query(
    `INSERT INTO dual_tipos_documento (nombre, nombre_mostrar, ambito, generado, requerido)
     VALUES ('PRUEBA_028', 'Documento 028', 'solicitud_alumno', 1, 1)`);
  assert.match(String(await validarAlumno()), /CV, Anexo DGA, Documento 028\./, 'a required type added by the centre');
  await conn.query("UPDATE dual_tipos_documento SET activo = 0 WHERE nombre = 'PRUEBA_028'");
  await conn.query("UPDATE dual_documentos SET id_estado_validacion = fn_id_estado_validacion('VALIDADO') WHERE id_documento = ?", [fx.cv]);
  assert.match(String(await validarAlumno()), /faltan por validar: Anexo DGA\.$/, 'inactive types and validated documents do not count');
  await conn.query("DELETE FROM dual_tipos_documento WHERE nombre = 'PRUEBA_028'");

  assert.match(String(await sqlError(conn.query('CALL sp_validar_solicitud_empresa(?)', [fx.solEmpresa]))), /faltan por validar: Convenio\./);

  // Confirming needs the anexo of the contract family: Beca → Anexo III.
  const [r] = await conn.query('INSERT INTO dual_reservas (id_solicitud_alumno, id_solicitud_empresa_especialidad) VALUES (?, ?)', [fx.solAlumno, fx.oferta]);
  fx.reserva2 = r.insertId;
  await conn.query("UPDATE dual_reservas SET id_tipo_contrato = (SELECT id_tipo_contrato FROM dual_tipos_contrato WHERE nombre = 'BECA') WHERE id_reserva = ?", [fx.reserva2]);
  await conn.query('SET autocommit = 0');
  try {
    const err = await sqlError(conn.query('CALL sp_confirmar_reserva(?, NULL)', [fx.reserva2]));
    assert.match(String(err), /faltan firmados y validados: Anexo III\./);
  } finally {
    await conn.query('ROLLBACK');
    await conn.query('SET autocommit = 1');
  }
});

test('estado_workflow takes only the values the backend writes', opts, async () => {
  assert.match(String(await sqlError(conn.query("UPDATE dual_documentos SET estado_workflow = 'OTRO' WHERE id_documento = ?", [fx.cv]))), /chk_dd_estado_workflow/);
  await conn.query("UPDATE dual_documentos SET estado_workflow = 'SUBIDO_FIRMADO' WHERE id_documento = ?", [fx.cv]);
});

test('sp_guardar_documento replaces the file in place and keeps no copy', opts, async () => {
  const cv = (await one("SELECT id_tipo_documento AS id FROM dual_tipos_documento WHERE nombre = 'CV'")).id;
  const [res] = await conn.query('CALL sp_guardar_documento(?, NULL, NULL, ?, ?)', [fx.solAlumno, cv, Buffer.from('%PDF nuevo')]);
  assert.equal(res[0][0].id_documento, fx.cv);
  const d = await one('SELECT archivo, estado_workflow, id_estado_validacion FROM dual_documentos WHERE id_documento = ?', [fx.cv]);
  assert.equal(d.archivo.toString(), '%PDF nuevo');
  assert.equal(d.estado_workflow, 'SUBIDO');
  assert.equal(d.id_estado_validacion, 1);
});

test('the rollback restores the 027 schema', opts, async () => {
  const r = verifyDb('rollback', '028');
  assert.ok(r.ok, r.out);
  assert.deepEqual(await dump(), schema027);
});

test('028 applies again after the rollback', opts, async () => {
  const r = verifyDb('migrate', '--to', '028');
  assert.ok(r.ok, r.out);
  assert.ok(await existe('vista', 'vw_plazas_oferta'));
});
