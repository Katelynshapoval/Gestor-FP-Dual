// Reservations: a company or a student only sees its own reservation's detail,
// and a company only cancels its own pending reservations, with a reason.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let estado = {};
const pool = fakePool((sql, params) => {
  if (sql.includes('SELECT d.idempresa FROM dual_usuarios u')) return estado.empresa ? [{ idempresa: estado.empresa }] : [];
  if (sql.includes('SELECT u.id_alumno FROM dual_usuarios u')) return estado.alumno ? [{ id_alumno: estado.alumno }] : [];
  if (sql.includes('WHERE r.id_reserva = ?') && sql.includes('tc.nombre AS tipo_contrato_clave')) {
    return estado.reserva && params[0] === estado.reserva.id_reserva ? [estado.reserva] : [];
  }
  if (sql.startsWith('SELECT r.id_reserva, er.nombre AS estado_reserva, se.id_empresa')) {
    return estado.reserva && params[0] === estado.reserva.id_reserva
      ? [{ id_reserva: estado.reserva.id_reserva, estado_reserva: estado.reserva.estado_reserva, id_empresa: estado.reserva.id_empresa }]
      : [];
  }
  return [];
});
stub('src/db/pool', pool);
const canceladas = [];
stub('src/services/reservasTx', {
  cancelarPendiente: async (_conn, args) => { canceladas.push(args); },
});
const avisos = [];
stub('src/services/notificaciones', new Proxy({}, { get: (_t, nombre) => (...a) => { avisos.push([nombre, ...a]); } }));

const svc = load('src/services/reservasService');

const reserva = (extra = {}) => ({
  id_reserva: 8, estado_reserva: 'PENDIENTE', id_empresa: 100, id_alumno: 7, id_solicitud_alumno: 40,
  id_solicitud_empresa: 10, id_solicitud_empresa_especialidad: 5, id_tipo_contrato: null, tipo_contrato_clave: null,
  empresa: 'ACME', alumno: 'Ana', especialidad: 'Joyería', convocatoria_activa: 1, ...extra,
});

async function detalle(user, { id = '8', ...e } = {}) {
  estado = { reserva: reserva(), ...e };
  const res = mockRes();
  await svc.getDetalle(mockReq({ params: { id }, user }), res);
  return res;
}

const EMPRESA = { id: 3, rol: 'EMPRESA' };
const ALUMNO = { id: 4, rol: 'ALUMNO' };
const ADMIN = { id: 1, rol: 'ADMINISTRADOR' };

test('detail: the owning company, the student and staff see it; others get 403', async () => {
  assert.equal((await detalle(EMPRESA, { empresa: 100 })).statusCode, 200);
  assert.equal((await detalle(ALUMNO, { alumno: 7 })).statusCode, 200);
  assert.equal((await detalle(ADMIN)).statusCode, 200);
  assert.equal((await detalle({ id: 2, rol: 'COORDINADOR' })).statusCode, 200);

  assert.equal((await detalle(EMPRESA, { empresa: 200 })).statusCode, 403);
  assert.equal((await detalle(EMPRESA, { empresa: null })).statusCode, 403);
  assert.equal((await detalle(ALUMNO, { alumno: 9 })).statusCode, 403);
  assert.equal((await detalle(ALUMNO, { alumno: null })).statusCode, 403);
  assert.equal((await detalle({ id: 5, rol: 'OTRO' })).statusCode, 403);
});

test('detail: bad id is 400, unknown reservation is 404', async () => {
  assert.equal((await detalle(ADMIN, { id: 'abc' })).statusCode, 400);
  assert.equal((await detalle(ADMIN, { id: '0' })).statusCode, 400);
  assert.equal((await detalle(ADMIN, { id: '99' })).statusCode, 404);
});

async function cancelar(body, e = {}) {
  estado = { reserva: reserva(), empresa: 100, ...e };
  canceladas.length = 0;
  avisos.length = 0;
  const res = mockRes();
  await svc.cancelar(mockReq({ params: { id: e.id || '8' }, body, user: EMPRESA }), res);
  return res;
}

test('company cancel: needs a reason and a valid id', async () => {
  assert.equal((await cancelar({})).statusCode, 400);
  assert.equal((await cancelar({ motivo: '   ' })).statusCode, 400);
  assert.equal((await cancelar({ motivo: 'x' }, { id: 'abc' })).statusCode, 400);
  assert.equal(canceladas.length, 0);
});

test('company cancel: only its own reservation, and only while pending', async () => {
  let res = await cancelar({ motivo: 'Ya no podemos' }, { empresa: 200 });
  assert.equal(res.statusCode, 403);
  res = await cancelar({ motivo: 'Ya no podemos' }, { id: '99' });
  assert.equal(res.statusCode, 403, 'an unknown reservation reveals nothing');
  res = await cancelar({ motivo: 'Ya no podemos' }, { empresa: null });
  assert.equal(res.statusCode, 404);
  for (const e of ['CONFIRMADA', 'CANCELADA']) {
    res = await cancelar({ motivo: 'Ya no podemos' }, { reserva: reserva({ estado_reserva: e }) });
    assert.equal(res.statusCode, 400, e);
  }
  assert.equal(canceladas.length, 0);
  assert.equal(avisos.length, 0);
});

test('company cancel: its own pending reservation is cancelled in a transaction and the student is told', async () => {
  const res = await cancelar({ motivo: '  Ya no podemos  ' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.estado_reserva, 'CANCELADA');
  assert.deepEqual(canceladas, [{ idReserva: 8, motivo: 'Ya no podemos', user: EMPRESA }]);
  assert.ok(pool.calls.some((c) => c.sql === 'COMMIT'));
  assert.deepEqual(avisos, [['reservaCancelada', 8]]);
});
