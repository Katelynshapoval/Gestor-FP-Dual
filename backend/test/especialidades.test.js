// Ciclos (Configuración › Ciclos): the public list shows only active ones; an
// administrator lists all with their use, adds, renames and switches them on
// or off. Code and shift change only while nothing uses the ciclo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let st = {};
const pool = fakePool((sql, params) => {
  for (const [match, out] of st.respuestas || []) {
    if (sql.includes(match)) return typeof out === 'function' ? out(sql, params) : out;
  }
  if (sql.startsWith('INSERT')) return { insertId: 9 };
  if (sql.startsWith('UPDATE')) return { affectedRows: 1 };
  return [];
});
stub('src/db/pool', pool);
const svc = load('src/services/especialidadesService');

const ADMIN = { id: 1, rol: 'ADMINISTRADOR' };
const fila = (extra) => ({
  id_especialidad: 4, codigo: 'DAM', nombre: 'Desarrollo de Aplicaciones Multiplataforma', turno: 0, activa: 1,
  solicitudes: 0, ofertas: 0, alumnos: 0, ...extra,
});

async function llamar(fn, { params = {}, body = {}, respuestas = [] } = {}) {
  st = { respuestas };
  pool.calls.length = 0;
  const res = mockRes();
  await svc[fn](mockReq({ params, body, user: ADMIN }), res);
  return res;
}
const escritura = (prefijo) => pool.calls.find((c) => c.sql.startsWith(prefijo));

test('the public list asks only for active ciclos', async () => {
  await llamar('getAll');
  assert.match(pool.calls[0].sql, /WHERE activa = 1/);
});

test('the administrator list has every ciclo with its shift name and use', async () => {
  const res = await llamar('listAdmin', {
    respuestas: [['FROM dual_especialidades e', [fila({ solicitudes: 3, ofertas: '1' }), fila({ id_especialidad: 5, turno: 1, activa: 0 })]]],
  });
  assert.doesNotMatch(pool.calls[0].sql, /FROM dual_especialidades e WHERE/, 'inactive ones included');
  assert.deepEqual(res.body.ciclos.map((c) => [c.id_especialidad, c.turno_nombre, c.activa, c.en_uso, c.solicitudes, c.ofertas]), [
    [4, 'DIURNO', true, true, 3, 1],
    [5, 'VESPERTINO', false, false, 0, 0],
  ]);
});

test('create: validates in Spanish, normalises the code and starts active', async () => {
  for (const [body, code] of [
    [{ nombre: 'Algo largo', turno: 0 }, 'CODIGO_OBLIGATORIO'],
    [{ codigo: 'X'.repeat(21), nombre: 'Algo largo', turno: 0 }, 'CODIGO_LARGO'],
    [{ codigo: 'D;AM', nombre: 'Algo largo', turno: 0 }, 'CODIGO_NO_VALIDO'],
    [{ codigo: 'DAM', nombre: ' x ', turno: 0 }, 'NOMBRE_OBLIGATORIO'],
    [{ codigo: 'DAM', nombre: 'Algo largo', turno: 2 }, 'TURNO_NO_VALIDO'],
    [{ codigo: 'DAM', nombre: 'Algo largo', turno: '' }, 'TURNO_NO_VALIDO'],
  ]) {
    const res = await llamar('create', { body });
    assert.deepEqual([res.statusCode, res.body.code], [400, code], JSON.stringify(body));
    assert.equal(escritura('INSERT'), undefined);
  }
  const res = await llamar('create', { body: { codigo: ' dam ', nombre: '  Desarrollo   de Aplicaciones ', turno: '1' } });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(escritura('INSERT INTO dual_especialidades').params, ['DAM', 'Desarrollo de Aplicaciones', 1]);
  assert.match(escritura('INSERT INTO dual_especialidades').sql, /VALUES \(\?, \?, \?, 1\)/);
});

test('create: the same code and shift twice is a clear 409', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const res = await llamar('create', {
      body: { codigo: 'DAM', nombre: 'Otro nombre', turno: 0 },
      respuestas: [['INSERT INTO dual_especialidades', () => {
        throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry 'DAM-0' for key 'dual_especialidades.uq_dual_especialidades_codigo_turno'" });
      }]],
    });
    assert.deepEqual([res.statusCode, res.body.code, res.body.error], [409, 'CICLO_DUPLICADO', 'Ya existe un ciclo con ese código en ese turno.']);
  } finally {
    console.error = original;
  }
});

test('edit: name and on/off always; code and shift only while unused', async () => {
  const enUso = [['WHERE e.id_especialidad = ?', [fila({ ofertas: 2 })]]];
  let res = await llamar('update', { params: { id: '4' }, body: { nombre: 'Nombre nuevo', activa: false }, respuestas: enUso });
  assert.equal(res.statusCode, 200);
  const upd = escritura('UPDATE dual_especialidades');
  assert.match(upd.sql, /SET nombre = \?, activa = \? WHERE id_especialidad = \?/);
  assert.deepEqual(upd.params, ['Nombre nuevo', 0, 4]);
  assert.match(pool.calls.find((c) => c.sql.includes('WHERE e.id_especialidad = ?')).sql, /FOR UPDATE/);

  res = await llamar('update', { params: { id: '4' }, body: { turno: 1 }, respuestas: enUso });
  assert.deepEqual([res.statusCode, res.body.code], [409, 'CICLO_EN_USO']);
  assert.equal(escritura('UPDATE dual_especialidades'), undefined);

  // Same code and shift as now is not a change, even when in use.
  res = await llamar('update', { params: { id: '4' }, body: { codigo: 'dam', turno: 0 }, respuestas: enUso });
  assert.equal(res.statusCode, 200);

  res = await llamar('update', { params: { id: '4' }, body: { codigo: 'DAM-B', turno: 1 }, respuestas: [['WHERE e.id_especialidad = ?', [fila()]]] });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(escritura('UPDATE dual_especialidades').params, ['DAM-B', 1, 4]);
});

test('edit: unknown id, bad id, nothing to save and a non-boolean switch are refused', async () => {
  assert.equal((await llamar('update', { params: { id: '99' }, body: { nombre: 'Algo largo' } })).statusCode, 404);
  assert.equal((await llamar('update', { params: { id: 'x' }, body: { nombre: 'Algo largo' } })).statusCode, 400);
  assert.equal((await llamar('update', { params: { id: '4' }, body: {} })).body.code, 'SIN_CAMBIOS');
  assert.equal((await llamar('update', { params: { id: '4' }, body: { activa: 'no' } })).body.code, 'ACTIVA_NO_VALIDA');
});
