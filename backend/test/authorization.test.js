// Phase 1 · SEC-3, SEC-4, SEC-5, SEC-6
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, fakeBcrypt, mockReq, mockRes } = require('./helpers/harness');

let handler = () => [];
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);
stub('bcrypt', fakeBcrypt);
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-0123456789';

const pdf = { buffer: Buffer.from('%PDF-1.4') };

// ── SEC-3 ───────────────────────────────────────────────────────────────
function studentDb({ cuenta }) {
  pool.calls.length = 0;
  handler = (sql) => {
    if (sql.startsWith('SELECT id_convocatoria, nombre, fecha_inicio, fecha_fin FROM dual_convocatorias WHERE activa = 1')) {
      return [{ id_convocatoria: 5, nombre: '2026-2027' }];
    }
    if (sql.startsWith('SELECT codigo FROM dual_especialidades')) return [{ codigo: 'DAM' }];
    if (sql.startsWith('SELECT idalumno FROM gf_alumnosfct')) return [{ idalumno: 42 }];
    if (sql.startsWith('SELECT id_solicitud_alumno FROM dual_solicitudes_alumno')) return [];
    if (sql.startsWith('SELECT id_usuario, password_hash, activo FROM dual_usuarios')) return cuenta ? [cuenta] : [];
    if (sql.startsWith('INSERT INTO dual_solicitudes_alumno')) return { insertId: 900 };
    if (sql.startsWith('SELECT id_tipo_documento FROM dual_tipos_documento')) return [{ id_tipo_documento: 1 }];
    if (sql.startsWith('SELECT id_rol FROM dual_roles')) return [{ id_rol: 4 }];
    if (sql.startsWith('SELECT id_usuario FROM dual_usuarios WHERE id_alumno')) return cuenta ? [{ id_usuario: 7 }] : [];
    if (sql.startsWith('INSERT INTO dual_usuarios')) return { insertId: 8 };
    return [];
  };
}

const studentBody = (password) => ({
  nombre: 'Atacante', dni: '12345678z', domicilio: 'C/ Falsa 1', cp: '50001', localidad: 'Zaragoza',
  telalumno: '600000000', email: 'otro@example.com', id_especialidad_dual: 3, password,
});
const studentReq = (password) => mockReq({ body: studentBody(password), files: { cv: [pdf], anexoDga: [pdf] } });
const updates = () => pool.calls.filter((c) => c.sql.startsWith('UPDATE gf_alumnosfct'));

test('SEC-3: existing DNI with account + wrong password → 401, nothing written', async () => {
  const { loginRateLimiter } = require('../src/middleware/loginRateLimit');
  loginRateLimiter.reset();
  const svc = load('src/services/solicitudesAlumnoService');
  studentDb({ cuenta: { id_usuario: 7, password_hash: 'h:propia123', activo: 1 } });
  const res = mockRes();
  await svc.create(studentReq('adivinada1'), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'IDENTIDAD_NO_VERIFICADA');
  assert.equal(updates().length, 0);
  assert.ok(pool.calls.some((c) => c.sql === 'ROLLBACK'));
  assert.ok(!pool.calls.some((c) => c.sql.startsWith('INSERT INTO dual_solicitudes_alumno')));
});

test('SEC-3: repeated wrong passwords on the public form hit the login limiter', async () => {
  const { loginRateLimiter } = require('../src/middleware/loginRateLimit');
  loginRateLimiter.reset();
  const svc = load('src/services/solicitudesAlumnoService');
  studentDb({ cuenta: { id_usuario: 7, password_hash: 'h:propia123', activo: 1 } });
  for (let i = 0; i < 5; i++) await svc.create(studentReq(`mala${i}xxxx`), mockRes());
  const res = mockRes();
  await svc.create(studentReq('propia123'), res);
  assert.equal(res.statusCode, 429);
  loginRateLimiter.reset();
});

test('SEC-3: existing DNI with account + correct password → full update, cuenta_existente', async () => {
  const svc = load('src/services/solicitudesAlumnoService');
  studentDb({ cuenta: { id_usuario: 7, password_hash: 'h:propia123', activo: 1 } });
  const res = mockRes();
  await svc.create(studentReq('propia123'), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.cuenta_existente, true);
  assert.equal(updates().length, 1);
  assert.ok(!updates()[0].sql.includes('COALESCE'));
  assert.ok(!pool.calls.some((c) => c.sql.startsWith('INSERT INTO dual_usuarios')));
});

test('SEC-001: existing DNI without account → 401 with the same answer, nothing written, no account', async () => {
  const { loginRateLimiter } = require('../src/middleware/loginRateLimit');
  loginRateLimiter.reset();
  const svc = load('src/services/solicitudesAlumnoService');
  studentDb({ cuenta: null });
  const res = mockRes();
  await svc.create(studentReq('nueva1234'), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'IDENTIDAD_NO_VERIFICADA');
  assert.equal(updates().length, 0);
  assert.ok(!pool.calls.some((c) => c.sql.startsWith('INSERT INTO dual_usuarios')));
  assert.ok(!pool.calls.some((c) => c.sql.startsWith('INSERT INTO dual_solicitudes_alumno')));
  assert.ok(pool.calls.some((c) => c.sql === 'ROLLBACK'));
  loginRateLimiter.reset();
});

test('SEC-001: the public student form rejects an invalid DNI/NIE', async () => {
  const svc = load('src/services/solicitudesAlumnoService');
  studentDb({ cuenta: null });
  const res = mockRes();
  await svc.create(mockReq({ body: { ...studentBody('nueva1234'), dni: '12345678A' }, files: { cv: [pdf], anexoDga: [pdf] } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(pool.calls.length, 0);
});

// ── SEC-4 ───────────────────────────────────────────────────────────────
function tutorDb({ esCoordinador }) {
  pool.calls.length = 0;
  handler = (sql) => {
    if (sql.startsWith('SELECT t.id_empresa_tutor, t.id_empresa, t.id_contacto, t.activo')) {
      return [{ id_empresa_tutor: 1, id_empresa: 7, id_contacto: 70, activo: 1 }];
    }
    if (sql.startsWith('SELECT d.idempresa FROM dual_usuarios')) return [{ idempresa: 7 }];
    if (sql.startsWith('SELECT 1 AS es FROM dual_solicitudes_empresa')) return esCoordinador ? [{ es: 1 }] : [];
    if (sql.includes('FROM dual_empresa_tutores t JOIN ge_contactos c')) return [{ id_empresa_tutor: 1, es_coordinador: esCoordinador ? 1 : 0 }];
    return { affectedRows: 1 };
  };
}

test('SEC-4: a company cannot edit or deactivate its principal coordinator via Tutores', async () => {
  const svc = load('src/services/empresaTutoresService');
  tutorDb({ esCoordinador: true });
  let res = mockRes();
  await svc.update(mockReq({ user: { id: 1, rol: 'EMPRESA' }, params: { id: '1' }, body: { email: 'nuevo@x.es' } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'COORDINADOR_PRINCIPAL');
  assert.ok(!pool.calls.some((c) => c.sql.startsWith('UPDATE ge_contactos')));

  tutorDb({ esCoordinador: true });
  res = mockRes();
  await svc.deactivate(mockReq({ user: { id: 1, rol: 'EMPRESA' }, params: { id: '1' } }), res);
  assert.equal(res.statusCode, 403);
  assert.ok(!pool.calls.some((c) => c.sql.startsWith('UPDATE dual_empresa_tutores')));
});

test('SEC-4: other tutors stay editable by the company; staff may still edit the coordinator', async () => {
  const svc = load('src/services/empresaTutoresService');
  tutorDb({ esCoordinador: false });
  let res = mockRes();
  await svc.update(mockReq({ user: { id: 1, rol: 'EMPRESA' }, params: { id: '1' }, body: { email: 'nuevo@x.es' } }), res);
  assert.equal(res.statusCode, 200);

  tutorDb({ esCoordinador: true });
  res = mockRes();
  await svc.update(mockReq({ user: { id: 2, rol: 'COORDINADOR' }, params: { id: '1' }, body: { email: 'nuevo@x.es' } }), res);
  assert.equal(res.statusCode, 200);
});

// ── SEC-5 ───────────────────────────────────────────────────────────────
function docDb({ empresaReserva = 7, tipoContrato = 'Contrato', estadoReserva = 'PENDIENTE', estadoDoc = null, empresaSolicitud = 7 } = {}) {
  pool.calls.length = 0;
  handler = (sql) => {
    if (sql.startsWith('SELECT d.idempresa FROM dual_usuarios')) return [{ idempresa: 7 }];
    if (sql.startsWith('SELECT tc.nombre AS tipo_contrato FROM dual_reservas')) return [{ tipo_contrato: tipoContrato }];
    if (sql.startsWith('SELECT se.id_empresa, tc.nombre AS tipo_contrato, er.nombre AS estado_reserva')) {
      return [{ id_empresa: empresaReserva, tipo_contrato: tipoContrato, estado_reserva: estadoReserva }];
    }
    if (sql.startsWith('SELECT id_empresa FROM dual_solicitudes_empresa')) return [{ id_empresa: empresaSolicitud }];
    if (sql.startsWith('SELECT ev.nombre AS estado FROM dual_documentos')) return estadoDoc ? [{ estado: estadoDoc }] : [];
    return [];
  };
}
const saved = () => pool.calls.some((c) => c.sql.includes('sp_guardar_documento'));

test('SEC-5: a company cannot replace a validated annex through /documentos/reserva/:id/anexo', async () => {
  const svc = load('src/services/documentosService');
  docDb({ estadoDoc: 'VALIDADO' });
  const res = mockRes();
  await svc.uploadReserva(mockReq({ user: { id: 1, rol: 'EMPRESA' }, params: { idReserva: '3' }, file: pdf }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /validado/);
  assert.equal(saved(), false);
});

test('SEC-5: a company cannot replace a validated convenio, nor upload to another company', async () => {
  const svc = load('src/services/documentosService');
  docDb({ estadoDoc: 'VALIDADO' });
  let res = mockRes();
  await svc.uploadEmpresa(mockReq({ user: { id: 1, rol: 'EMPRESA' }, params: { idSolicitud: '9' }, file: pdf }), res);
  assert.equal(res.statusCode, 400);

  docDb({ empresaSolicitud: 8 });
  res = mockRes();
  await svc.uploadEmpresa(mockReq({ user: { id: 1, rol: 'EMPRESA' }, params: { idSolicitud: '9' }, file: pdf }), res);
  assert.equal(res.statusCode, 403);
});

test('SEC-5: the catalogue decides who uploads (staff review annexes, they do not upload them)', async () => {
  const svc = load('src/services/documentosService');
  docDb();
  const res = mockRes();
  await svc.uploadReserva(mockReq({ user: { id: 2, rol: 'COORDINADOR' }, params: { idReserva: '3' }, file: pdf }), res);
  assert.equal(res.statusCode, 403);
});

test('SEC-5: /documentos/subir rejects the annex of the other contract family and cancelled reservations', async () => {
  const svc = load('src/services/documentosService');
  docDb({ tipoContrato: 'Beca' });
  let res = mockRes();
  await svc.uploadContexto(mockReq({ user: { id: 1, rol: 'EMPRESA' }, body: { clave: 'ANEXO_II', id_reserva: '3' }, file: pdf }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Anexo III/);

  docDb({ estadoReserva: 'CANCELADA' });
  res = mockRes();
  await svc.uploadContexto(mockReq({ user: { id: 1, rol: 'EMPRESA' }, body: { clave: 'ANEXO_II', id_reserva: '3' }, file: pdf }), res);
  assert.equal(res.statusCode, 400);
});

test('SEC-5: guard allows a company to upload its pending annex', async () => {
  const svc = load('src/services/documentosService');
  docDb();
  const denied = await svc.assertCanUpload(
    mockReq({ user: { id: 1, rol: 'EMPRESA' } }),
    require('../src/services/documentCatalogue').defByClave('ANEXO_II'),
    { idReserva: 3 },
  );
  assert.equal(denied, null);
});

// ── SEC-6 ───────────────────────────────────────────────────────────────
test('SEC-6: POST /documentos/plantillas is ADMINISTRADOR-only', async () => {
  const router = load('src/routes/documentosRoute');
  const layer = router.stack.find((l) => l.route?.path === '/documentos/plantillas' && l.route.methods.post);
  assert.ok(layer, 'route exists');
  const roleGuard = layer.route.stack[1].handle; // [requireAuth, requireRole, multer, handler]
  for (const [rol, expected] of [['COORDINADOR', 403], ['ADMINISTRADOR', 'next']]) {
    const res = mockRes();
    let nextCalled = false;
    roleGuard(mockReq({ user: { rol } }), res, () => { nextCalled = true; });
    assert.equal(nextCalled ? 'next' : res.statusCode, expected);
  }
});
