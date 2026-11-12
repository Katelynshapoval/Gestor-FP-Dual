// Input hardening after the second security review: the database driver never
// expands objects into SQL, and the public forms and the login only accept
// text where text is expected.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { stub, load, fakePool, fakeBcrypt, mockReq, mockRes } = require('./helpers/harness');

let handler = () => [];
let ids = 0;
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);
stub('bcrypt', fakeBcrypt);
stub('src/services/notificaciones', new Proxy({}, { get: () => async () => {} }));
stub('src/services/documentGenerationService', { generateDocument: async () => ({ ok: false }) });
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-0123456789';

const { revisarTextos, campoNoEscalar } = require('../src/helpers/formInput');

// ── Database driver ─────────────────────────────────────────────────────
test('the real pool binds an object as a string, never as `key` = value', async () => {
  // Required by its .js path, so the harness stub of src/db/pool does not apply.
  const realPool = require(path.join(__dirname, '..', 'src', 'db', 'pool.js'));
  try {
    const sql = realPool.pool.format('SELECT 1 FROM t WHERE email = ?', [{ email: 1 }]);
    assert.equal(sql, "SELECT 1 FROM t WHERE email = '[object Object]'");
  } finally {
    await realPool.end();
  }
});

// ── Helper ──────────────────────────────────────────────────────────────
test('formInput: arrays and objects are rejected, scalars pass', () => {
  assert.equal(campoNoEscalar({ a: 'x', b: 2, c: true, d: null }, ['a', 'b', 'c', 'd', 'e']), null);
  assert.equal(campoNoEscalar({ a: ['x'] }, ['a']), 'a');
  assert.equal(campoNoEscalar({ a: { x: 1 } }, ['a']), 'a');
});

test('formInput: length and email format', () => {
  const reglas = { nombre: { label: 'Nombre', max: 5 }, correo: { label: 'Email', email: true } };
  assert.equal(revisarTextos({ nombre: 'Ana', correo: 'a@b.es' }, reglas), null);
  assert.equal(revisarTextos({ nombre: 'Ana', correo: '' }, reglas), null);
  assert.match(revisarTextos({ nombre: 'Demasiado' }, reglas), /máximo 5/);
  assert.match(revisarTextos({ correo: 'no-es-email' }, reglas), /email válido/);
  assert.match(revisarTextos({ nombre: { $gt: '' } }, reglas), /no es válido/);
});

// ── Login ───────────────────────────────────────────────────────────────
test('login: a non-text identifier or password is a 400, not a 500', async () => {
  const svc = load('src/services/authService');
  pool.calls.length = 0;
  for (const body of [{ username: { a: 1 }, password: 'x' }, { username: 'a@b.es', password: { a: 1 } }, { username: ['a'], password: 'x' }]) {
    const res = mockRes();
    await svc.loginWithCredentials(mockReq({ body }), res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(pool.calls.length, 0);
});

// ── Public student form ─────────────────────────────────────────────────
const pdf = { buffer: Buffer.from('%PDF-1.4') };

function alumnoDb() {
  pool.calls.length = 0;
  ids = 0;
  handler = (sql) => {
    if (sql.startsWith('SELECT id_convocatoria, nombre, fecha_inicio, fecha_fin FROM dual_convocatorias WHERE activa = 1')) {
      return [{ id_convocatoria: 5, nombre: '2026-2027' }];
    }
    if (sql.startsWith('SELECT codigo FROM dual_especialidades')) return [{ codigo: 'DAM' }];
    if (sql.startsWith('SELECT id_tipo_documento FROM dual_tipos_documento')) return [{ id_tipo_documento: 1 }];
    if (sql.startsWith('SELECT id_rol FROM dual_roles')) return [{ id_rol: 4 }];
    if (sql.startsWith('INSERT')) return { insertId: ++ids, affectedRows: 1 };
    return [];
  };
}

const alumnoBody = (extra = {}) => ({
  nombre: 'Lucía Pérez', dni: '12345678Z', domicilio: 'C/ Mayor 1', cp: '50001', localidad: 'Zaragoza',
  telalumno: '600000000', email: 'Lucia@Example.com', id_especialidad_dual: '3', password: 'secreta123',
  carnetDeConducir: '0', tieneCoche: '1', ...extra,
});
const altaAlumno = async (body) => {
  const svc = load('src/services/solicitudesAlumnoService');
  alumnoDb();
  const res = mockRes();
  await svc.create(mockReq({ body, files: { cv: [pdf], anexoDga: [pdf] } }), res);
  return res;
};
const insertAlumno = () => pool.calls.find((c) => c.sql.startsWith('INSERT INTO gf_alumnosfct'));

test('student form: a field sent as an object is refused before any query', async () => {
  const res = await altaAlumno(alumnoBody({ id_especialidad_dual: { id_especialidad: 1 } }));
  assert.equal(res.statusCode, 400);
  assert.equal(pool.calls.length, 0);
});

test('student form: a malformed email is refused, so no mail goes to it', async () => {
  const res = await altaAlumno(alumnoBody({ email: 'no es un email' }));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'DATOS_NO_VALIDOS');
  assert.ok(!insertAlumno());
});

test('student form: values are normalised; "0" for the driving licence is stored as 0', async () => {
  const res = await altaAlumno(alumnoBody());
  assert.equal(res.statusCode, 201);
  const params = insertAlumno().params;
  assert.equal(params[7], 'lucia@example.com'); // email
  assert.equal(params[9], 3); // id_especialidad_dual as a number
  assert.equal(params[15], 0); // carnetDeConducir
  assert.equal(params[16], 1); // tieneCoche
});

// ── Public company form ─────────────────────────────────────────────────
const empresaBody = (extra = {}) => ({
  cif: 'B12345674', empresa: 'ACME S.L.', domicilioLegal: 'C/ Mayor 1', cpLegal: '50001', provinciaLegal: 'Zaragoza',
  localidadLegal: 'Zaragoza', mismoLugarTrabajo: true,
  dniRepresentante: '12345678Z', nombreRepresentante: 'Ana', emailRepresentante: 'a@acme.test', telefonoRepresentante: '600000000',
  dniCoordinador: '87654321X', nombreCoordinador: 'Luis', emailCoordinador: 'l@acme.test', telefonoCoordinador: '600000001',
  descripcion_puesto: 'Taller', especialidades: [{ idEspecialidad: 2, cantidadAlumnos: 3 }],
  transportes: [1], passwordCoordinador: 'secreta123', ...extra,
});
const altaEmpresa = async (body) => {
  const svc = load('src/services/solicitudesEmpresaService');
  alumnoDb();
  const res = mockRes();
  await svc.create(mockReq({ body }), res);
  return res;
};

for (const [nombre, extra] of [
  ['an object in a text field', { empresa: { empresa: 'x' } }],
  ['an array in a text field', { nombreCoordinador: ['a', 'b'] }],
  ['a malformed coordinator email', { emailCoordinador: 'sin-arroba' }],
  ['a too-long company name', { empresa: 'x'.repeat(101) }],
  ['transportes that are not a list', { transportes: 'todos' }],
  ['a ciclo that is not an object', { especialidades: [7] }],
]) {
  test(`company form: ${nombre} → 400, nothing written`, async () => {
    const res = await altaEmpresa(empresaBody(extra));
    assert.equal(res.statusCode, 400);
    assert.ok(!pool.calls.some((c) => /^(INSERT|UPDATE|DELETE)/.test(c.sql)));
  });
}

test('company form: the valid application still goes through', async () => {
  const res = await altaEmpresa(empresaBody());
  assert.equal(res.statusCode, 201);
});
