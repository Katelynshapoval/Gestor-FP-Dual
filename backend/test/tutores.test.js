// Company tutors: who may list, add, edit and deactivate them (a company only
// its own; never its principal coordinator from here), required data, audit,
// and assigning a tutor to a reservation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let st = {};
const pool = fakePool((sql, params) => {
  for (const [match, out] of st.respuestas || []) {
    if (sql.includes(match)) return typeof out === 'function' ? out(sql, params) : out;
  }
  if (sql.includes('SELECT d.idempresa FROM dual_usuarios u')) return st.empresa ? [{ idempresa: st.empresa }] : [];
  if (sql.startsWith('SELECT idempresa FROM ge_empresas WHERE idempresa = ?')) return st.empresaExiste === false ? [] : [{ idempresa: params[0] }];
  if (sql.startsWith('SELECT se.id_domicilio_trabajo AS iddomicilio')) return st.domSolicitud ? [{ iddomicilio: st.domSolicitud }] : [];
  if (sql.startsWith('SELECT iddomicilio FROM ge_domicilios')) return st.domEmpresa ? [{ iddomicilio: st.domEmpresa }] : [];
  if (sql.startsWith('SELECT t.id_empresa_tutor, t.id_empresa, t.id_contacto, t.activo FROM dual_empresa_tutores t')) return st.tutor ? [st.tutor] : [];
  if (sql.startsWith('SELECT 1 AS es FROM dual_solicitudes_empresa')) return st.esCoordinador ? [{ es: 1 }] : [];
  if (sql.includes('FROM dual_empresa_tutores t JOIN ge_contactos c')) return [{ id_empresa_tutor: params[0], nombre: 'Tutor' }];
  if (sql.startsWith('INSERT')) {
    if (st.duplicado && sql.startsWith('INSERT INTO dual_empresa_tutores')) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
    return { insertId: 70 };
  }
  return [];
});
stub('src/db/pool', pool);
const svc = load('src/services/empresaTutoresService');

const EMPRESA = { id: 3, rol: 'EMPRESA' };
const ADMIN = { id: 1, rol: 'ADMINISTRADOR' };

async function llamar(fn, { user = EMPRESA, params = {}, body = {}, query = {}, ...estado } = {}) {
  st = { empresa: 100, domSolicitud: 32, ...estado };
  pool.calls.length = 0;
  const res = mockRes();
  await svc[fn](mockReq({ params, body, query, user }), res);
  return res;
}
const escrituras = () => pool.calls.filter((c) => /^(INSERT|UPDATE|DELETE)/.test(c.sql));
const hubo = (sql) => pool.calls.some((c) => c.sql === sql);
const TUTOR = { id_empresa_tutor: 5, id_empresa: 100, id_contacto: 61, activo: 1 };
const NUEVO = { nombre: ' Pepe ', email: 'P@Acme.test', telefono: '600 12 34 56' };

test('list: a company sees its own tutors; staff name the company; only active with ?activo=1', async () => {
  let res = await llamar('list');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(pool.calls.at(-1).params, [100]);
  assert.doesNotMatch(pool.calls.at(-1).sql, /t\.activo = 1/);
  res = await llamar('list', { query: { activo: '1' } });
  assert.match(pool.calls.at(-1).sql, /WHERE t\.id_empresa = \? AND t\.activo = 1/);

  assert.equal((await llamar('list', { params: { idEmpresa: '200' } })).statusCode, 403, 'another company');
  assert.equal((await llamar('list', { params: { idEmpresa: '100' } })).statusCode, 200, 'its own id explicitly');
  assert.equal((await llamar('list', { empresa: null })).statusCode, 404);
  assert.equal((await llamar('list', { params: { idEmpresa: 'x' } })).statusCode, 400);
  assert.equal((await llamar('list', { user: ADMIN })).statusCode, 400, 'staff must say which company');
  res = await llamar('list', { user: ADMIN, params: { idEmpresa: '200' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(pool.calls.at(-1).params, [200]);
  assert.equal((await llamar('list', { user: { id: 9, rol: 'ALUMNO' }, params: { idEmpresa: '100' } })).statusCode, 403);
});

test('add: name, email and phone required; linked to the work address; audited', async () => {
  for (const falta of ['nombre', 'email', 'telefono']) {
    const res = await llamar('create', { body: { ...NUEVO, [falta]: '  ' } });
    assert.equal(res.statusCode, 400, falta);
  }
  assert.equal(escrituras().length, 0);

  const res = await llamar('create', { body: NUEVO });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const w = escrituras();
  assert.deepEqual(w[0].params, [32, '', 'Pepe', 'p@acme.test', '600123456', 'TUTOR EMPRESA'], 'email in lower case, phone without spaces');
  assert.deepEqual(w[1].params, [100, 70]);
  assert.equal(w[2].params[0], 'TUTOR');
  assert.equal(w[2].params[2], 'ALTA');
  assert.ok(!JSON.stringify(w[2].params).includes('Pepe'), 'no personal data in the audit');
  assert.ok(hubo('COMMIT'));
});

test('add: the address falls back to any company address; without one, or without company, refused', async () => {
  let res = await llamar('create', { body: NUEVO, domSolicitud: null, domEmpresa: 33 });
  assert.equal(res.statusCode, 201);
  assert.equal(escrituras()[0].params[0], 33);
  res = await llamar('create', { body: NUEVO, domSolicitud: null, domEmpresa: null });
  assert.equal(res.statusCode, 400);
  assert.ok(hubo('ROLLBACK'));
  res = await llamar('create', { user: ADMIN, params: { idEmpresa: '999' }, body: NUEVO, empresaExiste: false });
  assert.equal(res.statusCode, 404);
  res = await llamar('create', { body: NUEVO, duplicado: true });
  assert.equal(res.statusCode, 409);
  assert.ok(hubo('ROLLBACK') && !hubo('COMMIT'));
});

test('edit: only sent fields; required ones cannot be emptied; the DNI can be cleared', async () => {
  let res = await llamar('update', { params: { id: '5' }, tutor: TUTOR, body: { email: 'n@acme.test', cargo: 'Jefe' } });
  assert.equal(res.statusCode, 200);
  const upd = escrituras().find((c) => c.sql.startsWith('UPDATE ge_contactos'));
  assert.equal(upd.sql, 'UPDATE ge_contactos SET email = ?, cargo = ? WHERE idcontacto = ?');
  assert.deepEqual(upd.params, ['n@acme.test', 'Jefe', 61]);
  const ev = escrituras().find((c) => c.sql.startsWith('INSERT INTO dual_eventos'));
  assert.deepEqual(JSON.parse(ev.params.at(-1)).campos, ['email', 'cargo']);

  res = await llamar('update', { params: { id: '5' }, tutor: TUTOR, body: { dni: '' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(escrituras()[0].params, ['', 61]);

  for (const body of [{}, { nombre: '' }, { email: ' ', cargo: 'x' }, { nombre: 'Ok', telefono: '' }]) {
    res = await llamar('update', { params: { id: '5' }, tutor: TUTOR, body });
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  assert.equal((await llamar('update', { params: { id: 'x' } })).statusCode, 400);
  assert.equal((await llamar('update', { params: { id: '5' }, tutor: null, body: { cargo: 'x' } })).statusCode, 404);
});

test('edit and deactivate: never another company\'s tutor, never the principal coordinator from here', async () => {
  for (const fn of ['update', 'deactivate']) {
    let res = await llamar(fn, { params: { id: '5' }, tutor: { ...TUTOR, id_empresa: 200 }, body: { cargo: 'x' } });
    assert.equal(res.statusCode, 403, fn);
    res = await llamar(fn, { params: { id: '5' }, tutor: TUTOR, esCoordinador: true, body: { cargo: 'x' } });
    assert.equal(res.statusCode, 403, fn);
    assert.equal(res.body.code, 'COORDINADOR_PRINCIPAL');
    res = await llamar(fn, { user: ADMIN, params: { id: '5' }, tutor: TUTOR, esCoordinador: true, body: { cargo: 'x' } });
    assert.equal(res.statusCode, 200, `${fn}: staff may`);
  }
});

test('deactivate: marks inactive and audits; an inactive tutor is left as is', async () => {
  let res = await llamar('deactivate', { params: { id: '5' }, tutor: TUTOR });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(escrituras()[0].params, [5]);
  assert.equal(escrituras()[1].params[2], 'DESACTIVAR');
  res = await llamar('deactivate', { params: { id: '5' }, tutor: { ...TUTOR, activo: 0 } });
  assert.equal(res.statusCode, 200);
  assert.equal(escrituras().length, 0);
  assert.equal((await llamar('deactivate', { params: { id: '5' }, tutor: null })).statusCode, 404);
  assert.equal((await llamar('deactivate', { params: { id: '0' } })).statusCode, 400);
});

const RESERVA = { id_reserva: 8, id_empresa_tutor: null, id_empresa: 100, estado_reserva: 'PENDIENTE' };
const asignar = (body, extra = {}) => llamar('assignToReserva', {
  params: { id: '8' }, body,
  respuestas: [
    ['FOR UPDATE OF r', extra.reserva === undefined ? [RESERVA] : extra.reserva ? [extra.reserva] : []],
    ['WHERE t.id_empresa_tutor = ? FOR UPDATE', extra.tutor === undefined ? [{ id_empresa_tutor: 5, id_empresa: 100, activo: 1 }] : extra.tutor ? [extra.tutor] : []],
    ['LEFT JOIN ge_contactos c', [{ id_reserva: 8, id_empresa_tutor: 5 }]],
  ],
  ...extra,
});

test('assign tutor: input checks', async () => {
  assert.equal((await asignar({}, { params: { id: 'x' } })).statusCode, 400);
  assert.equal((await asignar({})).statusCode, 400, 'id_empresa_tutor must be sent');
  assert.equal((await asignar({ id_empresa_tutor: 'abc' })).statusCode, 400);
});

test('assign tutor: an active tutor of the same company, on a live reservation of the caller', async () => {
  let res = await asignar({ id_empresa_tutor: 5 });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(escrituras()[0].params, [5, 8]);
  assert.equal(escrituras()[1].params[2], 'TUTOR', 'the change is audited');

  const casos = [
    [{ reserva: null }, 404],
    [{ reserva: { ...RESERVA, id_empresa: 200 } }, 403],
    [{ reserva: { ...RESERVA, estado_reserva: 'CANCELADA' } }, 400],
    [{ tutor: null }, 404],
    [{ tutor: { id_empresa_tutor: 5, id_empresa: 200, activo: 1 } }, 400],
    [{ tutor: { id_empresa_tutor: 5, id_empresa: 100, activo: 0 } }, 400],
    [{ user: { id: 9, rol: 'ALUMNO' } }, 403],
  ];
  for (const [extra, status] of casos) {
    res = await asignar({ id_empresa_tutor: 5 }, extra);
    assert.equal(res.statusCode, status, JSON.stringify(extra));
    assert.equal(escrituras().length, 0);
  }
});

test('assign tutor: null clears it; re-assigning the same tutor writes no event', async () => {
  let res = await asignar({ id_empresa_tutor: null }, { reserva: { ...RESERVA, id_empresa_tutor: 5 } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(escrituras()[0].params, [null, 8]);
  res = await asignar({ id_empresa_tutor: '' }, { user: ADMIN });
  assert.equal(res.statusCode, 200);
  assert.equal(escrituras().length, 1, 'no change, no event');
  res = await asignar({ id_empresa_tutor: 5 }, { reserva: { ...RESERVA, id_empresa_tutor: 5 } });
  assert.equal(escrituras().length, 1);
});

test('add and edit: a mistyped email, phone or DNI is refused with a clear message', async () => {
  const casos = [
    [{ ...NUEVO, email: 'pepe@acme' }, /email/],
    [{ ...NUEVO, telefono: '600 12' }, /teléfono/],
    [{ ...NUEVO, dni: '12345678A' }, /DNI/],
  ];
  for (const [body, msg] of casos) {
    const res = await llamar('create', { body });
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.match(res.body.error, msg);
  }
  const res = await llamar('update', { params: { id: '5' }, tutor: TUTOR, body: { email: 'sin-arroba' } });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /email/);
});
