// A company only reaches its own application (detail, ciclos, documents, data,
// change requests, places). Staff reach all of them. Also the input checks and
// SEC-002: once validated, a company cannot add ciclos by itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let empresaDelUsuario = 100;
let solicitudes = {};
const pool = fakePool((sql) => {
  if (sql.includes('SELECT d.idempresa FROM dual_usuarios u')) {
    return empresaDelUsuario ? [{ idempresa: empresaDelUsuario }] : [];
  }
  return [];
});
stub('src/db/pool', pool);
stub('src/mail/config', { transporter: { mode: 'log', sendMail: async () => ({}) } });
// Loaded after the pool stub, so its helpers use the fake pool too.
const empresaDatosReal = require('../src/services/empresaDatos');
stub('src/services/empresaDatos', {
  ...empresaDatosReal,
  loadEmpresaDatosRead: async (_conn, id) => (solicitudes[id] ? { ...solicitudes[id] } : null),
});

const svc = load('src/services/solicitudesEmpresaService');

const solicitud = (extra = {}) => ({
  id_solicitud_empresa: 10, id_empresa: 100, empresa: 'ACME', convocatoria_activa: true,
  estado_validacion: 'PENDIENTE', transportes: [], ...extra,
});

const EMPRESA = { id: 3, rol: 'EMPRESA' };
const ADMIN = { id: 1, rol: 'ADMINISTRADOR' };

async function llamar(fn, { user = EMPRESA, id = '10', body = {}, params = {} } = {}) {
  const res = mockRes();
  await svc[fn](mockReq({ params: { id, idOferta: '5', ...params }, body, user }), res);
  return res;
}

const HANDLERS = [
  ['getById'],
  ['getEspecialidades'],
  ['getDocumentos'],
  ['getDatos'],
  ['getCambio'],
  ['upsertCambio', { web: 'https://x.test' }],
  ['addEspecialidad', { id_especialidad: 2, cantidad: 1 }],
  ['updateCupoEspecialidad', { cantidad: 1 }],
];

test('another company\'s application is 403 on every company endpoint', async () => {
  solicitudes = { 10: solicitud({ id_empresa: 200 }) };
  empresaDelUsuario = 100;
  for (const [fn, body] of HANDLERS) {
    const res = await llamar(fn, { body });
    assert.equal(res.statusCode, 403, fn);
  }
});

test('a user linked to no company is 403 too', async () => {
  solicitudes = { 10: solicitud() };
  empresaDelUsuario = null;
  for (const [fn, body] of HANDLERS) {
    assert.equal((await llamar(fn, { body })).statusCode, 403, fn);
  }
  empresaDelUsuario = 100;
});

test('a missing application is 404', async () => {
  solicitudes = {};
  for (const [fn, body] of HANDLERS) {
    assert.equal((await llamar(fn, { body })).statusCode, 404, fn);
  }
});

test('the company reads its own application; staff read any', async () => {
  solicitudes = { 10: solicitud() };
  let res = await llamar('getById');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.empresa, 'ACME');
  assert.deepEqual(res.body.especialidades, []);
  res = await llamar('getDatos');
  assert.equal(res.statusCode, 200);

  solicitudes = { 10: solicitud({ id_empresa: 200 }) };
  for (const fn of ['getById', 'getDatos']) {
    assert.equal((await llamar(fn, { user: ADMIN })).statusCode, 200, fn);
  }
  assert.ok(!pool.calls.some((c) => c.sql.includes('SELECT d.idempresa') && c.params[0] === ADMIN.id), 'staff are never checked against a company');
});

test('SEC-002: a validated application cannot get new ciclos from the company, only from staff', async () => {
  solicitudes = { 10: solicitud({ estado_validacion: 'VALIDADO' }) };
  const res = await llamar('addEspecialidad', { body: { id_especialidad: 2, cantidad: 1 } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'REQUIERE_CENTRO');
  const staff = await llamar('addEspecialidad', { user: ADMIN, body: { id_especialidad: 2, cantidad: 1 } });
  assert.notEqual(staff.body?.code, 'REQUIERE_CENTRO');
});

test('ciclos and places: ids and amounts are checked before anything else', async () => {
  solicitudes = { 10: solicitud() };
  pool.calls.length = 0;
  const casos = [
    ['addEspecialidad', { id_especialidad: 'x', cantidad: 1 }, /Identificador/],
    ['addEspecialidad', { id_especialidad: 2, cantidad: 0 }, /al menos un alumno/],
    ['addEspecialidad', { id_especialidad: 2, cantidad: 1.5 }, /al menos un alumno/],
    ['addEspecialidad', { id_especialidad: 2, cantidad: 21 }, /Como máximo/],
    ['updateCupoEspecialidad', { cantidad: -1 }, /mayor o igual que 0/],
    ['updateCupoEspecialidad', { cantidad: 'diez' }, /mayor o igual que 0/],
    ['updateCupoEspecialidad', { cantidad: 21 }, /Como máximo/],
  ];
  for (const [fn, body, msg] of casos) {
    const res = await llamar(fn, { body });
    assert.equal(res.statusCode, 400, `${fn} ${JSON.stringify(body)}`);
    assert.match(res.body.error, msg);
  }
  assert.equal((await llamar('updateCupoEspecialidad', { body: { cantidad: 1 }, params: { idOferta: 'x' } })).statusCode, 400);
  assert.equal(pool.calls.length, 0, 'nothing reaches the database');
});

test('changes only on the active convocatoria; the company can never ask to change its CIF', async () => {
  solicitudes = { 10: solicitud({ convocatoria_activa: false }) };
  for (const [fn, body] of [['upsertCambio', { web: 'x' }], ['addEspecialidad', { id_especialidad: 2, cantidad: 1 }], ['updateCupoEspecialidad', { cantidad: 1 }]]) {
    const res = await llamar(fn, { body });
    assert.equal(res.statusCode, 400, fn);
    assert.match(res.body.error, /convocatoria activa/);
  }
  solicitudes = { 10: solicitud() };
  const res = await llamar('upsertCambio', { body: { cif: 'B12345674' } });
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /CIF/);
});
