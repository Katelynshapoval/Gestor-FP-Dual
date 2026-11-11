// Student applications: the public form (checks, new student, returning
// student, no overwriting someone else's data), the staff list and decisions,
// and the student's own application.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, fakeBcrypt, mockReq, mockRes } = require('./helpers/harness');

let st = {};
const pool = fakePool((sql, params) => {
  for (const [match, out] of st.respuestas || []) {
    if (sql.includes(match)) return typeof out === 'function' ? out(sql, params) : out;
  }
  if (sql.startsWith('SELECT id_convocatoria, nombre, fecha_inicio, fecha_fin FROM dual_convocatorias WHERE activa = 1')) {
    return st.convocatoria ? [st.convocatoria] : [];
  }
  if (sql.startsWith('SELECT codigo FROM dual_especialidades')) return st.especialidad ? [{ codigo: 'JOY' }] : [];
  if (sql.startsWith('SELECT idalumno FROM gf_alumnosfct WHERE dni = ?')) return st.alumnoExiste ? [{ idalumno: 42 }] : [];
  if (sql.startsWith('SELECT id_solicitud_alumno FROM dual_solicitudes_alumno WHERE id_alumno = ?')) return st.duplicada ? [{ id_solicitud_alumno: 1 }] : [];
  if (sql.startsWith('SELECT id_usuario, password_hash, activo FROM dual_usuarios')) return st.cuenta ? [st.cuenta] : [];
  if (sql.startsWith('SELECT id_tipo_documento FROM dual_tipos_documento')) return [{ id_tipo_documento: params[0] === 'CV' ? 1 : 6 }];
  if (sql.startsWith('SELECT id_rol FROM dual_roles')) return [{ id_rol: 4 }];
  if (sql.startsWith('SELECT id_usuario FROM dual_usuarios WHERE id_alumno = ?')) return st.cuenta ? [{ id_usuario: 7 }] : [];
  if (sql.includes('SELECT u.id_alumno FROM dual_usuarios u')) return st.alumno ? [{ id_alumno: st.alumno }] : [];
  if (sql.startsWith('INSERT')) return { insertId: ++st.ids, affectedRows: 1 };
  return [];
});
stub('src/db/pool', pool);
stub('bcrypt', fakeBcrypt);
const avisos = [];
stub('src/services/notificaciones', new Proxy({}, { get: (_t, n) => (...a) => { avisos.push([n, ...a]); } }));
const transiciones = [];
stub('src/services/solicitudTransiciones', {
  aplicarTransicion: async (...a) => { transiciones.push(a); return st.transicion || { ok: true }; },
});
const workflowReal = require('../src/services/documentosWorkflow');
stub('src/services/documentosWorkflow', {
  ...workflowReal,
  missingStudentValidation: async () => st.pendientes || [],
  attachSolicitudDocumentos: async (rows) => rows.map((r) => ({ ...r, documentos: ['…'] })),
  reservaDocSummary: async (rows) => Object.fromEntries(rows.map((r) => [r.id_reserva, { anexo: 'PENDIENTE' }])),
});
const { loginRateLimiter } = require('../src/middleware/loginRateLimit');

const svc = load('src/services/solicitudesAlumnoService');

const pdf = { buffer: Buffer.from('%PDF-1.4') };
const FORM = {
  nombre: 'Ana Ruiz', dni: ' 12345678z ', domicilio: 'C/ Sol 2', cp: '50002', localidad: 'Zaragoza',
  telalumno: '600000000', email: 'ana@example.test', id_especialidad_dual: 2, password: 'secreta123',
  carnetDeConducir: true, tieneCoche: false,
};

let ip = 0;
async function enviar(body, { files = { cv: [pdf], anexoDga: [pdf] }, ...estado } = {}) {
  st = { convocatoria: { id_convocatoria: 5, nombre: '2026/2027' }, especialidad: true, ids: 100, ...estado };
  avisos.length = 0;
  pool.calls.length = 0;
  const res = mockRes();
  res.set = function set(k, v) { this.headers[k.toLowerCase()] = v; return this; };
  await svc.create(mockReq({ body, files, ip: `10.0.0.${++ip}` }), res);
  return res;
}
const escrituras = () => pool.calls.filter((c) => /^(INSERT|UPDATE|DELETE|CALL)/.test(c.sql));
const hubo = (sql) => pool.calls.some((c) => c.sql === sql);

test('form: both PDFs, every required field, an 8-character password and a real DNI/NIE', async () => {
  const casos = [
    [FORM, { files: { cv: [pdf] } }, /CV y el Anexo DGA/],
    [FORM, { files: {} }, /CV y el Anexo DGA/],
    [FORM, { files: { anexoDga: [pdf] } }, /CV y el Anexo DGA/],
    [{ ...FORM, telalumno: '' }, {}, /obligatorios/],
    [{ ...FORM, id_especialidad_dual: undefined }, {}, /obligatorios/],
    [{ ...FORM, password: '1234567' }, {}, /8 caracteres/],
    [{ ...FORM, dni: '   ' }, {}, /obligatorios/],
    [{ ...FORM, dni: '12345678A' }, {}, /DNI\/NIE/],
  ];
  for (const [body, opts, msg] of casos) {
    const res = await enviar(body, opts);
    assert.equal(res.statusCode, 400, msg.source);
    assert.match(res.body.error, msg);
    assert.equal(pool.calls.length, 0);
  }
});

test('form: closed outside a convocatoria; the ciclo must exist', async () => {
  let res = await enviar(FORM, { convocatoria: null });
  assert.equal(res.statusCode, 409);
  res = await enviar(FORM, { especialidad: false });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /especialidad/);
  assert.equal(escrituras().length, 0);
});

test('form: a new student gets a record, the application, both documents and an account', async () => {
  const res = await enviar(FORM);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(res.body.cuenta_existente, false);
  const w = escrituras();
  const alumno = w.find((c) => c.sql.startsWith('INSERT INTO gf_alumnosfct'));
  assert.equal(alumno.params[1], '12345678Z', 'DNI stored normalised');
  assert.equal(alumno.params[8], 'JOY');
  assert.deepEqual(alumno.params.slice(15, 17), [1, 0], 'licence and car as 1/0');
  const sol = w.find((c) => c.sql.startsWith('INSERT INTO dual_solicitudes_alumno'));
  assert.deepEqual(sol.params, [101, 5, 2]);
  const docs = w.filter((c) => c.sql.startsWith('CALL sp_guardar_documento'));
  assert.deepEqual(docs.map((c) => c.params.slice(0, 2)), [[102, 1], [102, 6]]);
  assert.ok(w.some((c) => c.sql.includes("SET d.estado_workflow = 'SUBIDO_FIRMADO'")), 'the Anexo DGA arrives signed');
  const user = w.find((c) => c.sql.startsWith('INSERT INTO dual_usuarios'));
  assert.equal(user.params[1], 'h:secreta123');
  assert.deepEqual(w.at(-1).params, [103, 102], 'documents credited to the new account');
  assert.ok(hubo('COMMIT'));
  assert.deepEqual(avisos, [['solicitudAlumnoRecibida', 'ana@example.test', 'Ana Ruiz', '2026/2027']]);
});

test('form: a returning student with the right password updates their data and keeps the account', async () => {
  const res = await enviar({ ...FORM, nombre: 'Ana Ruiz Gil' }, { alumnoExiste: true, cuenta: { id_usuario: 7, password_hash: 'h:secreta123', activo: 1 } });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(res.body.cuenta_existente, true);
  const upd = escrituras().find((c) => c.sql.startsWith('UPDATE gf_alumnosfct'));
  assert.equal(upd.params[0], 'Ana Ruiz Gil');
  assert.equal(upd.params.at(-1), 42);
  assert.ok(!escrituras().some((c) => c.sql.startsWith('INSERT INTO dual_usuarios')), 'never a second account');
  assert.ok(!escrituras().some((c) => c.sql.startsWith('INSERT INTO gf_alumnosfct')));
});

test('form: a wrong password, a record without account or a disabled account change nothing', async () => {
  const casos = [
    [{ cuenta: { id_usuario: 7, password_hash: 'h:otra', activo: 1 } }, 401, 'IDENTIDAD_NO_VERIFICADA'],
    [{ cuenta: null }, 401, 'IDENTIDAD_NO_VERIFICADA'],
    [{ cuenta: { id_usuario: 7, password_hash: 'h:secreta123', activo: 0 } }, 403, undefined],
  ];
  for (const [estado, status, code] of casos) {
    const res = await enviar(FORM, { alumnoExiste: true, ...estado });
    assert.equal(res.statusCode, status, JSON.stringify(estado));
    assert.equal(res.body.code, code);
    assert.equal(escrituras().length, 0);
    assert.ok(hubo('ROLLBACK'));
  }
  // The same answer whether the DNI has an account or only a record (SEC-009).
  const a = await enviar(FORM, { alumnoExiste: true, cuenta: null });
  const b = await enviar(FORM, { alumnoExiste: true, cuenta: { id_usuario: 7, password_hash: 'h:x', activo: 1 } });
  assert.equal(a.body.error, b.body.error);
});

test('form: a second application in the same convocatoria is refused', async () => {
  const res = await enviar(FORM, { alumnoExiste: true, duplicada: true, cuenta: { id_usuario: 7, password_hash: 'h:secreta123', activo: 1 } });
  assert.equal(res.statusCode, 409);
  assert.equal(escrituras().length, 0, 'checked before anything is written');
});

test('form: repeated wrong passwords from one place are slowed down (429)', async () => {
  const cuenta = { id_usuario: 7, password_hash: 'h:secreta123', activo: 1 };
  const fijo = '10.9.9.9';
  const una = async () => {
    st = { convocatoria: { id_convocatoria: 5, nombre: 'x' }, especialidad: true, ids: 1, alumnoExiste: true, cuenta };
    const res = mockRes();
    res.set = function set(k, v) { this.headers[k.toLowerCase()] = v; return this; };
    await svc.create(mockReq({ body: { ...FORM, password: 'mala-clave' }, files: { cv: [pdf], anexoDga: [pdf] }, ip: fijo }), res);
    return res;
  };
  let ultima;
  for (let i = 0; i < 12; i += 1) {
    ultima = await una();
    if (ultima.statusCode === 429) break;
  }
  assert.equal(ultima.statusCode, 429);
  assert.equal(ultima.body.code, 'TOO_MANY_ATTEMPTS');
  assert.ok(Number(ultima.headers['retry-after']) > 0);
  loginRateLimiter.reset?.();
});

// ── Staff ───────────────────────────────────────────────────────────────────

async function llamar(fn, { user = { id: 1, rol: 'ADMINISTRADOR' }, params = {}, body = {}, query = {}, ...estado } = {}) {
  st = { ids: 0, ...estado };
  transiciones.length = 0;
  pool.calls.length = 0;
  const res = mockRes();
  await svc[fn](mockReq({ params, body, query, user }), res);
  return res;
}

test('staff list: filters, documents per application, and reservations with include=full', async () => {
  const filas = [{ id_solicitud_alumno: 40, nombre: 'Ana' }, { id_solicitud_alumno: 50, nombre: 'Luis' }];
  let res = await llamar('getAll', { query: { estado: 'pendiente', convocatoria: '5' }, respuestas: [['ORDER BY a.nombre ASC', filas]] });
  assert.deepEqual(pool.calls[0].params, ['PENDIENTE', '5']);
  assert.equal(res.body.length, 2);
  assert.ok(res.body.every((r) => r.documentos), 'documents attached');
  assert.equal(pool.calls.length, 1, 'no reservations without include=full');

  res = await llamar('getAll', {
    query: { include: 'full' },
    respuestas: [
      ['ORDER BY a.nombre ASC', filas],
      ['WHERE r.id_solicitud_alumno IN (?)', [{ id_reserva: 8, id_solicitud_alumno: 40 }, { id_reserva: 9, id_solicitud_alumno: 40 }]],
    ],
  });
  assert.deepEqual(res.body[0].reservas.map((r) => [r.id_reserva, r.documentos_resumen.anexo]), [[8, 'PENDIENTE'], [9, 'PENDIENTE']]);
  assert.deepEqual(res.body[1].reservas, []);

  res = await llamar('getAll', { query: { include: 'full' } });
  assert.deepEqual(res.body, []);
});

test('staff: detail and documents of one application', async () => {
  assert.equal((await llamar('getById', { params: { id: '40' } })).statusCode, 404);
  const res = await llamar('getById', { params: { id: '40' }, respuestas: [['WHERE sa.id_solicitud_alumno = ?', [{ id_solicitud_alumno: 40, nombre: 'Ana' }]]] });
  assert.equal(res.body.nombre, 'Ana');
  const docs = await llamar('getDocumentos', { params: { id: '40' }, respuestas: [['WHERE d.id_solicitud_alumno = ?', [{ id_documento: 1, tipo_documento: 'CV' }]]] });
  assert.deepEqual(docs.body, [{ id_documento: 1, tipo_documento: 'CV' }]);
  assert.deepEqual(pool.calls.at(-1).params, [40]);
});

test('staff: a student is validated only after their required documents are', async () => {
  let res = await llamar('validar', { params: { id: '40' }, pendientes: ['CV', 'Anexo DGA'] });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /CV, Anexo DGA/);
  assert.equal(transiciones.length, 0);
  res = await llamar('validar', { params: { id: '40' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(transiciones[0].slice(0, 3), ['SOLICITUD_ALUMNO', 40, 'VALIDAR']);
  res = await llamar('validar', { params: { id: '40' }, transicion: { ok: false, status: 409, error: 'Ya validada', code: 'ESTADO' } });
  assert.equal(res.statusCode, 409);
  assert.equal((await llamar('validar', { params: { id: 'x' } })).statusCode, 400);
});

test('staff: rejecting needs a reason; reopening does not', async () => {
  assert.equal((await llamar('rechazar', { params: { id: '40' }, body: {} })).statusCode, 400);
  assert.equal((await llamar('rechazar', { params: { id: 'x' }, body: { motivo: 'm' } })).statusCode, 400);
  let res = await llamar('rechazar', { params: { id: '40' }, body: { motivo: ' Falta DNI ' } });
  assert.equal(res.statusCode, 200);
  assert.equal(transiciones[0][3].motivo, 'Falta DNI');
  res = await llamar('reabrir', { params: { id: '40' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(transiciones[0].slice(0, 3), ['SOLICITUD_ALUMNO', 40, 'REABRIR']);
  assert.equal((await llamar('reabrir', { params: { id: '0' } })).statusCode, 400);
});

test('student: their own latest application only', async () => {
  const ALUMNO = { id: 4, rol: 'ALUMNO' };
  assert.equal((await llamar('getMia', { user: ALUMNO })).statusCode, 404);
  let res = await llamar('getMia', { user: ALUMNO, alumno: 7 });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'SIN_SOLICITUD');
  res = await llamar('getMia', { user: ALUMNO, alumno: 7, respuestas: [['WHERE sa.id_alumno = ?', [{ id_solicitud_alumno: 40 }]]] });
  assert.equal(res.body.id_solicitud_alumno, 40);
  assert.deepEqual(pool.calls.at(-1).params, [7]);
});
