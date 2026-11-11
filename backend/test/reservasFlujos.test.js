// Reservations: booking by a company and by staff, staff cancellation,
// reassignment, contract type and confirmation inputs, and the lists each role
// gets (always scoped to its own company or student).
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let st = {};
const pool = fakePool((sql, params) => {
  if (sql.includes('SELECT d.idempresa FROM dual_usuarios u')) return st.empresa ? [{ idempresa: st.empresa }] : [];
  if (sql.includes('SELECT u.id_alumno FROM dual_usuarios u')) return st.alumno ? [{ id_alumno: st.alumno }] : [];
  // The company's own validated offer in the active convocatoria.
  if (sql.startsWith('SELECT ee.id_solicitud_empresa_especialidad FROM dual_solicitud_empresa_especialidades ee JOIN')) {
    return st.ofertaPropia && params[1] === st.empresa ? [{ id_solicitud_empresa_especialidad: params[0] }] : [];
  }
  if (sql.includes('fn_cupos_disponibles(ee.id_solicitud_empresa_especialidad) AS plazas_disponibles FROM dual_solicitudes_alumno sa')
    && sql.includes('WHERE sa.id_solicitud_alumno = ?') && !sql.includes('ORDER BY')) {
    return st.objetivo ? [st.objetivo] : [];
  }
  if (sql.startsWith('SELECT r.id_reserva, r.id_solicitud_alumno, r.id_solicitud_empresa_especialidad, er.nombre AS estado_reserva')) {
    return st.origen ? [st.origen] : [];
  }
  if (sql.startsWith('SELECT DISTINCT ee.id_especialidad')) return st.especialidades || [];
  if (sql.startsWith('SELECT ee.id_solicitud_empresa_especialidad FROM dual_solicitud_empresa_especialidades ee WHERE')) {
    return st.ofertaExiste ? [{ id_solicitud_empresa_especialidad: params[0] }] : [];
  }
  if (sql.startsWith('SELECT r.id_solicitud_empresa_especialidad, er.nombre AS estado FROM dual_reservas r')) {
    return st.origenReasignar ? [st.origenReasignar] : [];
  }
  if (st.lista && sql.startsWith('SELECT') && sql.includes(st.lista.match)) return st.lista.rows;
  return [];
});
stub('src/db/pool', pool);
const tx = [];
stub('src/services/reservasTx', {
  reservar: async (_c, a) => { tx.push(['reservar', a]); if (st.falloTx) throw st.falloTx; return 77; },
  cancelarAdmin: async (_c, a) => { tx.push(['cancelarAdmin', a]); },
  cancelarPendiente: async (_c, a) => { tx.push(['cancelarPendiente', a]); },
  reasignar: async (_c, a) => { tx.push(['reasignar', a]); return { idNueva: 78 }; },
  bloquearParaConfirmar: async () => {},
  confirmar: async () => [],
});
const avisos = [];
stub('src/services/notificaciones', new Proxy({}, { get: (_t, n) => (...a) => { avisos.push([n, ...a]); } }));

const svc = load('src/services/reservasService');

const EMPRESA = { id: 3, rol: 'EMPRESA' };
const ALUMNO = { id: 4, rol: 'ALUMNO' };
const ADMIN = { id: 1, rol: 'ADMINISTRADOR' };

const OBJETIVO = {
  id_solicitud_alumno: 40, conv_alumno: 5, id_especialidad_solicitud: 2, estado_alumno: 'VALIDADO',
  esp_oferta: 2, conv_empresa: 5, id_empresa: 100, estado_empresa: 'VALIDADO', activa: 1, plazas_disponibles: 1,
};

async function llamar(fn, { user = ADMIN, params = {}, body = {}, query = {}, ...estado } = {}) {
  st = { empresa: 100, ofertaPropia: true, objetivo: { ...OBJETIVO }, ...estado };
  tx.length = 0;
  avisos.length = 0;
  pool.calls.length = 0;
  const res = mockRes();
  await svc[fn](mockReq({ params, body, query, user }), res);
  return res;
}

const BOOK = { id_solicitud_alumno: 40, id_solicitud_empresa_especialidad: 5 };

// ── Booking ─────────────────────────────────────────────────────────────────

test('company booking: both ids are required', async () => {
  for (const body of [{}, { id_solicitud_alumno: 40 }, { id_solicitud_empresa_especialidad: 'x' }, { id_solicitud_alumno: -1, id_solicitud_empresa_especialidad: 5 }]) {
    assert.equal((await llamar('reservar', { user: EMPRESA, body })).statusCode, 400, JSON.stringify(body));
  }
  assert.equal(tx.length, 0);
});

test('company booking: only on its own validated offer of the active convocatoria', async () => {
  assert.equal((await llamar('reservar', { user: EMPRESA, body: BOOK, empresa: null })).statusCode, 404);
  const res = await llamar('reservar', { user: EMPRESA, body: BOOK, ofertaPropia: false });
  assert.equal(res.statusCode, 403);
  assert.equal(tx.length, 0);
});

test('booking rules give readable reasons before the database re-checks them', async () => {
  const casos = [
    [{ objetivo: null }, 404, /No se encontró/],
    [{ objetivo: { ...OBJETIVO, estado_alumno: 'PENDIENTE' } }, 400, /validados/],
    [{ objetivo: { ...OBJETIVO, estado_empresa: 'RECHAZADO' } }, 400, /validados/],
    [{ objetivo: { ...OBJETIVO, activa: 0 } }, 400, /convocatoria activa/],
    [{ objetivo: { ...OBJETIVO, conv_empresa: 6 } }, 400, /misma convocatoria/],
    [{ objetivo: { ...OBJETIVO, esp_oferta: 3 } }, 400, /especialidad/],
  ];
  for (const [estado, status, msg] of casos) {
    const res = await llamar('reservar', { user: EMPRESA, body: BOOK, ...estado });
    assert.equal(res.statusCode, status, msg.source);
    assert.match(res.body.error, msg);
  }
  assert.equal(tx.length, 0);
});

test('company booking: created PENDIENTE in a transaction, student told after the commit', async () => {
  const res = await llamar('reservar', { user: EMPRESA, body: BOOK });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { message: 'Alumno reservado correctamente.', id_reserva: 77, estado_reserva: 'PENDIENTE' });
  assert.deepEqual(tx, [['reservar', { idSolicitudAlumno: 40, idOferta: 5, user: EMPRESA }]]);
  const sqls = pool.calls.map((c) => c.sql);
  assert.ok(sqls.indexOf('COMMIT') > sqls.indexOf('BEGIN'));
  assert.deepEqual(avisos, [['reservaCreada', 77]]);
});

test('a refusal from the database rolls back and nobody is told', async () => {
  const err = new Error('Sin plazas');
  err.sqlState = '45000';
  const res = await llamar('reservar', { user: EMPRESA, body: BOOK, falloTx: err });
  assert.ok(res.statusCode >= 400, String(res.statusCode));
  assert.ok(pool.calls.some((c) => c.sql === 'ROLLBACK'));
  assert.ok(!pool.calls.some((c) => c.sql === 'COMMIT'));
  assert.deepEqual(avisos, []);
});

test('staff booking: any convocatoria, the company is told too', async () => {
  assert.equal((await llamar('reservarAdmin', { body: {} })).statusCode, 400);
  const fuera = await llamar('reservarAdmin', { body: BOOK, objetivo: { ...OBJETIVO, activa: 0 } });
  assert.equal(fuera.statusCode, 201, 'staff may book outside the active convocatoria');
  assert.deepEqual(avisos, [['reservaCreada', 77, { porCentro: true }]]);
  assert.equal((await llamar('reservarAdmin', { body: BOOK, objetivo: { ...OBJETIVO, esp_oferta: 9 } })).statusCode, 400);
});

// ── Cancelling and reassigning ──────────────────────────────────────────────

test('staff cancel: needs a reason; cancels and tells both sides', async () => {
  assert.equal((await llamar('cancelarAdmin', { params: { id: 'x' }, body: { motivo: 'a' } })).statusCode, 400);
  assert.equal((await llamar('cancelarAdmin', { params: { id: '8' }, body: {} })).statusCode, 400);
  const res = await llamar('cancelarAdmin', { params: { id: '8' }, body: { motivo: ' Baja ' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.estado_reserva, 'CANCELADA');
  assert.deepEqual(tx, [['cancelarAdmin', { idReserva: 8, motivo: 'Baja', user: ADMIN }]]);
  assert.deepEqual(avisos, [['reservaCancelada', 8, { avisarEmpresa: true }]]);
});

const ORIGEN = { id_reserva: 8, id_solicitud_alumno: 40, id_solicitud_empresa_especialidad: 4, estado_reserva: 'CONFIRMADA' };

test('reassign: input, origin and destination are checked', async () => {
  const casos = [
    [{ params: { id: '8' }, body: { motivo: 'x' } }, 400],
    [{ params: { id: '8' }, body: { id_solicitud_empresa_especialidad: 5 } }, 400],
    [{ params: { id: '8' }, body: { id_solicitud_empresa_especialidad: 5, motivo: 'x' }, origen: null }, 404],
    [{ params: { id: '8' }, body: { id_solicitud_empresa_especialidad: 5, motivo: 'x' }, origen: { ...ORIGEN, estado_reserva: 'CANCELADA' } }, 400],
    [{ params: { id: '8' }, body: { id_solicitud_empresa_especialidad: 4, motivo: 'x' }, origen: ORIGEN }, 400],
    [{ params: { id: '8' }, body: { id_solicitud_empresa_especialidad: 5, motivo: 'x' }, origen: ORIGEN, objetivo: { ...OBJETIVO, estado_empresa: 'PENDIENTE' } }, 400],
  ];
  for (const [args, status] of casos) {
    assert.equal((await llamar('reasignar', args)).statusCode, status, JSON.stringify(args));
  }
  assert.equal(tx.length, 0);
});

test('reassign: the origin is cancelled and a new reservation created; both companies hear', async () => {
  const res = await llamar('reasignar', { params: { id: '8' }, body: { id_solicitud_empresa_especialidad: 5, motivo: ' Cambio ' }, origen: ORIGEN });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: 'Alumno reasignado correctamente.', id_reserva: 78, id_reserva_origen: 8, estado_reserva: 'PENDIENTE' });
  assert.deepEqual(tx, [['reasignar', { idReservaOrigen: 8, idOferta: 5, motivo: 'Cambio', user: ADMIN }]]);
  assert.deepEqual(avisos, [['reservaCancelada', 8, { avisarEmpresa: true }], ['reservaCreada', 78, { porCentro: true }]]);
});

test('contract type and confirmation: bad ids are refused before any transaction', async () => {
  for (const body of [{}, { id_tipo_contrato: 'x' }]) {
    assert.equal((await llamar('setTipoContrato', { params: { id: '8' }, body })).statusCode, 400);
  }
  assert.equal((await llamar('setTipoContrato', { params: { id: '0' }, body: { id_tipo_contrato: 1 } })).statusCode, 400);
  assert.equal((await llamar('confirmar', { params: { id: 'x' } })).statusCode, 400);
  const res = await llamar('confirmar', { params: { id: '8' }, body: { id_tipo_contrato: 'beca' } });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Tipo de contrato/);
  assert.ok(!pool.calls.some((c) => c.sql === 'BEGIN'));
});

// ── Lists, always scoped ────────────────────────────────────────────────────

test('company lists use only its own company id; a user with no company gets 404', async () => {
  for (const fn of ['getAlumnosDisponibles', 'getCuposEmpresa', 'getMisReservas']) {
    assert.equal((await llamar(fn, { user: EMPRESA, empresa: null })).statusCode, 404, fn);
  }
  let res = await llamar('getCuposEmpresa', { user: EMPRESA, lista: { match: 'plazas_ocupadas', rows: [{ id_solicitud_empresa_especialidad: 5 }] } });
  assert.deepEqual(res.body, [{ id_solicitud_empresa_especialidad: 5 }]);
  assert.equal(pool.calls.at(-1).params.at(-1), 100);

  res = await llamar('getMisReservas', { user: EMPRESA, lista: { match: 'WHERE se.id_empresa = ? ORDER BY r.id_reserva DESC', rows: [{ id_reserva: 8 }] } });
  assert.equal(res.body[0].id_reserva, 8);
  assert.ok(pool.calls.some((c) => c.sql.includes('WHERE se.id_empresa = ?') && c.params[0] === 100));
});

test('available students: none until the company has a validated offer; then only its ciclos', async () => {
  let res = await llamar('getAlumnosDisponibles', { user: EMPRESA, especialidades: [] });
  assert.deepEqual(res.body, []);
  assert.equal(pool.calls.length, 2, 'no student is read');
  res = await llamar('getAlumnosDisponibles', {
    user: EMPRESA, especialidades: [{ id_especialidad: 2 }, { id_especialidad: 7 }],
    lista: { match: 'AS mi_reserva_id', rows: [] },
  });
  const q = pool.calls.find((c) => c.sql.includes('AS mi_reserva_id'));
  assert.deepEqual(q.params, [100, 'PENDIENTE', 'CONFIRMADA', 'CONFIRMADA', [2, 7]]);
});

test('student list: own reservations only, and never the free-text reason (SEC-11)', async () => {
  assert.equal((await llamar('getReservasAlumno', { user: ALUMNO, alumno: null })).statusCode, 404);
  await llamar('getReservasAlumno', { user: ALUMNO, alumno: 7, lista: { match: 'WHERE sa.id_alumno = ?', rows: [] } });
  const q = pool.calls.find((c) => c.sql.includes('WHERE sa.id_alumno = ?'));
  assert.deepEqual(q.params, [7]);
  assert.match(q.sql, /NULL AS motivo/);
});

test('staff list returns every reservation', async () => {
  const res = await llamar('getAll', { lista: { match: 'FROM dual_reservas r', rows: [{ id_reserva: 1 }, { id_reserva: 2 }] } });
  assert.deepEqual(res.body.map((r) => r.id_reserva), [1, 2]);
});

test('eligible offers and students need their id; reassignment destinations exclude cancelled origins', async () => {
  assert.equal((await llamar('getOfertasElegibles', { query: {} })).statusCode, 400);
  assert.equal((await llamar('getAlumnosElegibles', { query: {} })).statusCode, 400);
  assert.equal((await llamar('getAlumnosElegibles', { query: { id_solicitud_empresa_especialidad: '5' }, ofertaExiste: false })).statusCode, 404);
  let res = await llamar('getAlumnosElegibles', { query: { id_solicitud_empresa_especialidad: '5' }, ofertaExiste: true, lista: { match: 'AS reserva_actual', rows: [{ id_solicitud_alumno: 40 }] } });
  assert.deepEqual(res.body, [{ id_solicitud_alumno: 40 }]);

  res = await llamar('getOfertasElegibles', { query: { id_solicitud_alumno: '40' }, lista: { match: 'ORDER BY emp.empresa', rows: [{ id: 1 }] } });
  assert.deepEqual(res.body, [{ id: 1 }]);
  assert.equal((await llamar('getOfertasElegibles', { query: { id_solicitud_alumno: '40', reasignar_desde: '8' }, origenReasignar: null })).statusCode, 404);
  res = await llamar('getOfertasElegibles', { query: { id_solicitud_alumno: '40', reasignar_desde: '8' }, origenReasignar: { id_solicitud_empresa_especialidad: 4, estado: 'CANCELADA' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'RESERVA_CANCELADA');
  res = await llamar('getOfertasElegibles', {
    query: { id_solicitud_alumno: '40', reasignar_desde: '8' }, origenReasignar: { id_solicitud_empresa_especialidad: 4, estado: 'CONFIRMADA' },
    lista: { match: 'ee.id_solicitud_empresa_especialidad <> ?', rows: [{ id: 2 }] },
  });
  assert.deepEqual(res.body, [{ id: 2 }]);
  assert.equal(pool.calls.at(-1).params[1], 4, 'the current offer is excluded');
});
