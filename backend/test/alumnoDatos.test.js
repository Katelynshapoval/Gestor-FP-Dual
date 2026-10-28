// Corrección de datos del alumno: Administración only, the DNI is never
// editable, the ciclo only changes without active reservations, and the audit
// event names fields, never values.
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
      emailColegio: 'ana@zaragoza.salesianos.edu', nacionalidad: 'Española',
      fechaNacimiento: new Date(2005, 2, 4), sexo: 'Mujer', carnetDeConducir: 1, tieneCoche: 0,
      numeroSS: null, situacionLaboral: null, idiomasConocidos: 'Inglés B2',
      tutorLegal: null, dniTutorLegal: null,
    },
    reservas: [],
    especialidades: { 1: 'DAM', 2: 'DAW', 3: 'OFF' },
    events: [],
    writes: [],
  };
}

let db = fresh();

const pool = fakePool((sql, params) => {
  if (sql.startsWith('SELECT id_solicitud_alumno FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ? FOR UPDATE')) {
    return params[0] === db.sol.id_solicitud_alumno ? [{ id_solicitud_alumno: params[0] }] : [];
  }
  if (sql.startsWith('SELECT sa.id_solicitud_alumno, sa.id_alumno')) {
    return params[0] === db.sol.id_solicitud_alumno ? [{ ...db.sol }] : [];
  }
  if (sql.startsWith('SELECT r.id_reserva, er.nombre AS estado_reserva')) return db.reservas;
  if (sql.startsWith('SELECT id_especialidad, codigo FROM dual_especialidades')) {
    const codigo = db.especialidades[params[0]];
    return codigo && codigo !== 'OFF' ? [{ id_especialidad: params[0], codigo }] : [];
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

const notified = [];
stub('src/db/pool', pool);
stub('src/services/notificaciones', {
  escapeHtml: (v) => String(v),
  cicloCorregido: (id) => notified.push(id),
});

const svc = load('src/services/solicitudesAlumnoService');
const { requireRole } = load('src/middleware/auth');
const admin = { id: 1, rol: 'ADMINISTRADOR' };

function setup() {
  db = fresh();
  pool.calls.length = 0;
  notified.length = 0;
}

async function put(body, id = '10') {
  const res = mockRes();
  await svc.putDatos(mockReq({ user: admin, params: { id }, body }), res);
  return res;
}

const writes = (prefix) => db.writes.filter((w) => w.sql.startsWith(prefix));

test('only Administración can read or correct student data', () => {
  for (const rol of ['COORDINADOR', 'EMPRESA', 'ALUMNO']) {
    const res = mockRes();
    let next = false;
    requireRole('ADMINISTRADOR')(mockReq({ user: { id: 2, rol } }), res, () => { next = true; });
    assert.equal(res.statusCode, 403, rol);
    assert.equal(next, false);
  }
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'solicitudesAlumnoRoute.js'), 'utf8');
  assert.ok(src.includes("router.get('/solicitudes/alumno/:id/datos', requireAuth, requireRole('ADMINISTRADOR')"));
  assert.ok(src.includes("router.put('/solicitudes/alumno/:id/datos', requireAuth, requireRole('ADMINISTRADOR')"));
});

test('the DNI is refused, even unchanged, and nothing is written', async () => {
  setup();
  const res = await put({ dni: '12345678Z', nombre: 'Ana Pérez López' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'DNI_NO_EDITABLE');
  assert.equal(db.writes.length, 0);
  assert.equal(db.events.length, 0);
});

test('personal fields: only changed ones are written, the display name follows, the event has no values', async () => {
  setup();
  const res = await put({ nombre: ' Ana Pérez López ', cp: '50001', telalumno: '611111111', fechaNacimiento: '2005-03-04' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.campos.sort(), ['nombre', 'telalumno']);

  const [upd] = writes('UPDATE gf_alumnosfct');
  assert.equal(upd.sql, 'UPDATE gf_alumnosfct SET nombre = ?, telalumno = ? WHERE idalumno = ?');
  assert.deepEqual(upd.params, ['Ana Pérez López', '611111111', 42]);
  assert.equal(writes('UPDATE dual_usuarios SET nombre_mostrar')[0].params[0], 'Ana Pérez López');
  assert.equal(writes('UPDATE dual_solicitudes_alumno').length, 0);

  assert.equal(db.events.length, 1);
  assert.deepEqual(db.events[0].slice(0, 3), ['SOLICITUD_ALUMNO', 10, 'DATOS_CORREGIDOS']);
  const text = JSON.stringify(db.events);
  assert.equal(text.includes('Ana Pérez López'), false);
  assert.equal(text.includes('611111111'), false);
  assert.equal(notified.length, 0);
  assert.ok(pool.calls.some((c) => c.sql === 'COMMIT'));
});

test('no changes and invalid values are rejected without writing', async () => {
  setup();
  const same = await put({ nombre: 'Ana Pérez', carnetDeConducir: true });
  assert.equal(same.statusCode, 400);
  assert.equal(same.body.code, 'SIN_CAMBIOS');

  const bad = await put({ email: 'no-es-email', cp: '5000', nombre: '', dniTutorLegal: '12345678A' });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.code, 'DATOS_INVALIDOS');
  assert.deepEqual(Object.keys(bad.body.errores).sort(), ['cp', 'dniTutorLegal', 'email', 'nombre']);
  assert.equal(db.writes.length, 0);
  assert.equal(db.events.length, 0);
});

test('closed convocatoria and baja applications cannot be edited', async () => {
  setup();
  db.sol.convocatoria_activa = 0;
  const closed = await put({ nombre: 'Otra' });
  assert.equal(closed.body.code, 'CONVOCATORIA_CERRADA');

  setup();
  db.sol.estado_validacion = 'BAJA';
  const baja = await put({ nombre: 'Otra' });
  assert.equal(baja.body.code, 'SOLICITUD_BAJA');
  assert.equal(db.writes.length, 0);

  setup();
  const missing = await put({ nombre: 'Otra' }, '99');
  assert.equal(missing.statusCode, 404);
});

test('ciclo change: blocked by a pending or confirmed reservation, listing them', async () => {
  for (const estado of ['PENDIENTE', 'CONFIRMADA']) {
    setup();
    db.reservas = [{ id_reserva: 7, estado_reserva: estado, empresa: 'ACME', especialidad: 'DAM' }];
    const res = await put({ id_especialidad: 2 });
    assert.equal(res.statusCode, 409, estado);
    assert.equal(res.body.code, 'RESERVAS_ACTIVAS');
    assert.equal(res.body.reservas[0].id_reserva, 7);
    assert.equal(db.writes.length, 0);
    assert.equal(db.events.length, 0);
    assert.ok(pool.calls.some((c) => c.sql === 'ROLLBACK'));
  }
  const lockRead = pool.calls.find((c) => c.sql.startsWith('SELECT r.id_reserva'));
  assert.match(lockRead.sql, /FOR UPDATE OF r$/);
  const order = pool.calls.map((c) => c.sql);
  assert.ok(order.findIndex((s) => s.includes('FOR UPDATE') && s.includes('dual_solicitudes_alumno'))
    < order.findIndex((s) => s.startsWith('SELECT r.id_reserva')));
});

test('ciclo change without active reservations updates both copies and notifies', async () => {
  setup();
  const res = await put({ id_especialidad: '2' });
  assert.equal(res.statusCode, 200);

  assert.deepEqual(writes('UPDATE dual_solicitudes_alumno')[0].params, [2, 10]);
  const alumno = writes('UPDATE gf_alumnosfct')[0];
  assert.equal(alumno.sql, 'UPDATE gf_alumnosfct SET especialidad = ?, id_especialidad_dual = ? WHERE idalumno = ?');
  assert.deepEqual(alumno.params, ['DAW', 2, 42]);

  const detalle = JSON.parse(db.events[0][8]);
  assert.deepEqual(detalle, { campos: ['id_especialidad'], especialidad_anterior: 1, especialidad_nueva: 2 });
  assert.deepEqual(notified, [10]);
});

test('inactive ciclos are rejected and an unknown preferencias key is ignored', async () => {
  setup();
  const off = await put({ id_especialidad: 3 });
  assert.equal(off.body.code, 'ESPECIALIDAD_INVALIDA');

  setup();
  const old = await put({ preferencias: [11] });
  assert.equal(old.body.code, 'SIN_CAMBIOS');
  assert.equal(db.writes.length, 0);
});

test('an older application changes its own ciclo but not the student\'s latest copy', async () => {
  setup();
  db.sol.es_ultima = 0;
  const res = await put({ id_especialidad: 2 });
  assert.equal(res.statusCode, 200);
  assert.equal(writes('UPDATE dual_solicitudes_alumno').length, 1);
  assert.equal(writes('UPDATE gf_alumnosfct').length, 0);
});

test('GET datos returns the snapshot, the DNI read-only and the blocking reservations', async () => {
  setup();
  db.reservas = [{ id_reserva: 7, estado_reserva: 'PENDIENTE', empresa: 'ACME', especialidad: 'DAM' }];
  const res = mockRes();
  await svc.getDatos(mockReq({ user: admin, params: { id: '10' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.dni, '12345678Z');
  assert.equal(res.body.editable, true);
  assert.equal(res.body.datos.dni, undefined);
  assert.equal(res.body.datos.fechaNacimiento, '2005-03-04');
  assert.equal(res.body.datos.preferencias, undefined);
  assert.equal(res.body.reservas_activas.length, 1);
  assert.equal(pool.calls.some((c) => c.sql.includes('FOR UPDATE')), false);
});
