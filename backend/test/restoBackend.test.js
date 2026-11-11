// Remaining backend pieces: the reservation transaction helpers (lock order,
// audit events, refusals), login and the administrator's password reset, the
// help route (manual images only from their folder) and the public catalogues.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, fakeBcrypt, mockReq, mockRes } = require('./helpers/harness');

let st = {};
const pool = fakePool((sql, params) => {
  for (const [match, out] of st.respuestas || []) {
    if (sql.includes(match)) return typeof out === 'function' ? out(sql, params) : out;
  }
  return [];
});
stub('src/db/pool', pool);
stub('bcrypt', fakeBcrypt);
// Always its own secret, like the other test files: never whatever the
// environment (a developer's .env or CI) happens to provide.
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-0123456789';

const tx = load('src/services/reservasTx');
const auth = load('src/services/authService');
const { loginRateLimiter } = require('../src/middleware/loginRateLimit');

const USER = { id: 1, rol: 'ADMINISTRADOR' };
function conn(respuestas = []) {
  st = { respuestas };
  pool.calls.length = 0;
  return { query: pool.query, release() {} };
}
const sqls = () => pool.calls.map((c) => c.sql);
const eventos = () => pool.calls.filter((c) => c.sql.startsWith('INSERT INTO dual_eventos')).map((c) => [c.params[1], c.params[2], c.params[3], c.params[4]]);

// ── Reservation transactions ────────────────────────────────────────────────

test('transactions refuse to run without the connection of inTransaction()', async () => {
  for (const fn of ['reservar', 'cancelarPendiente', 'cancelarAdmin', 'confirmar', 'reasignar']) {
    await assert.rejects(tx[fn](pool, {}), /inTransaction/, fn);
    await assert.rejects(tx[fn](null, {}), /inTransaction/, fn);
  }
});

test('book: the procedure\'s new id is audited; no id means failure', async () => {
  let c = conn([['CALL sp_reservar_alumno', [[[{ id_reserva: 77 }]], []]]]);
  assert.equal(await tx.reservar(c, { idSolicitudAlumno: 40, idOferta: 5, user: USER }), 77);
  assert.deepEqual(pool.calls[0].params, [40, 5]);
  assert.deepEqual(eventos(), [[77, 'RESERVAR', null, 'PENDIENTE']]);
  c = conn([['CALL sp_reservar_alumno', [[]]]]);
  await assert.rejects(tx.reservar(c, { idSolicitudAlumno: 40, idOferta: 5, user: USER }), /no devolvió/);
});

test('offers are locked once each, in ascending id order (migration 018)', async () => {
  const c = conn();
  await tx.bloquearOfertas(c, [9, 3, null, 9, '5']);
  assert.deepEqual(pool.calls[0].params, [[3, 5, 9]]);
  conn();
  await tx.bloquearOfertas(c, [null]);
  assert.equal(pool.calls.length, 0);
});

test('staff cancel: offer first, then the reservation; the previous state goes to the audit', async () => {
  const c = conn([
    ['AS oferta FROM dual_reservas WHERE id_reserva = ?', [{ oferta: 5 }]],
    ['FOR UPDATE OF r', [{ id_reserva: 8, estado: 'CONFIRMADA' }]],
  ]);
  const antes = await tx.cancelarAdmin(c, { idReserva: 8, motivo: 'Baja', user: USER });
  assert.equal(antes, 'CONFIRMADA');
  const orden = sqls();
  assert.ok(orden.findIndex((s) => s.includes('dual_solicitud_empresa_especialidades')) < orden.findIndex((s) => s.includes('FOR UPDATE OF r')));
  assert.ok(orden.some((s) => s.startsWith('CALL sp_cancelar_reserva_admin')));
  assert.deepEqual(eventos(), [[8, 'CANCELAR', 'CONFIRMADA', 'CANCELADA']]);
});

test('company cancel: procedure and event with the reason', async () => {
  const c = conn();
  await tx.cancelarPendiente(c, { idReserva: 8, motivo: 'No', user: USER });
  assert.deepEqual(pool.calls[0].params, [8, 'No']);
  assert.deepEqual(eventos(), [[8, 'CANCELAR', 'PENDIENTE', 'CANCELADA']]);
});

test('confirm: student application, then offers, then reservations; each cancelled sibling audited', async () => {
  const c = conn([
    ['SELECT id_solicitud_alumno FROM dual_reservas WHERE id_reserva = ?', [{ id_solicitud_alumno: 40 }]],
    ['WHERE id_solicitud_alumno = ? AND (id_reserva = ? OR id_estado_reserva = 1)', [{ oferta: 9 }, { oferta: 4 }]],
    ['FOR UPDATE OF r', [{ id_reserva: 8, id_solicitud_alumno: 40 }]],
    ['FORCE INDEX', [{ id_reserva: 11 }, { id_reserva: 12 }]],
  ]);
  const otras = await tx.confirmar(c, { idReserva: 8, idTipoContrato: 2, user: USER });
  assert.deepEqual(otras, [11, 12]);
  const orden = sqls();
  const i = (frag) => orden.findIndex((s) => s.includes(frag));
  assert.ok(i('FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ? FOR UPDATE') < i('dual_solicitud_empresa_especialidades WHERE'));
  assert.ok(i('dual_solicitud_empresa_especialidades WHERE') < i('FOR UPDATE OF r'));
  assert.deepEqual(pool.calls.find((c2) => c2.sql.includes('dual_solicitud_empresa_especialidades WHERE')).params, [[4, 9]]);
  assert.deepEqual(eventos(), [[8, 'CONFIRMAR', 'PENDIENTE', 'CONFIRMADA'], [11, 'CANCELAR', 'PENDIENTE', 'CANCELADA'], [12, 'CANCELAR', 'PENDIENTE', 'CANCELADA']]);
});

test('confirm-lock on an unknown reservation stops early', async () => {
  const c = conn();
  assert.equal(await tx.bloquearParaConfirmar(c, 99), null);
  assert.equal(pool.calls.length, 1);
});

test('reassign: origin cancelled and new attempt created, both audited; no new id means failure', async () => {
  let c = conn([
    ['SELECT id_solicitud_alumno FROM dual_reservas', [{ id_solicitud_alumno: 40 }]],
    ['SELECT er.nombre AS estado FROM dual_reservas r', [{ estado: 'CONFIRMADA' }]],
    ['CALL sp_reasignar_reserva', [[[{ id_reserva: 78 }]]]],
  ]);
  const out = await tx.reasignar(c, { idReservaOrigen: 8, idOferta: 5, motivo: 'Cambio', user: USER });
  assert.deepEqual(out, { idNueva: 78, antes: 'CONFIRMADA' });
  assert.deepEqual(eventos(), [[8, 'REASIGNAR', 'CONFIRMADA', 'CANCELADA'], [78, 'RESERVAR', null, 'PENDIENTE']]);
  c = conn([['SELECT er.nombre AS estado FROM dual_reservas r', [{ estado: 'PENDIENTE' }]]]);
  await assert.rejects(tx.reasignar(c, { idReservaOrigen: 8, idOferta: 5, motivo: 'x', user: USER }), /no devolvió/);
  assert.deepEqual(eventos(), []);
});

// ── Login ───────────────────────────────────────────────────────────────────

const ROW = { id_usuario: 7, nombre_mostrar: 'Ana', email: 'ana@centro.test', password_hash: 'h:secreta123', activo: 1, must_change_password: 0, rol: 'COORDINADOR', id_contacto: null, id_alumno: null };
let ipN = 0;
async function login(body, respuestas = [], ip = `10.1.0.${++ipN}`) {
  st = { respuestas };
  pool.calls.length = 0;
  const res = mockRes();
  res.set = function set(k, v) { this.headers[k.toLowerCase()] = v; return this; };
  await auth.loginWithCredentials(mockReq({ body, ip }), res);
  return res;
}

test('login: identifier and password required', async () => {
  assert.equal((await login({ email: ' ', password: 'x' })).statusCode, 400);
  assert.equal((await login({ username: 'a@b.c' })).statusCode, 400);
});

test('login: staff by email, companies by CIF, students by DNI — never mixed', async () => {
  let res = await login({ email: 'ana@centro.test', password: 'secreta123' }, [["r.nombre IN ('ADMINISTRADOR', 'COORDINADOR')", [ROW]]]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.rol, 'COORDINADOR');
  assert.ok(res.body.token);
  res = await login({ username: ' b12345674 ', password: 'secreta123' }, [["r.nombre = 'EMPRESA'", (s, p) => (p[0] === 'B12345674' ? [{ ...ROW, rol: 'EMPRESA', cif: 'B12345674' }] : [])]]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.cif, 'B12345674');
  res = await login({ username: '12345678z', password: 'secreta123' }, [["r.nombre = 'ALUMNO'", (s, p) => (p[0] === '12345678Z' ? [{ ...ROW, rol: 'ALUMNO', dni: '12345678Z' }] : [])]]);
  assert.equal(res.body.user.dni, '12345678Z');
  assert.equal(pool.calls.length, 3, 'tried staff, then company, then student');
});

test('login: unknown user and wrong password give the same answer; a disabled account only after the right password', async () => {
  const a = await login({ email: 'nadie@x.test', password: 'x' });
  const b = await login({ email: 'ana@centro.test', password: 'mala' }, [["r.nombre IN ('ADMINISTRADOR', 'COORDINADOR')", [ROW]]]);
  assert.deepEqual([a.statusCode, b.statusCode], [401, 401]);
  assert.equal(a.body.error, b.body.error);
  let res = await login({ email: 'ana@centro.test', password: 'mala' }, [["r.nombre IN ('ADMINISTRADOR', 'COORDINADOR')", [{ ...ROW, activo: 0 }]]]);
  assert.equal(res.statusCode, 401, 'a disabled account is not revealed to someone without the password');
  res = await login({ email: 'ana@centro.test', password: 'secreta123' }, [["r.nombre IN ('ADMINISTRADOR', 'COORDINADOR')", [{ ...ROW, activo: 0 }]]]);
  assert.equal(res.statusCode, 403);
});

test('login: repeated failures are slowed down with Retry-After', async () => {
  const ip = '10.9.8.7';
  let res;
  for (let i = 0; i < 15; i += 1) {
    res = await login({ email: 'ataque@x.test', password: 'x' }, [], ip);
    if (res.statusCode === 429) break;
  }
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, 'TOO_MANY_ATTEMPTS');
  assert.ok(Number(res.headers['retry-after']) > 0);
  loginRateLimiter.reset?.();
});

test('who am I: the user\'s own data; a deleted user is 404', async () => {
  st = { respuestas: [] };
  let res = mockRes();
  await auth.getMe(mockReq({ user: { id: 7 } }), res);
  assert.equal(res.statusCode, 404);
  st = { respuestas: [['WHERE u.id_usuario = ?', [{ ...ROW, cif: null, dni: null, must_change_password: 1 }]]] };
  res = mockRes();
  await auth.getMe(mockReq({ user: { id: 7 } }), res);
  assert.deepEqual([res.body.id, res.body.must_change_password, res.body.cif], [7, true, null]);
  assert.ok(!('password_hash' in res.body));
  res = mockRes();
  st = { respuestas: [['ORDER BY u.id_usuario', [{ id_usuario: 1 }]]] };
  await auth.getAll(mockReq({}), res);
  assert.deepEqual(res.body, [{ id_usuario: 1 }]);
  assert.doesNotMatch(pool.calls.at(-1).sql, /password_hash/);
});

async function reset(id, respuestas = []) {
  st = { respuestas };
  pool.calls.length = 0;
  const res = mockRes();
  await auth.resetPassword(mockReq({ params: { id }, user: USER }), res);
  return res;
}

test('admin password reset: a temporary password shown once, change forced; staff resets audited', async () => {
  assert.equal((await reset('x')).statusCode, 400);
  assert.equal((await reset('7')).statusCode, 404);
  let res = await reset('7', [['FOR UPDATE', [{ id_usuario: 7, activo: 1, rol: 'COORDINADOR' }]]]);
  assert.equal(res.statusCode, 200);
  const temporal = res.body.newPassword;
  assert.match(String(temporal), /^[0-9a-f]{16}$/, '16 random hex characters');
  const otra = (await reset('7', [['FOR UPDATE', [{ id_usuario: 7, activo: 1, rol: 'COORDINADOR' }]]])).body.newPassword;
  assert.notEqual(otra, temporal, 'a new one every time');
  res = await reset('7', [['FOR UPDATE', [{ id_usuario: 7, activo: 1, rol: 'COORDINADOR' }]]]);
  const upd = pool.calls.find((c) => c.sql.startsWith('UPDATE dual_usuarios'));
  assert.equal(upd.params[0], `h:${res.body.newPassword}`, 'only the hash is stored');
  assert.match(upd.sql, /must_change_password = 1/);
  assert.equal(pool.calls.find((c) => c.sql.startsWith('INSERT INTO dual_eventos')).params[2], 'RESETEAR_PASSWORD');

  res = await reset('7', [['FOR UPDATE', [{ id_usuario: 7, activo: 1, rol: 'ALUMNO' }]]]);
  assert.ok(!pool.calls.some((c) => c.sql.startsWith('INSERT INTO dual_eventos')), 'student resets are not audited');
});

test('admin password reset: missing migration 019 is a clear 503', async () => {
  const res = await reset('7', [
    ['FOR UPDATE', [{ id_usuario: 7, activo: 1, rol: 'ADMINISTRADOR' }]],
    ['INSERT INTO dual_eventos', () => { throw Object.assign(new Error('check'), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' }); }],
  ]);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'MIGRACION_PENDIENTE');
  assert.ok(pool.calls.some((c) => c.sql === 'ROLLBACK'));
});

// ── Help route and catalogues ───────────────────────────────────────────────

test('help images: only image files from the manual folder', () => {
  const { resolveManualImage } = require('../src/routes/ayudaRoute');
  assert.ok(resolveManualImage('panel.png').endsWith(require('path').join('manual', 'imagenes', 'panel.png')));
  assert.ok(resolveManualImage('foto.JPEG'));
  for (const malo of ['../../.env', '..\\..\\backend\\.env', 'x.svg', 'x.html', '', null, 'a b.png', '%2e%2e.png']) {
    const r = resolveManualImage(malo);
    assert.ok(r === null || !r.includes('..'), String(malo));
  }
  assert.equal(resolveManualImage('../../secreto.png').endsWith(require('path').join('imagenes', 'secreto.png')), true, 'any path is reduced to a name inside the folder');
});

test('public catalogues: active specialities, transports and contract types', async () => {
  const esp = load('src/services/especialidadesService');
  const tr = load('src/services/transportesService');
  st = { respuestas: [['FROM dual_especialidades', [{ id_especialidad: 2 }]], ['FROM dual_transportes', [{ id_transporte: 1 }]], ['FROM dual_tipos_contrato', [{ id_tipo_contrato: 3 }]]] };
  let res = mockRes();
  await esp.getAll(mockReq(), res);
  assert.deepEqual(res.body, [{ id_especialidad: 2 }]);
  assert.match(pool.calls.at(-1).sql, /WHERE activa = 1/);
  res = mockRes();
  await tr.getAll(mockReq(), res);
  assert.deepEqual(res.body, [{ id_transporte: 1 }]);
  res = mockRes();
  await tr.getTiposContrato(mockReq(), res);
  assert.deepEqual(res.body, [{ id_tipo_contrato: 3 }]);
});
