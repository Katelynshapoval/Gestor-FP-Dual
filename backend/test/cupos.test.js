// Ciclos and places of a company application: adding a ciclo, changing its
// places, and reducing below the reservations (the company or staff choose
// which pending ones are cancelled; confirmed ones are never touched).
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let st = {};
const pool = fakePool((sql, params) => {
  for (const [match, out] of st.respuestas || []) {
    if (sql.includes(match)) return typeof out === 'function' ? out(sql, params) : out;
  }
  if (sql.includes('SELECT d.idempresa FROM dual_usuarios u')) return [{ idempresa: 100 }];
  if (sql.startsWith('INSERT')) return { insertId: 60 };
  return [];
});
stub('src/db/pool', pool);
stub('src/mail/config', { transporter: { mode: 'log', sendMail: async () => ({}) } });
const real = require('../src/services/empresaDatos');
stub('src/services/empresaDatos', { ...real, loadEmpresaDatosRead: async () => ({ ...st.datos }) });
const canceladas = [];
stub('src/services/reservasTx', { cancelarPendiente: async (_c, a) => { canceladas.push(a); } });
const avisos = [];
stub('src/services/notificaciones', new Proxy({}, { get: (_t, n) => async (...a) => { avisos.push([n, ...a]); } }));

const svc = load('src/services/solicitudesEmpresaService');

const EMPRESA = { id: 3, rol: 'EMPRESA' };
const ADMIN = { id: 1, rol: 'ADMINISTRADOR' };
const DATOS = { id_solicitud_empresa: 10, id_empresa: 100, convocatoria_activa: true, estado_validacion: 'PENDIENTE' };

async function llamar(fn, { user = EMPRESA, params = {}, body = {}, datos = DATOS, respuestas = [] } = {}) {
  st = { datos, respuestas };
  canceladas.length = 0;
  avisos.length = 0;
  pool.calls.length = 0;
  const res = mockRes();
  await svc[fn](mockReq({ params: { id: '10', idOferta: '5', ...params }, body, user }), res);
  return res;
}
const escrituras = () => pool.calls.filter((c) => /^(INSERT|UPDATE|DELETE)/.test(c.sql));
const hubo = (sql) => pool.calls.some((c) => c.sql === sql);

// ── Adding a ciclo ──────────────────────────────────────────────────────────

const ALTA = { id_especialidad: 2, cantidad: 3 };
const altaResp = ({ solicitud = true, ciclo = true, existe = false } = {}) => [
  ['FROM dual_solicitudes_empresa WHERE id_solicitud_empresa = ? FOR UPDATE', solicitud ? [{ id_solicitud_empresa: 10 }] : []],
  ['FROM dual_especialidades WHERE id_especialidad = ? AND activa = 1', ciclo ? [{ id_especialidad: 2, nombre: 'Joyería' }] : []],
  ['WHERE id_solicitud_empresa = ? AND id_especialidad = ?', existe ? [{ id_solicitud_empresa_especialidad: 4 }] : []],
];

test('add ciclo: an active ciclo, not already offered; audited as a new offer', async () => {
  const res = await llamar('addEspecialidad', { body: ALTA, respuestas: altaResp() });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.deepEqual(res.body, { message: 'Ciclo añadido.', id_solicitud_empresa_especialidad: 60, id_especialidad: 2, nombre: 'Joyería', cantidad: 3 });
  assert.deepEqual(escrituras()[0].params, [10, 2, 3]);
  const ev = escrituras()[1];
  assert.deepEqual([ev.params[0], ev.params[1], ev.params[2], ev.params[4]], ['OFERTA', 60, 'ALTA', '3']);
  assert.ok(hubo('COMMIT'));
});

test('add ciclo: unknown application, inactive ciclo or a repeated one are refused', async () => {
  for (const [opts, status] of [[{ solicitud: false }, 404], [{ ciclo: false }, 400], [{ existe: true }, 409]]) {
    const res = await llamar('addEspecialidad', { body: ALTA, respuestas: altaResp(opts) });
    assert.equal(res.statusCode, status, JSON.stringify(opts));
    assert.equal(escrituras().length, 0);
    assert.ok(hubo('ROLLBACK'));
  }
});

// ── Changing places ─────────────────────────────────────────────────────────

const reserva = (id, estado, alumno = `Alumno ${id}`) => ({ id_reserva: id, estado_reserva: estado, alumno, dni_alumno: `${id}Z` });
function cupoResp({ cantidad = 3, reservas = [], oferta = true } = {}) {
  return [
    ['SELECT cantidad_alumnos FROM dual_solicitud_empresa_especialidades', oferta ? [{ cantidad_alumnos: cantidad }] : []],
    ['SELECT esp.nombre AS especialidad, emp.empresa', [{ especialidad: 'Joyería', empresa: 'ACME', email_coordinador: 'l@acme.test' }]],
    ['FOR UPDATE OF r', reservas],
    ['fn_reservas_activas(?) AS plazas_ocupadas', [{ plazas_ocupadas: 1, plazas_disponibles: 1, plazas_confirmadas: 1, plazas_pendientes: 0 }]],
  ];
}

test('places: the offer must belong to the application', async () => {
  const res = await llamar('updateCupoEspecialidad', { body: { cantidad: 2 }, respuestas: cupoResp({ oferta: false }) });
  assert.equal(res.statusCode, 404);
  assert.ok(hubo('ROLLBACK'));
});

test('places: same number is a no-op with the current counts', async () => {
  const res = await llamar('updateCupoEspecialidad', {
    body: { cantidad: 3 }, respuestas: cupoResp({ reservas: [reserva(1, 'CONFIRMADA'), reserva(2, 'PENDIENTE')] }),
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    message: 'La cantidad no ha cambiado.', cantidad: 3, plazas_ocupadas: 2, plazas_confirmadas: 1,
    plazas_pendientes: 1, plazas_disponibles: 1, canceladas: [],
  });
  assert.equal(escrituras().length, 0);
});

test('places: a validated company may lower but never raise; staff may raise', async () => {
  const validada = { ...DATOS, estado_validacion: 'VALIDADO' };
  let res = await llamar('updateCupoEspecialidad', { body: { cantidad: 5 }, datos: validada, respuestas: cupoResp() });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'REQUIERE_CENTRO');
  assert.equal(escrituras().length, 0);
  res = await llamar('updateCupoEspecialidad', { body: { cantidad: 2 }, datos: validada, respuestas: cupoResp() });
  assert.equal(res.statusCode, 200);
  res = await llamar('updateCupoEspecialidad', { user: ADMIN, body: { cantidad: 5 }, datos: validada, respuestas: cupoResp() });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(escrituras()[0].params, [5, 5]);
  const ev = escrituras()[1];
  assert.deepEqual([ev.params[0], ev.params[2], ev.params[3], ev.params[4]], ['OFERTA', 'CUPO', '3', '5']);
});

test('places: never below the confirmed students', async () => {
  const res = await llamar('updateCupoEspecialidad', {
    body: { cantidad: 1 }, respuestas: cupoResp({ reservas: [reserva(1, 'CONFIRMADA'), reserva(2, 'CONFIRMADA')] }),
  });
  assert.equal(res.statusCode, 400);
  assert.deepEqual([res.body.plazas_confirmadas, res.body.plazas_pendientes], [2, 0]);
  assert.equal(escrituras().length, 0);
});

const TRES = [reserva(1, 'CONFIRMADA'), reserva(2, 'PENDIENTE', 'Ana'), reserva(3, 'PENDIENTE', 'Luis')];

test('places below the reservations: first ask which pending ones to cancel (409, nothing changed)', async () => {
  const res = await llamar('updateCupoEspecialidad', { body: { cantidad: 2 }, respuestas: cupoResp({ reservas: TRES }) });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.requires_selection, true);
  assert.equal(res.body.cancelar_pendientes, 1);
  assert.deepEqual(res.body.pendientes.map((p) => p.id_reserva), [2, 3], 'only pending ones are offered');
  assert.match(res.body.error, /de 3 a 2 plazas hay que cancelar 1 reserva pendiente/);
  assert.deepEqual([canceladas.length, escrituras().length], [0, 0]);
});

test('places below the reservations: the selection must be exactly the needed pending ones', async () => {
  const casos = [
    { ids_reservas_cancelar: [2] },
    { confirmar_cancelaciones: true, ids_reservas_cancelar: [] },
    { confirmar_cancelaciones: true, ids_reservas_cancelar: [2, 3] },
    { confirmar_cancelaciones: true, ids_reservas_cancelar: [1] },
  ];
  for (const sel of casos) {
    const res = await llamar('updateCupoEspecialidad', { body: { cantidad: 2, ...sel }, respuestas: cupoResp({ reservas: TRES }) });
    assert.equal(res.statusCode, 409, JSON.stringify(sel));
    assert.equal(canceladas.length, 0);
  }
});

test('places below the reservations: the chosen ones are cancelled, the company and students told', async () => {
  const res = await llamar('updateCupoEspecialidad', {
    body: { cantidad: 2, confirmar_cancelaciones: true, ids_reservas_cancelar: ['3', 3, 'x'] },
    respuestas: cupoResp({ reservas: TRES }),
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(canceladas, [{
    idReserva: 3, motivo: 'Cupo reducido por la empresa.', user: EMPRESA,
    detalle: { por_reduccion_cupo: { id_oferta: 5, de: 3, a: 2 } },
  }]);
  assert.deepEqual(escrituras()[0].params, [2, 5]);
  assert.deepEqual(JSON.parse(escrituras()[1].params.at(-1)).reservas_canceladas, [3]);
  assert.match(res.body.message, /Se han cancelado 1 reserva pendiente/);
  assert.deepEqual(res.body.canceladas.map((c) => c.alumno), ['Luis']);
  assert.deepEqual(avisos.map((a) => a[0]), ['cupoReducido', 'reservaCancelada']);
  assert.deepEqual(avisos[0][1], {
    email: 'l@acme.test', empresa: 'ACME', especialidad: 'Joyería', cantidadAnterior: 3, cantidadNueva: 2,
    canceladas: res.body.canceladas,
  });
  assert.deepEqual(avisos[1].slice(1), [3]);
});

test('staff reduce with the administration reason', async () => {
  await llamar('updateCupoEspecialidad', {
    user: ADMIN, body: { cantidad: 1, confirmar_cancelaciones: true, ids_reservas_cancelar: [2, 3] },
    respuestas: cupoResp({ reservas: TRES }),
  });
  assert.deepEqual(canceladas.map((c) => [c.idReserva, c.motivo]), [[2, 'Cupo reducido por administración.'], [3, 'Cupo reducido por administración.']]);
});
