// Database improvement plan · Stage 2 (migration 018) — REAL MySQL tests on the
// ISOLATED verification database <DBNAME>_verify (decision D8), never on DBNAME.
//
//   DB_INTEGRATION=1 node --test test/db/stage2.db.test.js
//   (KEEP_VERIFY=1 keeps the verification database afterwards)
//
// Rebuilds <DBNAME>_verify from the repository up to 017, fills it with SYNTHETIC
// rows only, applies 018 and checks the reservation model (one row per attempt),
// transaction ownership (procedures refuse autocommit; events commit or roll back
// with their change), lock ordering under real concurrent sessions, atomic baja,
// quota reduction against concurrent bookings, and the rollback limits of 018.
// Faults are injected with temporary triggers. Tests run in order and share state.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const BASE = process.env.DBNAME;
const VERIFY = `${BASE}_verify`;
const enabled = process.env.DB_INTEGRATION === '1' && process.env.NODE_ENV !== 'production'
  && Boolean(BASE) && !/_verify$/.test(BASE);
const opts = { skip: enabled ? false : 'DB_INTEGRATION=1 no definido' };

const PROTECTED = ['ge_contactos', 'ge_domicilios', 'ge_empresas', 'gf_alumnosfct'];
const BACKEND = path.join(__dirname, '..', '..');

// Backend modules must use the verification database and never send email.
if (enabled) {
  process.env.DBNAME = VERIFY;
  process.env.MAIL_MODE = 'log';
}
const { mockReq, mockRes } = require('../helpers/harness'); // also stubs the mailer

let conn; // admin connection (autocommit on) for fixtures and assertions
let schemaDump;
const fx = { esp: {}, alumnos: {}, ofertas: {} };
let deadlocksAntes = null;

function verifyDb(...args) {
  const r = spawnSync(process.execPath, [path.join(BACKEND, 'scripts', 'verifyDb.js'), ...args], {
    env: { ...process.env, DBNAME: BASE }, encoding: 'utf8',
  });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
}

async function connectVerify() {
  const { connect } = require('../../scripts/lib/connect');
  return connect(VERIFY);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function stillPending(promise, ms = 400) {
  const marker = Symbol('pending');
  return (await Promise.race([promise.then(() => 'done', () => 'done'), sleep(ms).then(() => marker)])) === marker;
}

// A second session that holds its transaction open until told to commit.
async function session() {
  const c = await connectVerify();
  await c.query('SET autocommit = 0');
  await c.query('SET SESSION innodb_lock_wait_timeout = 15');
  return c;
}

async function estado(idReserva) {
  const r = await one(
    `SELECT er.nombre AS estado, r.id_tipo_contrato, r.id_empresa_tutor, r.motivo, r.id_reserva_origen
       FROM dual_reservas r JOIN dual_estados_reserva er USING (id_estado_reserva) WHERE r.id_reserva = ?`, [idReserva]);
  return r;
}
const eventos = async (entidad, id) => (await conn.query(
  'SELECT accion, estado_anterior, estado_nuevo, motivo, detalle FROM dual_eventos WHERE entidad = ? AND id_entidad = ? ORDER BY id_evento',
  [entidad, id]))[0];
const countEventos = async () => Number((await one('SELECT COUNT(*) AS n FROM dual_eventos')).n);
const activas = async (idOferta) => Number((await one(
  'SELECT COUNT(*) AS n FROM dual_reservas WHERE id_solicitud_empresa_especialidad = ? AND id_estado_reserva IN (1, 2)', [idOferta])).n);

async function deadlockStamp() {
  const [[row]] = await conn.query('SHOW ENGINE INNODB STATUS');
  const m = /LATEST DETECTED DEADLOCK\s*-+\s*([^\n]+)/.exec(row.Status);
  return m ? m[1].trim() : null;
}

// ── synthetic fixtures (017 schema) ────────────────────────────────────────
async function empresa(cif, plazasPorEsp) {
  const [e] = await conn.query("INSERT INTO ge_empresas (cif, empresa, observaciones) VALUES (?, ?, '')", [cif, `EMPRESA SINTÉTICA ${cif}`]);
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
    [e.insertId, fx.conv, c.insertId, c.insertId, d.insertId, d.insertId]);
  await conn.query("UPDATE dual_solicitudes_empresa SET id_estado_validacion = fn_id_estado_validacion('VALIDADO') WHERE id_solicitud_empresa = ?", [s.insertId]);
  const ofertas = {};
  for (const [idEsp, n] of Object.entries(plazasPorEsp)) {
    const [o] = await conn.query(
      'INSERT INTO dual_solicitud_empresa_especialidades (id_solicitud_empresa, id_especialidad, cantidad_alumnos) VALUES (?, ?, ?)',
      [s.insertId, idEsp, n]);
    ofertas[idEsp] = o.insertId;
  }
  const [t] = await conn.query(
    `INSERT INTO ge_contactos (iddomicilio, dni, nombre, email, telefono, cargo, observaciones)
     VALUES (?, '', 'Tutora Sintética', 'tutora@example.test', '600000009', 'Tutora', '')`, [d.insertId]);
  const [tu] = await conn.query('INSERT INTO dual_empresa_tutores (id_empresa, id_contacto) VALUES (?, ?)', [e.insertId, t.insertId]);
  return { idEmpresa: e.insertId, idSolicitud: s.insertId, ofertas, idTutor: tu.insertId };
}

let dniSeq = 10;
async function alumno(idEsp, { cuenta = false } = {}) {
  const dni = `000000${String(dniSeq += 1).padStart(2, '0')}X`;
  const [a] = await conn.query(
    `INSERT INTO gf_alumnosfct (nombre, dni, domicilio, cp, localidad, telalumno, email, id_especialidad_dual, observaciones)
     VALUES (?, ?, 'Calle Ficticia 2', '50000', 'Zaragoza', '600000001', 'alumno@example.test', ?, '')`,
    [`ALUMNO SINTÉTICO ${dni}`, dni, idEsp]);
  const [s] = await conn.query(
    'INSERT INTO dual_solicitudes_alumno (id_alumno, id_convocatoria, id_especialidad) VALUES (?, ?, ?)', [a.insertId, fx.conv, idEsp]);
  await conn.query("UPDATE dual_solicitudes_alumno SET id_estado_validacion = fn_id_estado_validacion('VALIDADO') WHERE id_solicitud_alumno = ?", [s.insertId]);
  if (cuenta) {
    await conn.query(
      `INSERT INTO dual_usuarios (nombre_mostrar, password_hash, id_rol, id_alumno, activo, must_change_password)
       VALUES ('Alumno sintético', 'x', (SELECT id_rol FROM dual_roles WHERE nombre = 'ALUMNO'), ?, 1, 0)`, [a.insertId]);
  }
  return { idAlumno: a.insertId, idSolicitud: s.insertId };
}

// Pending reservation ready to be confirmed: contract type BECA and a validated Anexo III.
async function preparaConfirmable(idReserva) {
  await conn.query("UPDATE dual_reservas SET id_tipo_contrato = (SELECT id_tipo_contrato FROM dual_tipos_contrato WHERE nombre = 'BECA') WHERE id_reserva = ?", [idReserva]);
  const [[res]] = await conn.query("CALL sp_guardar_documento(NULL, NULL, ?, fn_id_tipo_documento('ANEXO_III'), ?)", [idReserva, Buffer.from('%PDF anexo sintético')]);
  await conn.query('CALL sp_validar_documento(?)', [res[0].id_documento]);
  return res[0].id_documento;
}

// Service call as the synthetic administrator.
async function api(fn, { params = {}, body = {} } = {}) {
  const res = mockRes();
  await fn(mockReq({ params, body, user: { id: fx.admin, rol: 'ADMINISTRADOR' } }), res);
  return res;
}

const svc = () => require('../../src/services/reservasService');
const { inTransaction } = enabled ? require('../../src/db/transaction') : {};
const tx = enabled ? require('../../src/services/reservasTx') : null;
const user = () => ({ id: fx.admin, rol: 'ADMINISTRADOR' });

// ── setup ───────────────────────────────────────────────────────────────────
test.before(async () => {
  if (!enabled) return;
  const created = verifyDb('create', '--to', '017');
  assert.ok(created.ok, created.out);
  conn = await connectVerify();
  schemaDump = require('../../scripts/lib/schemaDump');
});

test.after(async () => {
  if (conn) {
    await conn.query('DROP TRIGGER IF EXISTS trg_test_falla_evento').catch(() => {});
    await conn.query('DROP TRIGGER IF EXISTS trg_test_falla_reserva').catch(() => {});
    await conn.end();
  }
  if (enabled) await require('../../src/db/pool').end();
  if (enabled && process.env.KEEP_VERIFY !== '1') verifyDb('drop');
});

test('fixtures: synthetic convocatoria, ciclos, companies, students and an administrator (017 schema)', opts, async () => {
  const [c] = await conn.query("INSERT INTO dual_convocatorias (nombre, fecha_inicio, fecha_fin, activa) VALUES ('2091/2092', '2091-09-01', '2092-08-31', 1)");
  fx.conv = c.insertId;
  const [ea] = await conn.query("INSERT INTO dual_especialidades (codigo, nombre, turno) VALUES ('SINT_A', 'Ciclo sintético A', 0)");
  fx.esp.A = ea.insertId;
  const [u] = await conn.query(
    `INSERT INTO dual_usuarios (nombre_mostrar, email, password_hash, id_rol, activo, must_change_password)
     VALUES ('Administración sintética', 'admin@example.test', 'x', (SELECT id_rol FROM dual_roles WHERE nombre = 'ADMINISTRADOR'), 1, 0)`);
  fx.admin = u.insertId;
  fx.e1 = await empresa('B00000011', { [fx.esp.A]: 1 }); // the "last place" offer
  fx.e2 = await empresa('B00000012', { [fx.esp.A]: 3 });
  fx.e3 = await empresa('B00000013', { [fx.esp.A]: 3 });
  fx.e4 = await empresa('B00000014', { [fx.esp.A]: 2 });
  for (const k of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']) fx.alumnos[k] = await alumno(fx.esp.A);
  fx.alumnos.baja = await alumno(fx.esp.A, { cuenta: true });
  fx.schema017 = await dump();
});

test('018 applies; protected tables untouched; the old pair key is gone', opts, async () => {
  const run = verifyDb('migrate', '--to', '018');
  assert.ok(run.ok, run.out);
  fx.schema018 = await dump();
  const prot = (d) => d.filter((o) => PROTECTED.includes(o.name));
  assert.equal(prot(fx.schema018).length, 4);
  assert.deepEqual(prot(fx.schema018), prot(fx.schema017));
  assert.equal(await one("SELECT 1 AS x FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND INDEX_NAME = 'uq_dual_reservas_alumno_oferta'", [VERIFY]), null);
  assert.ok(await one("SELECT 1 AS x FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND INDEX_NAME = 'uq_dr_par_activo'", [VERIFY]));
  assert.equal(await one("SELECT 1 AS x FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME = 'sp_018_comprobar'", [VERIFY]), null);
});

test('protected tables in the verification database equal those of the development database', opts, async () => {
  const { connect } = require('../../scripts/lib/connect');
  const c = await connect(null);
  try {
    const dev = (await schemaDump.dumpSchema(c, BASE)).filter((o) => PROTECTED.includes(o.name));
    assert.deepEqual(dev, fx.schema018.filter((o) => PROTECTED.includes(o.name)));
  } finally {
    await c.end();
  }
});

test('rollback (no attempts, no new events yet): restores the 017 schema exactly; 018 re-applies', opts, async () => {
  const rb = verifyDb('rollback', '018');
  assert.ok(rb.ok, rb.out);
  assert.deepEqual(schemaDump.diffSchemas(fx.schema017, await dump()), []);
  const again = verifyDb('migrate', '--to', '018');
  assert.ok(again.ok, again.out);
  assert.deepEqual(schemaDump.diffSchemas(fx.schema018, await dump()), []);
  deadlocksAntes = await deadlockStamp();
});

test('D6: a transactional procedure refuses to run with autocommit = 1', opts, async () => {
  for (const call of [
    ['CALL sp_reservar_alumno(?, ?)', [fx.alumnos.a1.idSolicitud, fx.e2.ofertas[fx.esp.A]]],
    ['CALL sp_cancelar_reserva(?, ?)', [1, 'x']],
    ['CALL sp_cancelar_reserva_admin(?, ?)', [1, 'x']],
    ['CALL sp_confirmar_reserva(?, NULL)', [1]],
    ['CALL sp_reasignar_reserva(?, ?, ?)', [1, 2, 'x']],
  ]) {
    const err = await conn.query(...call).then(() => null, (e) => e);
    assert.ok(err, `${call[0]} must fail outside a transaction`);
    assert.equal(err.sqlState, '45001');
    assert.match(err.sqlMessage, /dentro de una transacción/);
  }
  assert.equal(Number((await one('SELECT COUNT(*) AS n FROM dual_reservas')).n), 0);
});

test('D6: no reservation procedure is called outside reservasTx.js (static check)', opts, () => {
  const guarded = /sp_(reservar_alumno|confirmar_reserva|reasignar_reserva|cancelar_reserva|cancelar_reserva_admin)\b/;
  const dir = path.join(BACKEND, 'src');
  const offenders = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.js') && f.name !== 'reservasTx.js') {
        fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          if (guarded.test(line) && /CALL|callProcedure/.test(line)) offenders.push(`${path.relative(dir, p)}:${i + 1}`);
        });
      }
    }
  };
  walk(dir);
  assert.deepEqual(offenders, []);
  const txSrc = fs.readFileSync(path.join(dir, 'services', 'reservasTx.js'), 'utf8');
  assert.doesNotMatch(txSrc, /callProcedure\w*\(\s*pool/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'services', 'auditLog.js'), 'utf8'), /function\s+recordEventAfterCommit|recordEventAfterCommit\s*[,}]/);
});

test('concurrency 1: two sessions compete for the last place — one wins, the other is refused after waiting', opts, async () => {
  const oferta = fx.e1.ofertas[fx.esp.A]; // 1 place
  const A = await session();
  const B = await session();
  try {
    const [[ra]] = await A.query('CALL sp_reservar_alumno(?, ?)', [fx.alumnos.a1.idSolicitud, oferta]);
    const pB = B.query('CALL sp_reservar_alumno(?, ?)', [fx.alumnos.a2.idSolicitud, oferta]);
    assert.ok(await stillPending(pB), 'B waits for A (offer row locked)');
    await A.query('COMMIT');
    const errB = await pB.then(() => null, (e) => e.sqlMessage || e.message);
    assert.match(errB, /No quedan plazas/);
    await B.query('ROLLBACK');
    fx.resLast = ra[0].id_reserva;
  } finally {
    await A.end();
    await B.end();
  }
  assert.equal(await activas(oferta), 1);

  // Same race through the backend (inTransaction + reservasTx), several rounds.
  for (let i = 0; i < 3; i += 1) {
    const [o] = await conn.query('INSERT INTO dual_solicitud_empresa_especialidades (id_solicitud_empresa, id_especialidad, cantidad_alumnos) VALUES (?, ?, 1)',
      [fx.e1.idSolicitud, (await conn.query("INSERT INTO dual_especialidades (codigo, nombre, turno) VALUES (?, 'Ciclo carrera', 1)", [`RACE${i}`]))[0].insertId]);
    const idEsp = (await one('SELECT id_especialidad FROM dual_solicitud_empresa_especialidades WHERE id_solicitud_empresa_especialidad = ?', [o.insertId])).id_especialidad;
    const s1 = await alumno(idEsp);
    const s2 = await alumno(idEsp);
    const out = await Promise.allSettled([s1, s2].map((s) =>
      inTransaction((c) => tx.reservar(c, { idSolicitudAlumno: s.idSolicitud, idOferta: o.insertId, user: user() }))));
    assert.deepEqual(out.map((x) => x.status).sort(), ['fulfilled', 'rejected']);
    assert.match(out.find((x) => x.status === 'rejected').reason.sqlMessage, /No quedan plazas/);
    assert.equal(await activas(o.insertId), 1);
    const ganadora = out.find((x) => x.status === 'fulfilled').value;
    assert.equal((await eventos('RESERVA', ganadora)).length, 1, 'one RESERVAR event for the winner, none for the loser');
  }
});

test('concurrency 2: a confirmation and a new booking of the same student serialise; never two placements', opts, async () => {
  const al = fx.alumnos.a3;
  const [[r1]] = await (async () => { const c = await session(); try { const out = await c.query('CALL sp_reservar_alumno(?, ?)', [al.idSolicitud, fx.e2.ofertas[fx.esp.A]]); await c.query('COMMIT'); return out; } finally { await c.end(); } })();
  const idR1 = r1[0].id_reserva;
  await preparaConfirmable(idR1);

  // Confirmation first: the booking waits for the student application, then is refused.
  const A = await session();
  const B = await session();
  try {
    await A.query('CALL sp_confirmar_reserva(?, NULL)', [idR1]);
    const pB = B.query('CALL sp_reservar_alumno(?, ?)', [al.idSolicitud, fx.e3.ofertas[fx.esp.A]]);
    assert.ok(await stillPending(pB));
    await A.query('COMMIT');
    assert.match(await pB.then(() => null, (e) => e.sqlMessage), /ya tiene una reserva confirmada/);
    await B.query('ROLLBACK');
  } finally {
    await A.end();
    await B.end();
  }
  assert.equal((await estado(idR1)).estado, 'CONFIRMADA');

  // Booking first: the confirmation waits, then cancels the new pending sibling.
  const al2 = fx.alumnos.a4;
  const c0 = await session();
  const [[x]] = await c0.query('CALL sp_reservar_alumno(?, ?)', [al2.idSolicitud, fx.e2.ofertas[fx.esp.A]]);
  await c0.query('COMMIT');
  await c0.end();
  const idX = x[0].id_reserva;
  await preparaConfirmable(idX);
  const C = await session();
  const D = await session();
  try {
    const [[y]] = await C.query('CALL sp_reservar_alumno(?, ?)', [al2.idSolicitud, fx.e3.ofertas[fx.esp.A]]);
    const pD = D.query('CALL sp_confirmar_reserva(?, NULL)', [idX]);
    assert.ok(await stillPending(pD));
    await C.query('COMMIT');
    await pD;
    await D.query('COMMIT');
    const sib = await estado(y[0].id_reserva);
    assert.equal(sib.estado, 'CANCELADA');
    assert.equal(sib.motivo, 'Alumno asignado a otra empresa.');
  } finally {
    await C.end();
    await D.end();
  }
  const conf = await one('SELECT COUNT(*) AS n FROM dual_reservas WHERE id_solicitud_alumno = ? AND id_estado_reserva = 2', [al2.idSolicitud]);
  assert.equal(Number(conf.n), 1);
});

test('one student, two confirmations at once: exactly one placement (procedure and unique key)', opts, async () => {
  const al = fx.alumnos.a5;
  const ids = [];
  for (const e of [fx.e2, fx.e4]) {
    ids.push(await inTransaction((c) => tx.reservar(c, { idSolicitudAlumno: al.idSolicitud, idOferta: e.ofertas[fx.esp.A], user: user() })));
  }
  for (const id of ids) await preparaConfirmable(id);
  const out = await Promise.allSettled(ids.map((id) =>
    inTransaction((c) => tx.confirmar(c, { idReserva: id, idTipoContrato: null, user: user() }))));
  assert.deepEqual(out.map((x) => x.status).sort(), ['fulfilled', 'rejected']);
  assert.match(out.find((x) => x.status === 'rejected').reason.sqlMessage, /Solo una reserva PENDIENTE puede confirmarse/);
  const conf = await one('SELECT COUNT(*) AS n FROM dual_reservas WHERE id_solicitud_alumno = ? AND id_estado_reserva = 2', [al.idSolicitud]);
  assert.equal(Number(conf.n), 1);
  // The unique key catches it even when the procedures are bypassed.
  const otra = ids.find((id) => id !== out.find((x) => x.status === 'fulfilled').value) ?? ids[1];
  const err = await conn.query(
    'INSERT INTO dual_reservas (id_solicitud_alumno, id_solicitud_empresa_especialidad, id_estado_reserva, id_tipo_contrato) VALUES (?, ?, 2, 1)',
    [al.idSolicitud, fx.e3.ofertas[fx.esp.A]]).then(() => null, (e) => e.sqlMessage);
  assert.match(err, /ya tiene una reserva confirmada|Duplicate entry/);
  assert.ok(otra);
});

test('D2/D5: cancel, then re-book — a NEW row; the cancelled attempt keeps contract type, tutor, reason and documents', opts, async () => {
  const al = fx.alumnos.a6;
  const oferta = fx.e3.ofertas[fx.esp.A];
  const first = await api(svc().reservarAdmin, { body: { id_solicitud_alumno: al.idSolicitud, id_solicitud_empresa_especialidad: oferta } });
  assert.equal(first.statusCode, 201, JSON.stringify(first.body));
  const id1 = first.body.id_reserva;
  const idDoc = await preparaConfirmable(id1);
  await conn.query('UPDATE dual_reservas SET id_empresa_tutor = ? WHERE id_reserva = ?', [fx.e3.idTutor, id1]);
  const antes = await estado(id1);

  const cancel = await api(svc().cancelarAdmin, { params: { id: String(id1) }, body: { motivo: 'Prueba sintética de cancelación' } });
  assert.equal(cancel.statusCode, 200, JSON.stringify(cancel.body));
  const cancelada = await estado(id1);
  assert.equal(cancelada.estado, 'CANCELADA');
  assert.equal(cancelada.id_tipo_contrato, antes.id_tipo_contrato, 'contract type kept (D5)');
  assert.equal(cancelada.id_empresa_tutor, fx.e3.idTutor, 'tutor kept');
  assert.equal(cancelada.motivo, 'Prueba sintética de cancelación');

  const second = await api(svc().reservarAdmin, { body: { id_solicitud_alumno: al.idSolicitud, id_solicitud_empresa_especialidad: oferta } });
  assert.equal(second.statusCode, 201, JSON.stringify(second.body));
  const id2 = second.body.id_reserva;
  assert.notEqual(id2, id1, 'a new attempt is a new row');
  assert.deepEqual(await estado(id1), cancelada, 'the cancelled attempt is untouched');
  const nueva = await estado(id2);
  assert.deepEqual([nueva.estado, nueva.id_tipo_contrato, nueva.id_empresa_tutor], ['PENDIENTE', null, null]);

  const doc = await one('SELECT id_reserva, es_actual FROM dual_documentos WHERE id_documento = ?', [idDoc]);
  assert.deepEqual([doc.id_reserva, Number(doc.es_actual)], [id1, 1], 'the annex stays with its attempt');
  assert.equal(Number((await one('SELECT COUNT(*) AS n FROM dual_documentos WHERE id_reserva = ?', [id2])).n), 0);

  // A second active attempt for the same pair is refused (procedure and unique key).
  const dup = await api(svc().reservarAdmin, { body: { id_solicitud_alumno: al.idSolicitud, id_solicitud_empresa_especialidad: oferta } });
  assert.equal(dup.statusCode, 400);
  const raw = await conn.query('INSERT INTO dual_reservas (id_solicitud_alumno, id_solicitud_empresa_especialidad) VALUES (?, ?)', [al.idSolicitud, oferta])
    .then(() => null, (e) => e.code);
  assert.equal(raw, 'ER_DUP_ENTRY');

  // The detail of the new attempt links the earlier one.
  const det = await api(svc().getDetalle, { params: { id: String(id2) } });
  assert.deepEqual(det.body.relacionadas.map((x) => [x.id_reserva, x.relacion]), [[id1, 'INTENTO_ANTERIOR']]);
  fx.cancelada = id1;
  fx.rebook = id2;
});

test('D2: a cancelled reservation cannot be reactivated or edited', opts, async () => {
  const id = fx.cancelada;
  assert.match(await sqlError(conn.query('UPDATE dual_reservas SET id_estado_reserva = 1, motivo = NULL WHERE id_reserva = ?', [id])), /cancelada es definitiva/);
  assert.match(await sqlError(conn.query('UPDATE dual_reservas SET id_tipo_contrato = NULL WHERE id_reserva = ?', [id])), /cancelada es definitiva/);
  assert.match(await sqlError(conn.query('UPDATE dual_reservas SET id_empresa_tutor = NULL WHERE id_reserva = ?', [id])), /cancelada es definitiva/);
  assert.equal(await sqlError(conn.query('UPDATE dual_reservas SET motivo = motivo WHERE id_reserva = ?', [id])), null, 'a no-op is allowed');
  const tipo = await api(svc().setTipoContrato, { params: { id: String(id) }, body: { id_tipo_contrato: 2 } });
  assert.equal(tipo.statusCode, 400);
});

test('invalid transitions are refused', opts, async () => {
  const conf = await one('SELECT id_reserva FROM dual_reservas WHERE id_estado_reserva = 2 LIMIT 1');
  assert.match(await sqlError(conn.query('UPDATE dual_reservas SET id_estado_reserva = 1 WHERE id_reserva = ?', [conf.id_reserva])), /solo puede cancelarse de forma administrativa/);
  assert.match(await sqlError(inTransaction((c) => tx.cancelarPendiente(c, { idReserva: conf.id_reserva, motivo: 'x', user: user() }))), /Solo una reserva PENDIENTE/);
  assert.match(await sqlError(inTransaction((c) => tx.confirmar(c, { idReserva: fx.cancelada, idTipoContrato: null, user: user() }))), /Solo una reserva PENDIENTE puede confirmarse/);
  assert.match(await sqlError(inTransaction((c) => tx.cancelarAdmin(c, { idReserva: fx.cancelada, motivo: 'x', user: user() }))), /ya esta cancelada/);
  assert.match(await sqlError(inTransaction((c) => tx.reasignar(c, { idReservaOrigen: fx.cancelada, idOferta: fx.e2.ofertas[fx.esp.A], motivo: 'x', user: user() }))), /reasignar una reserva cancelada/);
  assert.match(await sqlError(conn.query('UPDATE dual_reservas SET id_solicitud_empresa_especialidad = ? WHERE id_reserva = ?', [fx.e2.ofertas[fx.esp.A], fx.rebook])), /No se puede cambiar el alumno ni la especialidad/);
  assert.match(await sqlError(conn.query(
    'INSERT INTO dual_reservas (id_solicitud_alumno, id_solicitud_empresa_especialidad, id_reserva_origen) VALUES (?, ?, ?)',
    [fx.alumnos.a7.idSolicitud, fx.e4.ofertas[fx.esp.A], fx.cancelada])), /reserva de origen debe ser una reserva cancelada del mismo alumno/);
});

test('reassignment records the origin; both sides have their events', opts, async () => {
  const res = await api(svc().reasignar, {
    params: { id: String(fx.rebook) },
    body: { id_solicitud_empresa_especialidad: fx.e4.ofertas[fx.esp.A], motivo: 'Reasignación sintética' },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const idNueva = res.body.id_reserva;
  assert.equal((await estado(idNueva)).id_reserva_origen, fx.rebook);
  assert.equal((await estado(fx.rebook)).estado, 'CANCELADA');
  assert.deepEqual((await eventos('RESERVA', fx.rebook)).map((e) => e.accion), ['RESERVAR', 'REASIGNAR']);
  const evN = await eventos('RESERVA', idNueva);
  assert.deepEqual(evN.map((e) => e.accion), ['RESERVAR']);
  assert.equal(evN[0].detalle.reasignada_desde, fx.rebook);
  const det = await api(svc().getDetalle, { params: { id: String(idNueva) } });
  assert.equal(det.body.reserva.id_reserva_origen, fx.rebook);
  assert.deepEqual(det.body.relacionadas.map((x) => x.relacion), ['REASIGNADA_DESDE']);
  // The origin can never be the origin of a second reservation.
  assert.match(await sqlError(conn.query(
    'INSERT INTO dual_reservas (id_solicitud_alumno, id_solicitud_empresa_especialidad, id_reserva_origen) VALUES (?, ?, ?)',
    [fx.alumnos.a6.idSolicitud, fx.e1.ofertas[fx.esp.A], fx.rebook])), /uq_dr_reserva_origen|plazas/);
  fx.reasignada = idNueva;
});

test('audit atomicity: if the event cannot be written, the transition rolls back completely', opts, async () => {
  await conn.query(`CREATE TRIGGER trg_test_falla_evento BEFORE INSERT ON dual_eventos FOR EACH ROW
    BEGIN IF NEW.accion IN ('RESERVAR', 'CONFIRMAR') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo inyectado en auditoría'; END IF; END`);
  try {
    const n = Number((await one('SELECT COUNT(*) AS n FROM dual_reservas')).n);
    const ev = await countEventos();
    const res = await api(svc().reservarAdmin, { body: { id_solicitud_alumno: fx.alumnos.a7.idSolicitud, id_solicitud_empresa_especialidad: fx.e2.ofertas[fx.esp.A] } });
    assert.notEqual(res.statusCode, 201);
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM dual_reservas')).n), n, 'no reservation row');
    assert.equal(await countEventos(), ev);

    // Confirmation: the reservation stays PENDIENTE and its pending sibling stays too.
    const idA = await inTransaction((c) => tx.reservar(c, { idSolicitudAlumno: fx.alumnos.a7.idSolicitud, idOferta: fx.e2.ofertas[fx.esp.A], user: user() }))
      .catch(() => null);
    assert.equal(idA, null, 'reservar also fails while the fault is active');
  } finally {
    await conn.query('DROP TRIGGER IF EXISTS trg_test_falla_evento');
  }
  // One more place on each of the two offers used below (earlier tests filled them).
  await conn.query('UPDATE dual_solicitud_empresa_especialidades SET cantidad_alumnos = cantidad_alumnos + 1 WHERE id_solicitud_empresa_especialidad IN (?, ?)',
    [fx.e2.ofertas[fx.esp.A], fx.e3.ofertas[fx.esp.A]]);
  const idA = await inTransaction((c) => tx.reservar(c, { idSolicitudAlumno: fx.alumnos.a7.idSolicitud, idOferta: fx.e2.ofertas[fx.esp.A], user: user() }));
  const idB = await inTransaction((c) => tx.reservar(c, { idSolicitudAlumno: fx.alumnos.a7.idSolicitud, idOferta: fx.e3.ofertas[fx.esp.A], user: user() }));
  await preparaConfirmable(idA);
  await conn.query(`CREATE TRIGGER trg_test_falla_evento BEFORE INSERT ON dual_eventos FOR EACH ROW
    BEGIN IF NEW.accion = 'CANCELAR' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo inyectado en auditoría'; END IF; END`);
  try {
    const res = await api(svc().confirmar, { params: { id: String(idA) } });
    assert.notEqual(res.statusCode, 200);
    assert.equal((await estado(idA)).estado, 'PENDIENTE', 'confirmation rolled back with the failed sibling event');
    assert.equal((await estado(idB)).estado, 'PENDIENTE');
    assert.deepEqual((await eventos('RESERVA', idA)).map((e) => e.accion), ['RESERVAR'], 'no CONFIRMAR event left behind');
  } finally {
    await conn.query('DROP TRIGGER IF EXISTS trg_test_falla_evento');
  }
  fx.a7 = { idA, idB };
});

test('baja: one failed cancellation rolls back the state, the account, the other cancellation and every event', opts, async () => {
  const al = fx.alumnos.baja;
  // One more place on two shared offers (earlier tests filled them).
  const [o1] = await conn.query(
    'UPDATE dual_solicitud_empresa_especialidades SET cantidad_alumnos = cantidad_alumnos + 1 WHERE id_solicitud_empresa_especialidad = ?',
    [fx.e2.ofertas[fx.esp.A]]);
  const [o2] = await conn.query(
    'UPDATE dual_solicitud_empresa_especialidades SET cantidad_alumnos = cantidad_alumnos + 1 WHERE id_solicitud_empresa_especialidad = ?',
    [fx.e3.ofertas[fx.esp.A]]);
  assert.ok(o1.affectedRows && o2.affectedRows);
  const r1 = await inTransaction((c) => tx.reservar(c, { idSolicitudAlumno: al.idSolicitud, idOferta: fx.e2.ofertas[fx.esp.A], user: user() }));
  const r2 = await inTransaction((c) => tx.reservar(c, { idSolicitudAlumno: al.idSolicitud, idOferta: fx.e3.ofertas[fx.esp.A], user: user() }));
  const { darDeBaja } = require('../../src/services/bajaService');
  const ev = await countEventos();
  await conn.query(`CREATE TRIGGER trg_test_falla_reserva BEFORE UPDATE ON dual_reservas FOR EACH ROW FOLLOWS trg_dr_bu_reglas
    BEGIN IF OLD.id_reserva = ${Number(r2)} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo inyectado en la cancelación'; END IF; END`);
  try {
    await assert.rejects(darDeBaja('SOLICITUD_ALUMNO', al.idSolicitud, { user: user(), motivo: 'Baja sintética' }), /fallo inyectado/);
  } finally {
    await conn.query('DROP TRIGGER IF EXISTS trg_test_falla_reserva');
  }
  const sol = await one('SELECT ev.nombre AS estado FROM dual_solicitudes_alumno sa JOIN dual_estados_validacion ev USING (id_estado_validacion) WHERE sa.id_solicitud_alumno = ?', [al.idSolicitud]);
  assert.equal(sol.estado, 'VALIDADO');
  assert.equal(Number((await one('SELECT activo FROM dual_usuarios WHERE id_alumno = ?', [al.idAlumno])).activo), 1);
  assert.equal((await estado(r1)).estado, 'PENDIENTE', 'the first cancellation was rolled back too');
  assert.equal((await estado(r2)).estado, 'PENDIENTE');
  assert.equal(await countEventos(), ev, 'no event left behind');

  const ok = await darDeBaja('SOLICITUD_ALUMNO', al.idSolicitud, { user: user(), motivo: 'Baja sintética' });
  assert.deepEqual(ok, { ok: true, canceladas: [r1, r2] });
  assert.equal((await estado(r1)).estado, 'CANCELADA');
  assert.equal(Number((await one('SELECT activo FROM dual_usuarios WHERE id_alumno = ?', [al.idAlumno])).activo), 0);
  assert.equal(await countEventos(), ev + 3, 'BAJA + two CANCELAR');
  // Nothing new can be reserved for a withdrawn application — and it is told so
  // even when the offer is also full (eligibility is checked before places).
  assert.match(await sqlError(inTransaction((c) => tx.reservar(c, { idSolicitudAlumno: al.idSolicitud, idOferta: fx.e4.ofertas[fx.esp.A], user: user() }))), /validados/);
  assert.equal(await activas(fx.e1.ofertas[fx.esp.A]), 1, 'e1 has its single place taken');
  assert.match(await sqlError(inTransaction((c) => tx.reservar(c, { idSolicitudAlumno: al.idSolicitud, idOferta: fx.e1.ofertas[fx.esp.A], user: user() }))), /validados/);
});

test('quota reduction vs. concurrent booking: never over-allocated, in either order', opts, async () => {
  const [o] = await conn.query('INSERT INTO dual_solicitud_empresa_especialidades (id_solicitud_empresa, id_especialidad, cantidad_alumnos) VALUES (?, ?, 2)',
    [fx.e1.idSolicitud, (await conn.query("INSERT INTO dual_especialidades (codigo, nombre, turno) VALUES ('CUPO', 'Ciclo cupo', 1)"))[0].insertId]);
  const idOferta = o.insertId;
  const idEsp = (await one('SELECT id_especialidad FROM dual_solicitud_empresa_especialidades WHERE id_solicitud_empresa_especialidad = ?', [idOferta])).id_especialidad;
  const s = [await alumno(idEsp), await alumno(idEsp), await alumno(idEsp)];
  await inTransaction((c) => tx.reservar(c, { idSolicitudAlumno: s[0].idSolicitud, idOferta, user: user() }));

  // Reduction first (2 → 1, one active): the booking waits on the offer row, then is refused.
  const A = await session();
  const B = await session();
  try {
    await A.query('UPDATE dual_solicitud_empresa_especialidades SET cantidad_alumnos = 1 WHERE id_solicitud_empresa_especialidad = ?', [idOferta]);
    const pB = B.query('CALL sp_reservar_alumno(?, ?)', [s[1].idSolicitud, idOferta]);
    assert.ok(await stillPending(pB));
    await A.query('COMMIT');
    assert.match(await pB.then(() => null, (e) => e.sqlMessage), /No quedan plazas/);
    await B.query('ROLLBACK');
  } finally {
    await A.end();
    await B.end();
  }
  assert.equal(await activas(idOferta), 1);

  // Booking first (back to 2 places): the reduction waits, then the floor trigger refuses it.
  await conn.query('UPDATE dual_solicitud_empresa_especialidades SET cantidad_alumnos = 2 WHERE id_solicitud_empresa_especialidad = ?', [idOferta]);
  const C = await session();
  const D = await session();
  try {
    await C.query('CALL sp_reservar_alumno(?, ?)', [s[1].idSolicitud, idOferta]);
    const pD = D.query('UPDATE dual_solicitud_empresa_especialidades SET cantidad_alumnos = 1 WHERE id_solicitud_empresa_especialidad = ?', [idOferta]);
    assert.ok(await stillPending(pD));
    await C.query('COMMIT');
    assert.match(await pD.then(() => null, (e) => e.sqlMessage), /por debajo de las reservas activas/);
    await D.query('ROLLBACK');
  } finally {
    await C.end();
    await D.end();
  }
  assert.equal(await activas(idOferta), 2);
  const cant = Number((await one('SELECT cantidad_alumnos AS n FROM dual_solicitud_empresa_especialidades WHERE id_solicitud_empresa_especialidad = ?', [idOferta])).n);
  assert.ok(await activas(idOferta) <= cant);
  fx.cupo = { idOferta, s };
});

test('quota reduction through the backend: common cancellation path, events for the offer and each reservation', opts, async () => {
  const { idOferta } = fx.cupo;
  const pend = (await conn.query('SELECT id_reserva FROM dual_reservas WHERE id_solicitud_empresa_especialidad = ? AND id_estado_reserva = 1 ORDER BY id_reserva', [idOferta]))[0];
  await conn.query("UPDATE dual_reservas SET id_tipo_contrato = 1 WHERE id_reserva = ?", [pend[0].id_reserva]);
  const empSvc = require('../../src/services/solicitudesEmpresaService');
  const params = { id: String(fx.e1.idSolicitud), idOferta: String(idOferta) };

  const sinSeleccion = await api(empSvc.updateCupoEspecialidad, { params, body: { cantidad: 1 } });
  assert.equal(sinSeleccion.statusCode, 409);
  assert.equal(sinSeleccion.body.cancelar_pendientes, 1);
  assert.equal(Number((await one('SELECT cantidad_alumnos AS n FROM dual_solicitud_empresa_especialidades WHERE id_solicitud_empresa_especialidad = ?', [idOferta])).n), 2);

  const ok = await api(empSvc.updateCupoEspecialidad, {
    params, body: { cantidad: 1, confirmar_cancelaciones: true, ids_reservas_cancelar: [pend[0].id_reserva] },
  });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  const c = await estado(pend[0].id_reserva);
  assert.deepEqual([c.estado, c.id_tipo_contrato, c.motivo], ['CANCELADA', 1, 'Cupo reducido por administración.']);
  const evR = await eventos('RESERVA', pend[0].id_reserva);
  assert.equal(evR.at(-1).accion, 'CANCELAR');
  assert.deepEqual(evR.at(-1).detalle.por_reduccion_cupo, { id_oferta: idOferta, de: 2, a: 1 });
  const evO = await eventos('OFERTA', idOferta);
  assert.deepEqual(evO.map((e) => [e.accion, e.estado_anterior, e.estado_nuevo]), [['CUPO', '2', '1']]);

  // A failure while cancelling leaves the quota and the reservations untouched.
  await conn.query('UPDATE dual_solicitud_empresa_especialidades SET cantidad_alumnos = 3 WHERE id_solicitud_empresa_especialidad = ?', [idOferta]);
  const nueva = await inTransaction((cx) => tx.reservar(cx, { idSolicitudAlumno: fx.cupo.s[2].idSolicitud, idOferta, user: user() }));
  await conn.query(`CREATE TRIGGER trg_test_falla_reserva BEFORE UPDATE ON dual_reservas FOR EACH ROW FOLLOWS trg_dr_bu_reglas
    BEGIN IF OLD.id_reserva = ${Number(nueva)} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo inyectado en la cancelación'; END IF; END`);
  const ev = await countEventos();
  try {
    const bad = await api(empSvc.updateCupoEspecialidad, {
      params, body: { cantidad: 1, confirmar_cancelaciones: true, ids_reservas_cancelar: [nueva] },
    });
    assert.equal(bad.statusCode, 400);
  } finally {
    await conn.query('DROP TRIGGER IF EXISTS trg_test_falla_reserva');
  }
  assert.equal(Number((await one('SELECT cantidad_alumnos AS n FROM dual_solicitud_empresa_especialidades WHERE id_solicitud_empresa_especialidad = ?', [idOferta])).n), 3);
  assert.equal((await estado(nueva)).estado, 'PENDIENTE');
  assert.equal(await countEventos(), ev);
});

test('stress: 8 parallel workers, 80 mixed operations through the backend — invariants hold, no partial commits', opts, async () => {
  const idEsp = (await conn.query("INSERT INTO dual_especialidades (codigo, nombre, turno) VALUES ('STRESS', 'Ciclo estrés', 1)"))[0].insertId;
  const ofertas = [];
  for (let i = 0; i < 4; i += 1) {
    const [o] = await conn.query('INSERT INTO dual_solicitud_empresa_especialidades (id_solicitud_empresa, id_especialidad, cantidad_alumnos) VALUES (?, ?, 2)',
      [[fx.e1, fx.e2, fx.e3, fx.e4][i].idSolicitud, idEsp]);
    ofertas.push(o.insertId);
  }
  const alumnos = [];
  for (let i = 0; i < 10; i += 1) alumnos.push((await alumno(idEsp)).idSolicitud);
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const outcomes = { ok: 0, refused: 0, otros: [] };
  const op = async () => {
    const kind = rnd(5);
    const al = alumnos[rnd(alumnos.length)];
    const of = ofertas[rnd(ofertas.length)];
    const [[act]] = await conn.query(
      `SELECT id_reserva, id_estado_reserva FROM dual_reservas
        WHERE id_solicitud_alumno = ? AND id_estado_reserva IN (1, 2) ORDER BY RAND() LIMIT 1`, [al]);
    try {
      if (kind <= 1 || !act) {
        await inTransaction((c) => tx.reservar(c, { idSolicitudAlumno: al, idOferta: of, user: user() }));
      } else if (kind === 2) {
        await conn.query('UPDATE dual_reservas SET id_tipo_contrato = 1 WHERE id_reserva = ? AND id_estado_reserva = 1', [act.id_reserva]).catch(() => {});
        await preparaConfirmable(act.id_reserva).catch(() => {});
        await inTransaction((c) => tx.confirmar(c, { idReserva: act.id_reserva, idTipoContrato: null, user: user() }));
      } else if (kind === 3) {
        await inTransaction((c) => tx.cancelarAdmin(c, { idReserva: act.id_reserva, motivo: 'Estrés', user: user() }));
      } else {
        await inTransaction((c) => tx.reasignar(c, { idReservaOrigen: act.id_reserva, idOferta: of, motivo: 'Estrés', user: user() }));
      }
      outcomes.ok += 1;
    } catch (err) {
      if (err.sqlState === '45000' || err.code === 'ER_DUP_ENTRY') outcomes.refused += 1;
      else outcomes.otros.push(`${err.code} ${err.message}`);
    }
  };
  const worker = async () => { for (let i = 0; i < 10; i += 1) await op(); };
  await Promise.all(Array.from({ length: 8 }, worker));
  assert.deepEqual(outcomes.otros, [], 'only business refusals; no lock timeouts or unexpected errors');
  assert.ok(outcomes.ok > 10, `operations that succeeded: ${outcomes.ok}`);

  // Invariants over the whole database.
  assert.equal(Number((await one(`SELECT COUNT(*) AS n FROM dual_solicitud_empresa_especialidades ee
     WHERE (SELECT COUNT(*) FROM dual_reservas r WHERE r.id_solicitud_empresa_especialidad = ee.id_solicitud_empresa_especialidad
            AND r.id_estado_reserva IN (1, 2)) > ee.cantidad_alumnos`)).n), 0, 'no offer over quota');
  assert.equal(Number((await one(`SELECT COUNT(*) AS n FROM (SELECT id_solicitud_alumno FROM dual_reservas WHERE id_estado_reserva = 2
     GROUP BY id_solicitud_alumno HAVING COUNT(*) > 1) x`)).n), 0, 'one placement per student');
  assert.equal(Number((await one(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM dual_reservas WHERE id_estado_reserva IN (1, 2)
     GROUP BY id_solicitud_alumno, id_solicitud_empresa_especialidad HAVING COUNT(*) > 1) x`)).n), 0, 'one active attempt per pair');
  fx.stress = outcomes;
});

test('every reservation created under 018 has its events; every state matches its last event', opts, async () => {
  const [rows] = await conn.query(
    `SELECT r.id_reserva, er.nombre AS estado,
            (SELECT COUNT(*) FROM dual_eventos e WHERE e.entidad = 'RESERVA' AND e.id_entidad = r.id_reserva AND e.accion = 'RESERVAR') AS creadas,
            (SELECT e.estado_nuevo FROM dual_eventos e WHERE e.entidad = 'RESERVA' AND e.id_entidad = r.id_reserva
               AND e.estado_nuevo IN ('PENDIENTE', 'CONFIRMADA', 'CANCELADA') ORDER BY e.id_evento DESC LIMIT 1) AS ultimo
       FROM dual_reservas r JOIN dual_estados_reserva er USING (id_estado_reserva)`);
  // Rows written directly by this test with raw SQL sessions (concurrency 1–2, quota) have no events by design.
  const directas = new Set([fx.resLast]);
  const conEventos = rows.filter((r) => Number(r.creadas) > 0);
  console.log(`[stage2] reservations with events: ${conEventos.length} of ${rows.length}`);
  assert.ok(conEventos.length >= 15, `only ${conEventos.length} reservations have events`);
  for (const r of conEventos) {
    if (directas.has(r.id_reserva)) continue;
    assert.equal(Number(r.creadas), 1, `reservation ${r.id_reserva}: exactly one RESERVAR`);
    assert.equal(r.ultimo, r.estado, `reservation ${r.id_reserva}: last event matches the row`);
  }
});

test('no deadlock was detected by InnoDB during the suite', opts, async () => {
  const ahora = await deadlockStamp();
  assert.equal(ahora, deadlocksAntes, `LATEST DETECTED DEADLOCK changed during the tests: ${ahora}`);
});

test('rollback with attempts and OFERTA/TUTOR-era data: refused, nothing changed', opts, async () => {
  const before = await dump();
  const rb = verifyDb('rollback', '018');
  assert.equal(rb.ok, false);
  assert.match(rb.out, /varios intentos de reserva/);
  assert.deepEqual(schemaDump.diffSchemas(before, (await dump()).filter((o) => o.name !== 'sp_018_comprobar_rollback')), []);
  await conn.query('DROP PROCEDURE IF EXISTS sp_018_comprobar_rollback');
});
