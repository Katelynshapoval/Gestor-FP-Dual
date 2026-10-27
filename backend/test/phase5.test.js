// Phase 5 · «Dar de baja» / «Reactivar» (bajaService) and the read-only
// documents of a cancelled reservation. No database: the pool is a fake.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let handler = () => [];
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);

const avisos = [];
const correos = [];
stub('src/services/notificaciones', {
  reservaCancelada: (id, opts) => avisos.push({ id, ...opts }),
  restablecerContrasena: (to, nombre, link) => correos.push({ to, nombre, link }),
});
stub('bcrypt', { hash: async (pw) => `h:${pw}`, compare: async (pw, h) => h === `h:${pw}` });
process.env.JWT_SECRET = 'x'.repeat(48);

const { bajaTransicion } = load('src/services/estadoReglas');

test('baja rules: needs a reason, not twice; reactivar only from BAJA', () => {
  assert.equal(bajaTransicion('VALIDADO', 'BAJA', { motivo: 'Abandona el ciclo' }), null);
  assert.equal(bajaTransicion('PENDIENTE', 'BAJA', { motivo: 'x' }), null);
  assert.equal(bajaTransicion('RECHAZADO', 'BAJA', { motivo: 'x' }), null);
  assert.equal(bajaTransicion('VALIDADO', 'BAJA', { motivo: '  ' }).code, 'MOTIVO_OBLIGATORIO');
  assert.equal(bajaTransicion('BAJA', 'BAJA', { motivo: 'x' }).code, 'YA_DE_BAJA');
  assert.equal(bajaTransicion(null, 'BAJA', { motivo: 'x' }).status, 404);
  assert.equal(bajaTransicion('BAJA', 'REACTIVAR'), null);
  assert.equal(bajaTransicion('VALIDADO', 'REACTIVAR').code, 'ESTADO_NO_PERMITE');
});

function bajaDb({ estado = 'VALIDADO', reservas = [], falla = [], sinMigracion = false } = {}) {
  return (sql, params) => {
    if (sql.includes('FOR UPDATE')) return estado ? [{ estado, owner_id: 77 }] : [];
    if (sql.startsWith('SELECT id_estado_validacion FROM dual_estados_validacion')) return sinMigracion ? [] : [{ id_estado_validacion: 4 }];
    if (sql.startsWith('UPDATE dual_usuarios')) return { affectedRows: 1 };
    if (sql.startsWith('UPDATE dual_solicitudes')) return { affectedRows: 1 };
    if (sql.includes('FROM dual_reservas r')) return reservas;
    if (sql.startsWith('INSERT INTO dual_eventos')) return { insertId: 1 };
    if (sql.startsWith('CALL sp_cancelar_reserva_admin')) {
      if (falla.includes(params[0])) throw Object.assign(new Error('fallo'), { sqlState: '45000' });
      return [];
    }
    return [];
  };
}

test('student baja: state, account off, every active reservation cancelled, companies told', async () => {
  const { darDeBaja } = load('src/services/bajaService');
  pool.calls.length = 0;
  avisos.length = 0;
  handler = bajaDb({
    reservas: [
      { id_reserva: 5, estado_reserva: 'CONFIRMADA' },
      { id_reserva: 6, estado_reserva: 'PENDIENTE' },
    ],
  });
  const out = await darDeBaja('SOLICITUD_ALUMNO', 10, { user: { id: 1, rol: 'ADMINISTRADOR' }, motivo: 'Abandona el ciclo' });
  assert.deepEqual(out, { ok: true, canceladas: [5, 6], pendientes: [] });

  const sqls = pool.calls.map((c) => c.sql);
  const commit = sqls.indexOf('COMMIT');
  assert.ok(sqls.findIndex((s) => s.includes("WHERE nombre = 'BAJA'")) < commit, 'state change inside the transaction');
  assert.ok(sqls.findIndex((s) => s.startsWith('UPDATE dual_usuarios SET activo')) < commit, 'account off inside the transaction');
  const cancels = pool.calls.filter((c) => c.sql.startsWith('CALL sp_cancelar_reserva_admin'));
  assert.deepEqual(cancels.map((c) => c.params[0]), [5, 6]);
  assert.ok(sqls.indexOf(cancels[0].sql) > commit, 'reservations cancelled after the baja commits');
  assert.match(cancels[0].params[1], /^Baja del alumno en el programa: Abandona el ciclo$/);
  // The row keeps motivo NULL (triggers); the reason is in the event.
  const update = pool.calls.find((c) => c.sql.startsWith('UPDATE dual_solicitudes_alumno'));
  assert.match(update.sql, /motivo = NULL/);
  const ev = pool.calls.find((c) => c.sql.startsWith('INSERT INTO dual_eventos') && c.params[2] === 'BAJA');
  assert.deepEqual(ev.params.slice(0, 5), ['SOLICITUD_ALUMNO', 10, 'BAJA', 'VALIDADO', 'BAJA']);
  assert.equal(ev.params[7], 'Abandona el ciclo');
  assert.deepEqual(avisos.map((a) => [a.id, a.avisarAlumno, a.avisarEmpresa]), [[5, false, true], [6, false, true]]);
});

test('company baja: students are told, a failed cancellation is reported, not fatal', async () => {
  const { darDeBaja } = load('src/services/bajaService');
  avisos.length = 0;
  handler = bajaDb({ reservas: [{ id_reserva: 8, estado_reserva: 'PENDIENTE' }, { id_reserva: 9, estado_reserva: 'PENDIENTE' }], falla: [9] });
  const out = await darDeBaja('SOLICITUD_EMPRESA', 3, { user: { id: 1 }, motivo: 'Cierra el centro de trabajo' });
  assert.deepEqual(out, { ok: true, canceladas: [8], pendientes: [9] });
  assert.deepEqual(avisos, [{ id: 8, avisarAlumno: true, avisarEmpresa: false }]);
  const cuentas = pool.calls.find((c) => c.sql.startsWith('UPDATE dual_usuarios u'));
  assert.match(cuentas.sql, /ro\.nombre = 'EMPRESA' AND d\.idempresa = \?/);
  assert.deepEqual(cuentas.params, [0, 77]);
});

test('baja refused: rolls back and touches nothing', async () => {
  const { darDeBaja } = load('src/services/bajaService');
  pool.calls.length = 0;
  handler = bajaDb({ estado: 'BAJA' });
  const out = await darDeBaja('SOLICITUD_ALUMNO', 10, { user: {}, motivo: 'x' });
  assert.equal(out.code, 'YA_DE_BAJA');
  assert.ok(pool.calls.some((c) => c.sql === 'ROLLBACK'));
  assert.ok(!pool.calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('CALL')));
});

test('reactivar restores the previous state (and the rejection reason) and the account', async () => {
  const { reactivar } = load('src/services/bajaService');
  for (const [anterior, motivoEsperado] of [['VALIDADO', null], ['RECHAZADO', 'CV ilegible']]) {
    pool.calls.length = 0;
    handler = (sql) => {
      if (sql.includes('FOR UPDATE')) return [{ estado: 'BAJA', owner_id: 77 }];
      if (sql.includes("accion = 'BAJA'")) return [{ estado_anterior: anterior }];
      if (sql.includes("accion = 'RECHAZAR'")) return [{ motivo: 'CV ilegible' }];
      if (sql.startsWith('UPDATE')) return { affectedRows: 1 };
      return [];
    };
    const out = await reactivar('SOLICITUD_ALUMNO', 10, { user: { id: 1 } });
    assert.deepEqual(out, { ok: true, estado: anterior });
    const upd = pool.calls.find((c) => c.sql.startsWith('UPDATE dual_solicitudes_alumno'));
    assert.deepEqual(upd.params, [anterior, motivoEsperado, 10]);
    const cuenta = pool.calls.find((c) => c.sql.startsWith('UPDATE dual_usuarios'));
    assert.deepEqual(cuenta.params, [1, 77]);
    assert.ok(!pool.calls.some((c) => c.sql.startsWith('CALL')), 'reservations are not restored');
  }
});

test('baja handler: message counts the cancelled reservations', async () => {
  const { handlers } = load('src/services/bajaService');
  handler = bajaDb({ reservas: [{ id_reserva: 5, estado_reserva: 'PENDIENTE' }] });
  const res = mockRes();
  await handlers('SOLICITUD_ALUMNO').baja(mockReq({ params: { id: '10' }, body: { motivo: 'x' }, user: { id: 1 } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Baja registrada. Se ha cancelado 1 reserva.');
  const bad = mockRes();
  await handlers('SOLICITUD_ALUMNO').baja(mockReq({ params: { id: 'x' } }), bad);
  assert.equal(bad.statusCode, 400);
});

test("baja without migration 016: clear error, nothing changed", async () => {
  const { darDeBaja } = load("src/services/bajaService");
  pool.calls.length = 0;
  handler = bajaDb({ sinMigracion: true });
  const out = await darDeBaja("SOLICITUD_ALUMNO", 10, { user: {}, motivo: "x" });
  assert.equal(out.code, "MIGRACION_PENDIENTE");
  assert.ok(!pool.calls.some((c) => c.sql.startsWith("UPDATE")));
});

// ── Password reset by email ─────────────────────────────────────────────────

const jwt = require("jsonwebtoken");
const USERS = {
  "b12345674": { id_usuario: 7, rol: "EMPRESA", activo: 1, id_contacto: 30, password_hash: "h:vieja", nombre_mostrar: "Empresa" },
  "baja@x.test": { id_usuario: 8, rol: "COORDINADOR", activo: 0, email: "baja@x.test", password_hash: "h:p", nombre_mostrar: "Baja" },
};
let hashActual = "h:vieja";
function resetDb(sql, params) {
  if (sql.includes("r.nombre IN ('ADMINISTRADOR', 'COORDINADOR')")) return USERS[params[0]] ? [USERS[params[0]]] : [];
  if (sql.includes("r.nombre = 'EMPRESA'")) return USERS[String(params[0]).toLowerCase()] ? [USERS[String(params[0]).toLowerCase()]] : [];
  if (sql.includes("r.nombre = 'ALUMNO'")) return [];
  if (sql.startsWith("SELECT email, nombre FROM ge_contactos")) return [{ email: "coord@empresa.test", nombre: "Coordinadora" }];
  if (sql.startsWith("SELECT password_hash, activo FROM dual_usuarios")) return [{ password_hash: hashActual, activo: 1 }];
  if (sql.startsWith("UPDATE dual_usuarios SET password_hash")) {
    if (params[2] !== hashActual) return { affectedRows: 0 };
    hashActual = params[0];
    return { affectedRows: 1 };
  }
  return [];
}

test("forgot password: same answer for every case; link only for active accounts, to the coordinator", async () => {
  const svc = load("src/services/passwordResetService");
  handler = resetDb;
  correos.length = 0;
  const pedir = async (username, ip) => {
    const res = mockRes();
    await svc.solicitar(mockReq({ body: { username }, ip }), res);
    return res;
  };
  const a = await pedir("B12345674", "1.1.1.1");
  const b = await pedir("nadie@x.test", "1.1.1.2");
  const c = await pedir("baja@x.test", "1.1.1.3");
  assert.equal(a.statusCode, 200);
  assert.equal(new Set([a.body.message, b.body.message, c.body.message]).size, 1, "identical answer");
  assert.equal(correos.length, 1);
  assert.equal(correos[0].to, "coord@empresa.test");
  assert.ok(correos[0].link.startsWith("http://localhost:3000/restablecer-contrasena?token="));
  // Rate limit: 3 requests per identifier
  await pedir("B12345674", "1.1.1.1");
  await pedir("B12345674", "1.1.1.1");
  assert.equal((await pedir("B12345674", "1.1.1.1")).statusCode, 429);
  assert.equal((await pedir("", "1.1.1.9")).statusCode, 400);
});

test("reset link: works once, needs 8 characters, cannot be forged with the session key", async () => {
  const svc = load("src/services/passwordResetService");
  handler = resetDb;
  hashActual = "h:vieja";
  const token = svc._internals.crearToken({ id_usuario: 7, password_hash: "h:vieja" });
  const usar = async (t, newPassword = "nuevaSegura1") => {
    const res = mockRes();
    await svc.restablecer(mockReq({ body: { token: t, newPassword } }), res);
    return res;
  };
  assert.equal((await usar(token, "corta")).statusCode, 400);
  const ok = await usar(token);
  assert.equal(ok.statusCode, 200);
  assert.equal(hashActual, "h:nuevaSegura1");
  const otra = await usar(token, "otraSegura22");
  assert.equal(otra.statusCode, 400, "second use refused: the password hash changed");
  assert.equal(otra.body.code, "ENLACE_NO_VALIDO");
  const forjado = jwt.sign({ sub: 7, fp: svc._internals.fingerprint(hashActual), purpose: "reset" }, process.env.JWT_SECRET);
  assert.equal((await usar(forjado)).statusCode, 400, "a token signed with the session secret is refused");
  const caducado = jwt.sign({ sub: 7, fp: svc._internals.fingerprint(hashActual), purpose: "reset" }, svc._internals.resetSecret(), { expiresIn: -10 });
  assert.equal((await usar(caducado)).statusCode, 400);
  assert.equal((await usar("basura")).statusCode, 400);
});
