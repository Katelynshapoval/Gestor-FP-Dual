// Student change requests (migration 020): the student asks, Administración
// approves or rejects. The DNI is never requestable, approval applies the
// ciclo rules, and a correction staff made meanwhile is not overwritten
// without confirmation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

function fresh() {
  return {
    sol: {
      id_solicitud_alumno: 10, id_alumno: 42, id_convocatoria: 5, id_especialidad: 1,
      estado_validacion: 'VALIDADO', convocatoria_activa: 1, es_ultima: 1,
      dni: '12345678Z', nombre: 'Ana Pérez', domicilio: 'C/ Mayor 1', cp: '50001',
      localidad: 'Zaragoza', telalumno: '600000000', telfamilia: '', email: 'ana@example.com',
      emailColegio: null, nacionalidad: 'Española', fechaNacimiento: '2005-03-04', sexo: 'Mujer',
      carnetDeConducir: 1, tieneCoche: 0, numeroSS: null, situacionLaboral: null,
      idiomasConocidos: 'Inglés B2', tutorLegal: null, dniTutorLegal: null,
    },
    reservas: [],
    cambios: [],
    nextCambio: 1,
    events: [],
    writes: [],
  };
}

let db = fresh();

const pool = fakePool((sql, params) => {
  if (sql.startsWith('SELECT u.id_alumno FROM dual_usuarios')) return params[0] === 9 ? [{ id_alumno: 42 }] : [];
  if (sql.startsWith('SELECT sa.id_solicitud_alumno FROM dual_solicitudes_alumno sa JOIN dual_convocatorias')) {
    return params[0] === 42 && db.sol.convocatoria_activa ? [{ id_solicitud_alumno: 10 }] : [];
  }
  if (sql.startsWith('SELECT id_solicitud_alumno FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ? FOR UPDATE')) {
    return params[0] === 10 ? [{ id_solicitud_alumno: 10 }] : [];
  }
  if (sql.startsWith('SELECT sa.id_solicitud_alumno, sa.id_alumno')) return params[0] === 10 ? [{ ...db.sol }] : [];
  if (sql.startsWith('SELECT r.id_reserva, er.nombre AS estado_reserva')) return db.reservas;
  if (sql.startsWith('SELECT id_especialidad, codigo FROM dual_especialidades')) {
    return [1, 2].includes(params[0]) ? [{ id_especialidad: params[0], codigo: params[0] === 1 ? 'DAM' : 'DAW' }] : [];
  }
  if (sql.startsWith('SELECT id_especialidad, nombre FROM dual_especialidades')) {
    return params[0].map((id) => ({ id_especialidad: id, nombre: id === 1 ? 'DAM' : 'DAW' }));
  }
  if (sql.startsWith("SELECT id_cambio FROM dual_alumno_cambios WHERE id_solicitud_alumno = ? AND estado = 'PENDIENTE'")) {
    return db.cambios.filter((c) => c.estado === 'PENDIENTE').map((c) => ({ id_cambio: c.id_cambio }));
  }
  if (sql.startsWith('SELECT id_cambio, estado, payload, snapshot')) {
    return [...db.cambios].reverse().slice(0, 2);
  }
  if (sql.startsWith('SELECT * FROM dual_alumno_cambios WHERE id_cambio = ?')) {
    return db.cambios.filter((c) => c.id_cambio === params[0] && params[1] === 10);
  }
  if (sql.startsWith('INSERT INTO dual_alumno_cambios')) {
    const c = { id_cambio: db.nextCambio++, id_solicitud_alumno: params[0], estado: 'PENDIENTE', payload: params[2], snapshot: params[3], motivo: null };
    db.cambios.push(c);
    return { insertId: c.id_cambio };
  }
  if (sql.startsWith('UPDATE dual_alumno_cambios SET payload')) {
    const c = db.cambios.find((x) => x.id_cambio === params[3]);
    c.payload = params[0];
    c.snapshot = params[1];
    return { affectedRows: 1 };
  }
  if (sql.startsWith("UPDATE dual_alumno_cambios SET estado = 'APROBADO'")) {
    db.cambios.find((x) => x.id_cambio === params[1]).estado = 'APROBADO';
    return { affectedRows: 1 };
  }
  if (sql.startsWith("UPDATE dual_alumno_cambios SET estado = 'RECHAZADO'")) {
    const c = db.cambios.find((x) => x.id_cambio === params[2]);
    c.estado = 'RECHAZADO';
    c.motivo = params[1];
    return { affectedRows: 1 };
  }
  if (sql.startsWith('UPDATE')) {
    db.writes.push({ sql, params });
    return { affectedRows: 1 };
  }
  if (sql.startsWith('INSERT INTO dual_eventos')) {
    db.events.push(params);
    return { insertId: db.events.length };
  }
  throw new Error(`SQL inesperado: ${sql}`);
});

const sent = [];
stub('src/db/pool', pool);
stub('src/services/notificaciones', {
  escapeHtml: (v) => String(v),
  cicloCorregido: (id) => sent.push(['ciclo', id]),
  cambioDatosResuelto: (id, ok, motivo) => sent.push(['resuelto', id, ok, motivo]),
});

const svc = load('src/services/alumnoCambiosService');
const alumno = { id: 9, rol: 'ALUMNO' };
const admin = { id: 1, rol: 'ADMINISTRADOR' };

function setup() {
  db = fresh();
  pool.calls.length = 0;
  sent.length = 0;
}

async function call(fn, req) {
  const res = mockRes();
  await svc[fn](mockReq(req), res);
  return res;
}

const pedir = (body) => call('upsertMiCambio', { user: alumno, body });
const aprobar = (idCambio, body = {}) => call('aprobarCambio', { user: admin, params: { id: '10', idCambio: String(idCambio) }, body });
const live = (prefix) => db.writes.filter((w) => w.sql.startsWith(prefix));

test('routes: the student uses /mia, only Administración reviews', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'solicitudesAlumnoRoute.js'), 'utf8');
  for (const line of [
    "router.get('/solicitudes/alumno/mia/datos', requireAuth, requireRole('ALUMNO')",
    "router.post('/solicitudes/alumno/mia/cambios', requireAuth, requireRole('ALUMNO')",
    "router.get('/solicitudes/alumno/:id/cambios', requireAuth, requireRole('ADMINISTRADOR')",
    "router.post('/solicitudes/alumno/:id/cambios/:idCambio/aprobar', requireAuth, requireRole('ADMINISTRADOR')",
    "router.post('/solicitudes/alumno/:id/cambios/:idCambio/rechazar', requireAuth, requireRole('ADMINISTRADOR')",
  ]) {
    assert.ok(src.includes(line), line);
  }
  // /mia routes must be declared before /:id, or "mia" would match :id.
  assert.ok(src.indexOf("'/solicitudes/alumno/mia/datos'") < src.indexOf("'/solicitudes/alumno/:id'"));
});

test('a request stores only changed fields and their current values; live data is untouched', async () => {
  setup();
  const res = await pedir({ cp: '50002', nombre: 'Ana Pérez', telalumno: '611111111' });
  assert.equal(res.statusCode, 201);
  const c = db.cambios[0];
  assert.deepEqual(JSON.parse(c.payload), { cp: '50002', telalumno: '611111111' });
  assert.deepEqual(JSON.parse(c.snapshot), { cp: '50001', telalumno: '600000000' });
  assert.equal(db.writes.length, 0);
  assert.equal(db.events[0][2], 'CAMBIO_SOLICITADO');
  assert.equal(JSON.stringify(db.events).includes('50002'), false);
});

test('a second request replaces the pending one in place', async () => {
  setup();
  await pedir({ cp: '50002' });
  const res = await pedir({ localidad: 'Huesca' });
  assert.equal(res.statusCode, 200);
  assert.equal(db.cambios.length, 1);
  assert.deepEqual(JSON.parse(db.cambios[0].payload), { localidad: 'Huesca' });
});

test('the student cannot request a DNI change, an empty request or invalid values', async () => {
  setup();
  assert.equal((await pedir({ dni: '87654321X' })).body.code, 'DNI_NO_EDITABLE');
  assert.equal((await pedir({ cp: '50001' })).body.code, 'SIN_CAMBIOS');
  assert.equal((await pedir({ email: 'mal' })).body.code, 'DATOS_INVALIDOS');
  db.sol.estado_validacion = 'BAJA';
  assert.equal((await pedir({ cp: '50002' })).body.code, 'SOLICITUD_BAJA');
  assert.equal(db.cambios.length, 0);
});

test('approval applies the request, records it and tells the student', async () => {
  setup();
  await pedir({ cp: '50002', id_especialidad: 2 });
  db.events.length = 0;
  const res = await aprobar(1);
  assert.equal(res.statusCode, 200);
  assert.equal(db.cambios[0].estado, 'APROBADO');
  assert.ok(live('UPDATE gf_alumnosfct').length);
  assert.deepEqual(live('UPDATE dual_solicitudes_alumno')[0].params, [2, 10]);
  assert.equal(db.events[0][2], 'CAMBIO_APROBADO');
  assert.deepEqual(sent, [['resuelto', 10, true, undefined], ['ciclo', 10]]);
});

test('approval of a ciclo change is blocked by active reservations and leaves the request pending', async () => {
  setup();
  await pedir({ id_especialidad: 2 });
  db.reservas = [{ id_reserva: 7, estado_reserva: 'CONFIRMADA', empresa: 'ACME', especialidad: 'DAM' }];
  const res = await aprobar(1);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'RESERVAS_ACTIVAS');
  assert.equal(db.cambios[0].estado, 'PENDIENTE');
  assert.equal(db.writes.length, 0);
  assert.equal(sent.length, 0);
});

test('a field staff changed meanwhile needs confirmation before it is overwritten', async () => {
  setup();
  await pedir({ cp: '50002' });
  db.sol.cp = '50009';
  const first = await aprobar(1);
  assert.equal(first.statusCode, 409);
  assert.equal(first.body.requires_confirm, true);
  assert.deepEqual(first.body.conflictos[0], { field: 'cp', label: 'Código postal', original: '50001', actual: '50009', solicitado: '50002' });
  assert.equal(db.writes.length, 0);

  const second = await aprobar(1, { confirmar_conflicto: true });
  assert.equal(second.statusCode, 200);
  assert.deepEqual(live('UPDATE gf_alumnosfct')[0].params, ['50002', 42]);
  const detalle = JSON.parse(db.events.at(-1)[8]);
  assert.deepEqual(detalle.conflicto_confirmado, ['cp']);
});

test('a request that already matches the live data is approved without writing', async () => {
  setup();
  await pedir({ cp: '50002' });
  db.sol.cp = '50002';
  const res = await aprobar(1, { confirmar_conflicto: true });
  assert.equal(res.statusCode, 200);
  assert.equal(db.cambios[0].estado, 'APROBADO');
  assert.equal(live('UPDATE gf_alumnosfct').length, 0);
});

test('rejection needs a reason; a resolved request cannot be resolved again', async () => {
  setup();
  await pedir({ cp: '50002' });
  const sin = await call('rechazarCambio', { user: admin, params: { id: '10', idCambio: '1' }, body: { motivo: '  ' } });
  assert.equal(sin.statusCode, 400);
  const ok = await call('rechazarCambio', { user: admin, params: { id: '10', idCambio: '1' }, body: { motivo: 'El CP es correcto' } });
  assert.equal(ok.statusCode, 200);
  assert.equal(db.cambios[0].estado, 'RECHAZADO');
  assert.deepEqual(sent, [['resuelto', 10, false, 'El CP es correcto']]);
  const again = await aprobar(1);
  assert.equal(again.body.code, 'YA_RESUELTA');
  assert.equal(db.writes.length, 0);
});

test('GET shows the pending request as a labelled diff, and the last resolution', async () => {
  setup();
  await pedir({ carnetDeConducir: false, id_especialidad: 2 });
  const res = await call('getCambio', { user: admin, params: { id: '10' } });
  assert.equal(res.statusCode, 200);
  const byField = Object.fromEntries(res.body.pending.diff.map((d) => [d.field, d]));
  assert.deepEqual(byField.carnetDeConducir, { field: 'carnetDeConducir', label: 'Carnet de conducir', actual: 'Sí', solicitado: 'No' });
  assert.equal(byField.id_especialidad.solicitado, 'DAW');
  assert.equal(byField.preferencias, undefined);
  assert.deepEqual(res.body.pending.conflictos, []);

  const mine = await call('getMisDatos', { user: alumno });
  assert.equal(mine.body.dni, '12345678Z');
  assert.equal(mine.body.pending.id_cambio, 1);
});
