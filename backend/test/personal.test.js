// Staff accounts: only Administración, never the last active administrator,
// and every change is an audit event that does not store the email or password.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stub, load, fakePool, fakeBcrypt, mockReq, mockRes } = require('./helpers/harness');

function fresh() {
  return {
    nextId: 3,
    failDup: false,
    users: [
      { id_usuario: 1, nombre_mostrar: 'Ana Admin', email: 'ana@centro.test', activo: 1, must_change_password: 0, rol: 'ADMINISTRADOR' },
      { id_usuario: 2, nombre_mostrar: 'Luis Coord', email: 'luis@centro.test', activo: 1, must_change_password: 0, rol: 'COORDINADOR' },
      { id_usuario: 9, nombre_mostrar: 'Alumno', email: null, activo: 1, must_change_password: 0, rol: 'ALUMNO' },
    ],
    roles: { ADMINISTRADOR: 1, COORDINADOR: 2, ALUMNO: 4 },
    events: [],
  };
}

let db = fresh();

const pool = fakePool((sql, params) => {
  if (sql.includes("IN ('ADMINISTRADOR', 'COORDINADOR')")) {
    return db.users.filter((u) => u.rol === 'ADMINISTRADOR' || u.rol === 'COORDINADOR');
  }
  if (sql.startsWith('SELECT id_rol FROM dual_roles')) {
    const id = db.roles[params[0]];
    return id ? [{ id_rol: id }] : [];
  }
  if (sql.startsWith('SELECT id_usuario FROM dual_usuarios WHERE email')) {
    const found = db.users.find((u) => u.email === params[0] && u.id_usuario !== params[1]);
    return found ? [{ id_usuario: found.id_usuario }] : [];
  }
  if (sql.includes("r.nombre = 'ADMINISTRADOR'") && sql.includes('FOR UPDATE')) {
    return db.users
      .filter((u) => u.rol === 'ADMINISTRADOR' && u.activo === 1)
      .sort((a, b) => a.id_usuario - b.id_usuario)
      .map((u) => ({ id_usuario: u.id_usuario }));
  }
  if (sql.startsWith('SELECT u.id_usuario, u.nombre_mostrar') && sql.includes('WHERE u.id_usuario = ?')) {
    const user = db.users.find((u) => u.id_usuario === params[0]);
    return user ? [user] : [];
  }
  if (sql.startsWith('SELECT u.id_usuario, u.activo, r.nombre AS rol')) {
    const user = db.users.find((u) => u.id_usuario === params[0]);
    return user ? [{ id_usuario: user.id_usuario, activo: user.activo, rol: user.rol }] : [];
  }
  if (sql.startsWith('INSERT INTO dual_usuarios')) {
    if (db.failDup) {
      const err = new Error('Duplicate entry');
      err.code = 'ER_DUP_ENTRY';
      throw err;
    }
    const id = db.nextId++;
    const rol = Object.entries(db.roles).find(([, rolId]) => rolId === params[3])[0];
    db.users.push({
      id_usuario: id,
      nombre_mostrar: params[0],
      email: params[1],
      activo: 1,
      must_change_password: 1,
      rol,
    });
    return { insertId: id };
  }
  if (sql.startsWith('UPDATE dual_usuarios SET nombre_mostrar')) {
    const user = db.users.find((u) => u.id_usuario === params[3]);
    user.nombre_mostrar = params[0];
    user.email = params[1];
    user.rol = Object.entries(db.roles).find(([, rolId]) => rolId === params[2])[0];
    return { affectedRows: 1 };
  }
  if (sql.startsWith('UPDATE dual_usuarios SET activo')) {
    const user = db.users.find((u) => u.id_usuario === params[1]);
    user.activo = params[0];
    return { affectedRows: 1 };
  }
  if (sql.startsWith('UPDATE dual_usuarios SET password_hash')) {
    const user = db.users.find((u) => u.id_usuario === params[1]);
    user.must_change_password = 1;
    user.password_hash = params[0];
    return { affectedRows: 1 };
  }
  if (sql.startsWith('INSERT INTO dual_eventos')) {
    db.events.push(params);
    return { insertId: db.events.length };
  }
  throw new Error(`SQL inesperado: ${sql}`);
});

stub('src/db/pool', pool);
stub('bcrypt', fakeBcrypt);

const personal = load('src/services/personalService');
const auth = load('src/services/authService');
const { requireRole } = load('src/middleware/auth');

const admin = { id: 1, rol: 'ADMINISTRADOR' };
const coordActor = { id: 2, rol: 'COORDINADOR' };

function setup() {
  db = fresh();
  pool.calls.length = 0;
}

function eventText() {
  return JSON.stringify(db.events);
}

test('alta creates a staff account with a one-time password and an audit event', async () => {
  setup();
  const res = mockRes();
  await personal.create(mockReq({
    user: admin,
    body: { nombre: '  Nueva Coord ', email: 'Nueva@Centro.Test', rol: 'coordinador' },
  }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.usuario.email, 'nueva@centro.test');
  assert.equal(res.body.usuario.nombre_mostrar, 'Nueva Coord');
  assert.equal(res.body.usuario.rol, 'COORDINADOR');
  assert.equal(res.body.usuario.must_change_password, true);
  assert.equal(res.body.newPassword.length, 16);
  assert.equal(db.events.length, 1);
  assert.deepEqual(db.events[0].slice(0, 5), ['USUARIO', res.body.usuario.id_usuario, 'ALTA', null, 'COORDINADOR']);
  assert.equal(eventText().includes('nueva@centro.test'), false);
  assert.equal(eventText().includes(res.body.newPassword), false);
  const insert = pool.calls.find((c) => c.sql.startsWith('INSERT INTO dual_usuarios'));
  assert.equal(insert.params[4], undefined);
  assert.match(insert.sql, /NULL, NULL, 1, 1/);
});

test('duplicate email and a role outside staff are rejected', async () => {
  setup();
  const dup = mockRes();
  await personal.create(mockReq({
    user: admin,
    body: { nombre: 'Otra', email: 'ANA@centro.test', rol: 'ADMINISTRADOR' },
  }), dup);
  assert.equal(dup.statusCode, 409);
  assert.equal(dup.body.code, 'EMAIL_DUPLICADO');
  assert.equal(db.events.length, 0);

  const rol = mockRes();
  await personal.create(mockReq({
    user: admin,
    body: { nombre: 'Empresa', email: 'nueva@centro.test', rol: 'EMPRESA' },
  }), rol);
  assert.equal(rol.statusCode, 400);
  assert.equal(rol.body.code, 'ROL_INVALIDO');

  const email = mockRes();
  await personal.create(mockReq({
    user: admin,
    body: { nombre: 'Mala', email: 'no-es-email', rol: 'COORDINADOR' },
  }), email);
  assert.equal(email.statusCode, 400);
  assert.equal(email.body.code, 'EMAIL_INVALIDO');
});

test('a duplicate that wins the race does not leave an audit event', async () => {
  setup();
  db.failDup = true;
  const res = mockRes();
  await personal.create(mockReq({
    user: admin,
    body: { nombre: 'Carrera', email: 'carrera@centro.test', rol: 'COORDINADOR' },
  }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'EMAIL_DUPLICADO');
  assert.equal(db.events.length, 0);
  assert.equal(db.users.some((u) => u.email === 'carrera@centro.test'), false);
});

test('you cannot deactivate yourself or remove the last active administrator', async () => {
  setup();
  const self = mockRes();
  await personal.baja(mockReq({ user: admin, params: { id: '1' } }), self);
  assert.equal(self.statusCode, 400);
  assert.equal(self.body.code, 'BAJA_PROPIA');
  assert.equal(db.users[0].activo, 1);

  const last = mockRes();
  await personal.baja(mockReq({ user: coordActor, params: { id: '1' } }), last);
  assert.equal(last.statusCode, 400);
  assert.equal(last.body.code, 'ULTIMO_ADMINISTRADOR');

  const ownRole = mockRes();
  await personal.update(mockReq({
    user: admin,
    params: { id: '1' },
    body: { rol: 'COORDINADOR' },
  }), ownRole);
  assert.equal(ownRole.statusCode, 400);
  assert.equal(ownRole.body.code, 'ROL_PROPIO');

  const demote = mockRes();
  await personal.update(mockReq({
    user: coordActor,
    params: { id: '1' },
    body: { rol: 'COORDINADOR' },
  }), demote);
  assert.equal(demote.statusCode, 400);
  assert.equal(demote.body.code, 'ULTIMO_ADMINISTRADOR');
  assert.equal(db.events.length, 0);
});

test('a second administrator can deactivate and reactivate, and a student id is not staff', async () => {
  setup();
  db.users.push({
    id_usuario: 4, nombre_mostrar: 'Otro Admin', email: 'otro@centro.test', activo: 1, must_change_password: 0, rol: 'ADMINISTRADOR',
  });
  const baja = mockRes();
  await personal.baja(mockReq({ user: { id: 4, rol: 'ADMINISTRADOR' }, params: { id: '1' } }), baja);
  assert.equal(baja.statusCode, 200);
  assert.equal(baja.body.activo, false);
  assert.equal(db.events[0][2], 'BAJA');
  assert.equal(db.events[0][4], 'INACTIVO');

  const again = mockRes();
  await personal.baja(mockReq({ user: { id: 4, rol: 'ADMINISTRADOR' }, params: { id: '1' } }), again);
  assert.equal(again.statusCode, 400);
  assert.equal(again.body.code, 'YA_INACTIVO');

  const back = mockRes();
  await personal.reactivar(mockReq({ user: { id: 4, rol: 'ADMINISTRADOR' }, params: { id: '1' } }), back);
  assert.equal(back.statusCode, 200);
  assert.equal(back.body.activo, true);
  assert.equal(db.events[1][2], 'REACTIVAR');

  const student = mockRes();
  await personal.baja(mockReq({ user: admin, params: { id: '9' } }), student);
  assert.equal(student.statusCode, 404);
  assert.equal(student.body.code, 'NOT_FOUND');
});

test('editing name or role records the change without the email address', async () => {
  setup();
  db.users.push({
    id_usuario: 4, nombre_mostrar: 'Otro Admin', email: 'otro@centro.test', activo: 1, must_change_password: 0, rol: 'ADMINISTRADOR',
  });
  const res = mockRes();
  await personal.update(mockReq({
    user: { id: 4, rol: 'ADMINISTRADOR' },
    params: { id: '2' },
    body: { nombre: 'Luis Nuevo', email: 'luis.nuevo@centro.test', rol: 'ADMINISTRADOR' },
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.rol, 'ADMINISTRADOR');
  assert.equal(db.events[0][2], 'CAMBIAR_ROL');
  assert.equal(eventText().includes('luis.nuevo@centro.test'), false);
  const detalle = JSON.parse(db.events[0][8]);
  assert.equal(detalle.email, true);
  assert.equal(detalle.nombre, true);
  assert.equal(detalle.activo, 1);
});

test('resetting a staff password is audited and a student reset is not', async () => {
  setup();
  const staffRes = mockRes();
  await auth.resetPassword(mockReq({ user: admin, params: { id: '2' } }), staffRes);
  assert.equal(staffRes.statusCode, 200);
  assert.equal(staffRes.body.newPassword.length, 16);
  assert.equal(db.events.length, 1);
  assert.equal(db.events[0][2], 'RESETEAR_PASSWORD');
  assert.equal(eventText().includes(staffRes.body.newPassword), false);
  assert.equal(eventText().includes('luis@centro.test'), false);

  const studentRes = mockRes();
  await auth.resetPassword(mockReq({ user: admin, params: { id: '9' } }), studentRes);
  assert.equal(studentRes.statusCode, 200);
  assert.equal(db.events.length, 1);
});

test('the list is only staff and a coordinator is forbidden', async () => {
  setup();
  const res = mockRes();
  await personal.list(mockReq({ user: admin }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.map((u) => u.id_usuario).sort(), [1, 2]);

  const denied = mockRes();
  let next = false;
  requireRole('ADMINISTRADOR')(mockReq({ user: coordActor }), denied, () => { next = true; });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.code, 'FORBIDDEN');
  assert.equal(next, false);

  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'authRoute.js'), 'utf8');
  for (const line of [
    "router.get('/usuarios/personal', requireAuth, requireRole('ADMINISTRADOR')",
    "router.post('/usuarios/personal', requireAuth, requireRole('ADMINISTRADOR')",
    "router.patch('/usuarios/personal/:id', requireAuth, requireRole('ADMINISTRADOR')",
    "router.post('/usuarios/personal/:id/baja', requireAuth, requireRole('ADMINISTRADOR')",
    "router.post('/usuarios/personal/:id/reactivar', requireAuth, requireRole('ADMINISTRADOR')",
  ]) {
    assert.ok(src.includes(line), line);
  }
});
