// Remaining edge cases the other test files did not reach: the SMTP mail
// modes (redirect, missing transport), password reset destinations and the
// production APP_URL rule, and reactivating a rejected application with no
// RECHAZAR event left. No database, no real email.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let handler = () => [];
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);
process.env.JWT_SECRET = 'y'.repeat(48);

const correos = [];
stub('src/services/notificaciones', {
  restablecerContrasena: (to, nombre, link) => correos.push({ to, nombre, link }),
  reservaCancelada: () => {},
});
let usuario = null;
stub('src/services/authService', { findUserByIdentifier: async () => usuario });

// ── mail/config in smtp mode ────────────────────────────────────────────

function loadMailConfig(envPedido, createTransport) {
  // Empty, not deleted: dotenv never overrides a variable that exists, so a
  // developer's backend/.env cannot leak into these tests.
  const env = { SMTP_HOST: '', SMTP_PORT: '', SMTP_SECURE: '', MAIL_FROM: '', MAILPIT_HOST: '', MAILPIT_PORT: '', EMAIL_USER: '', EMAIL_PASS: '', MAIL_REDIRECT_TO: '', ...envPedido };
  const file = require.resolve(path.join(__dirname, '..', 'src', 'mail', 'config.js'));
  const saved = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    process.env[k] = env[k];
  }
  stub('nodemailer', { createTransport });
  delete require.cache[file];
  const realLog = console.log;
  console.log = () => {};
  try {
    return require(file);
  } finally {
    console.log = realLog;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    delete require.cache[file];
  }
}

test('mail smtp: MAIL_REDIRECT_TO delivers every email to that one address, tagging the real recipient', async () => {
  const enviados = [];
  const cfg = loadMailConfig(
    { MAIL_MODE: 'smtp', MAIL_REDIRECT_TO: ' pruebas@centro.test ' },
    () => ({ sendMail: async (m) => { enviados.push(m); return { ok: true }; } }),
  );
  assert.equal(cfg.MAIL_MODE, 'smtp');
  assert.equal(cfg.MAIL_REDIRECT_TO, 'pruebas@centro.test');
  await cfg.transporter.sendMail({ to: 'ana.lopez@alumno.test', subject: 'Hola', html: '<p>x</p>' });
  assert.equal(enviados[0].to, 'pruebas@centro.test');
  assert.equal(enviados[0].subject, '[para a***@alumno.test] Hola');
  assert.equal(enviados[0].html, '<p>x</p>');
});

test('mail smtp without redirect sends to the real recipient', async () => {
  const enviados = [];
  const cfg = loadMailConfig(
    { MAIL_MODE: 'SMTP', MAIL_REDIRECT_TO: '' },
    () => ({ sendMail: async (m) => { enviados.push(m); return {}; } }),
  );
  await cfg.transporter.sendMail({ to: ['a@x.test', 'b@x.test'], subject: 'S' });
  assert.deepEqual(enviados[0].to, ['a@x.test', 'b@x.test']);
  assert.equal(enviados[0].subject, 'S');
});

test('mail smtp: if the transport cannot be created, sending fails with a clear message', async () => {
  const realLog = console.log;
  const cfg = loadMailConfig({ MAIL_MODE: 'smtp', MAIL_REDIRECT_TO: '' }, () => { throw new Error('bad config'); });
  console.log = realLog;
  await assert.rejects(cfg.transporter.sendMail({ to: 'a@x.test', subject: 'S' }), /El correo no está configurado/);
});

test('mail mailpit: local catcher on localhost:1025 by default, no login, a default sender', async () => {
  const creados = [];
  const enviados = [];
  const cfg = loadMailConfig({ MAIL_MODE: 'Mailpit', MAIL_REDIRECT_TO: 'x@x.test' }, (o) => {
    creados.push(o);
    return { sendMail: async (m) => { enviados.push(m); return {}; } };
  });
  assert.equal(cfg.MAIL_MODE, 'mailpit');
  assert.equal(cfg.transporter.entrega, true);
  assert.deepEqual(creados[0], { host: 'localhost', port: 1025, secure: false, ignoreTLS: true });
  assert.equal(cfg.MAIL_REDIRECT_TO, '', 'the redirect only applies to smtp');
  await cfg.transporter.sendMail({ to: 'ana@x.test', subject: 'Hola' });
  assert.equal(enviados[0].to, 'ana@x.test');
  assert.equal(enviados[0].from, '"Salesianos Dual" <fpdual@localhost>');
});

test('mail mailpit inside docker-compose: host and port from MAILPIT_HOST / MAILPIT_PORT', () => {
  const creados = [];
  loadMailConfig({ MAIL_MODE: 'mailpit', MAILPIT_HOST: 'mailpit', MAILPIT_PORT: '2025' }, (o) => { creados.push(o); return {}; });
  assert.equal(creados[0].host, 'mailpit');
  assert.equal(creados[0].port, 2025);
});

test('mail smtp with SMTP_HOST: any server, STARTTLS on 587 or TLS on 465, login only when given', () => {
  const creados = [];
  const crear = (o) => { creados.push(o); return {}; };
  loadMailConfig({ MAIL_MODE: 'smtp', SMTP_HOST: 'smtp.centro.es' }, crear);
  assert.deepEqual(creados[0], { host: 'smtp.centro.es', port: 587, secure: false, auth: undefined });
  loadMailConfig({ MAIL_MODE: 'smtp', SMTP_HOST: 'smtp.centro.es', SMTP_SECURE: 'true', EMAIL_USER: 'u@centro.es', EMAIL_PASS: 'p' }, crear);
  assert.deepEqual(creados[1], { host: 'smtp.centro.es', port: 465, secure: true, auth: { user: 'u@centro.es', pass: 'p' } });
  loadMailConfig({ MAIL_MODE: 'smtp', EMAIL_USER: 'u@gmail.com', EMAIL_PASS: 'p' }, crear);
  assert.deepEqual(creados[2], { service: 'gmail', auth: { user: 'u@gmail.com', pass: 'p' } }, 'Gmail without SMTP_HOST, as before');
});

test('mail: MAIL_FROM sets the sender; a caller may still give its own', async () => {
  const enviados = [];
  const cfg = loadMailConfig({ MAIL_MODE: 'mailpit', MAIL_FROM: 'FP Dual <dual@centro.es>' },
    () => ({ sendMail: async (m) => { enviados.push(m); return {}; } }));
  await cfg.transporter.sendMail({ to: 'a@x.test', subject: 'S' });
  await cfg.transporter.sendMail({ to: 'a@x.test', subject: 'S', from: 'otro@x.test' });
  assert.equal(enviados[0].from, 'FP Dual <dual@centro.es>');
  assert.equal(enviados[1].from, 'otro@x.test');
});

test('mail: an unknown MAIL_MODE sends nothing (log) and warns', () => {
  const avisos = [];
  const realWarn = console.warn;
  console.warn = (l) => avisos.push(l);
  try {
    const cfg = loadMailConfig({ MAIL_MODE: 'gmail' }, () => { throw new Error('should not connect'); });
    assert.equal(cfg.MAIL_MODE, 'log');
    assert.equal(cfg.transporter.entrega, false);
  } finally {
    console.warn = realWarn;
  }
  assert.match(avisos.join(' '), /MAIL_MODE=gmail no existe/);
});

test('mail log mode never sends and masks odd recipients', async () => {
  let creado = false;
  const cfg = loadMailConfig({ MAIL_MODE: 'log', MAIL_REDIRECT_TO: '' }, () => { creado = true; return {}; });
  assert.equal(creado, false, 'no SMTP transport in log mode');
  const lineas = [];
  const realLog = console.log;
  console.log = (l) => lineas.push(l);
  try {
    assert.deepEqual(await cfg.transporter.sendMail({ subject: 'Sin destino' }), { simulated: true });
    await cfg.transporter.sendMail({ to: 'no-es-un-correo', subject: 'Raro' });
  } finally {
    console.log = realLog;
  }
  assert.match(lineas[0], /\(sin destinatario\)/);
  assert.match(lineas[1], /para \*\*\*/);
  assert.equal(cfg.maskEmail('@x.test'), '***');
});

// ── Password reset destinations ─────────────────────────────────────────

async function pedir(svc, username, ip) {
  const res = mockRes();
  await svc.solicitar(mockReq({ body: { username }, ip }), res);
  return res;
}

test('forgot password: a student gets the link at the email of their student record', async () => {
  const svc = load('src/services/passwordResetService');
  correos.length = 0;
  usuario = { id_usuario: 5, rol: 'ALUMNO', activo: 1, id_alumno: 70, password_hash: 'h', nombre_mostrar: 'Ana' };
  handler = (sql) => (sql.startsWith('SELECT email, nombre FROM gf_alumnosfct') ? [{ email: 'ana@alumno.test', nombre: 'Ana López' }] : []);
  const res = await pedir(svc, '12345678Z', '2.2.2.1');
  assert.equal(res.statusCode, 200);
  assert.equal(correos.length, 1);
  assert.equal(correos[0].to, 'ana@alumno.test');
  assert.equal(correos[0].nombre, 'Ana López');
});

test('forgot password: a student whose record has no email gets no link but the same answer', async () => {
  const svc = load('src/services/passwordResetService');
  correos.length = 0;
  usuario = { id_usuario: 6, rol: 'ALUMNO', activo: 1, id_alumno: 71, password_hash: 'h' };
  handler = () => [];
  const res = await pedir(svc, '87654321X', '2.2.2.2');
  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /Si la cuenta existe/);
  assert.equal(correos.length, 0);
});

test('forgot password: an account with an unknown role or no linked person gets no link', async () => {
  const svc = load('src/services/passwordResetService');
  correos.length = 0;
  usuario = { id_usuario: 7, rol: 'EMPRESA', activo: 1, id_contacto: null, password_hash: 'h' };
  const res = await pedir(svc, 'B00000000', '2.2.2.3');
  assert.equal(res.statusCode, 200);
  assert.equal(correos.length, 0);
});

test('forgot password in production without APP_URL: 500, no link with a wrong host', async () => {
  const saved = { env: process.env.NODE_ENV, url: process.env.APP_URL };
  process.env.NODE_ENV = 'production';
  delete process.env.APP_URL;
  try {
    const svc = load('src/services/passwordResetService');
    correos.length = 0;
    usuario = { id_usuario: 1, rol: 'ADMINISTRADOR', activo: 1, email: 'admin@centro.test', password_hash: 'h', nombre_mostrar: 'Admin' };
    const res = await pedir(svc, 'admin@centro.test', '2.2.2.4');
    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /No se ha podido preparar el enlace/);
    assert.equal(correos.length, 0);
  } finally {
    process.env.NODE_ENV = saved.env;
    if (saved.url !== undefined) process.env.APP_URL = saved.url;
  }
});

test('forgot password: APP_URL with a trailing slash builds a clean link', async () => {
  const saved = process.env.APP_URL;
  process.env.APP_URL = 'https://dual.centro.test/';
  try {
    const svc = load('src/services/passwordResetService');
    correos.length = 0;
    usuario = { id_usuario: 1, rol: 'COORDINADOR', activo: 1, email: 'c@centro.test', password_hash: 'h', nombre_mostrar: 'Coord' };
    await pedir(svc, 'c@centro.test', '2.2.2.5');
    assert.ok(correos[0].link.startsWith('https://dual.centro.test/restablecer-contrasena?token='));
  } finally {
    if (saved === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = saved;
  }
});

test('reset link: a token signed with the reset key but for another purpose is refused', async () => {
  const jwt = require('jsonwebtoken');
  const svc = load('src/services/passwordResetService');
  const t = jwt.sign({ sub: 7, fp: 'x', purpose: 'login' }, svc._internals.resetSecret());
  const sinSub = jwt.sign({ fp: 'x', purpose: 'reset' }, svc._internals.resetSecret());
  for (const token of [t, sinSub]) {
    const res = mockRes();
    await svc.restablecer(mockReq({ body: { token, newPassword: 'nuevaSegura1' } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'ENLACE_NO_VALIDO');
  }
  const res = mockRes();
  await svc.restablecer(mockReq({ body: { token: t, newPassword: 12345678 } }), res);
  assert.equal(res.statusCode, 400, 'a non-string password is refused');
});

test('reset link: refused when the account was deactivated after the link was sent', async () => {
  const svc = load('src/services/passwordResetService');
  const token = svc._internals.crearToken({ id_usuario: 9, password_hash: 'h:p' });
  handler = (sql) => (sql.startsWith('SELECT password_hash, activo FROM dual_usuarios') ? [{ password_hash: 'h:p', activo: 0 }] : []);
  const res = mockRes();
  await svc.restablecer(mockReq({ body: { token, newPassword: 'nuevaSegura1' } }), res);
  assert.equal(res.statusCode, 400);
  assert.ok(!pool.calls.some((c) => c.sql.startsWith('UPDATE dual_usuarios SET password_hash')));
});

// ── Reactivating a rejected application ─────────────────────────────────

test('reactivar a rejected application with no RECHAZAR event uses the default reason', async () => {
  const { reactivar } = load('src/services/bajaService');
  pool.calls.length = 0;
  handler = (sql) => {
    if (sql.includes('FOR UPDATE')) return [{ estado: 'BAJA', owner_id: 77 }];
    if (sql.includes("accion = 'BAJA'")) return [{ estado_anterior: 'RECHAZADO' }];
    if (sql.includes("accion = 'RECHAZAR'")) return [];
    if (sql.startsWith('UPDATE')) return { affectedRows: 1 };
    return [];
  };
  const out = await reactivar('SOLICITUD_ALUMNO', 10, { user: { id: 1 } });
  assert.deepEqual(out, { ok: true, estado: 'RECHAZADO' });
  const upd = pool.calls.find((c) => c.sql.startsWith('UPDATE dual_solicitudes_alumno'));
  assert.deepEqual(upd.params, ['RECHAZADO', 'Solicitud rechazada antes de la baja.', 10]);
});

test('reactivar when the BAJA event is missing or has an unknown state goes back to PENDIENTE', async () => {
  const { reactivar } = load('src/services/bajaService');
  for (const evento of [[], [{ estado_anterior: 'RARO' }]]) {
    pool.calls.length = 0;
    handler = (sql) => {
      if (sql.includes('FOR UPDATE')) return [{ estado: 'BAJA', owner_id: null }];
      if (sql.includes("accion = 'BAJA'")) return evento;
      if (sql.startsWith('UPDATE')) return { affectedRows: 1 };
      return [];
    };
    const out = await reactivar('SOLICITUD_ALUMNO', 11, { user: { id: 1 } });
    assert.deepEqual(out, { ok: true, estado: 'PENDIENTE' });
    const upd = pool.calls.find((c) => c.sql.startsWith('UPDATE dual_solicitudes_alumno'));
    assert.deepEqual(upd.params, ['PENDIENTE', null, 11]);
  }
});
