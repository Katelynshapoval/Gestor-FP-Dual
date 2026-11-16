// HTTP-level tests: real requests through the real Express app (src/app.js),
// so the parts between the URL and the service are covered too: body parsing,
// security headers, authentication, role checks, multer limits, the PDF
// signature check, rate limiters and the error handlers. The database is a
// fake pool; no email is sent.
process.env.JWT_SECRET = 'http-test-secret-0123456789-abcdefghijklmnop';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, fakePool } = require('./helpers/harness');

// Accounts the auth middleware reads on every request.
const accounts = {
  1: { activo: 1, must_change_password: 0, password_hash: 'h1', rol: 'ADMINISTRADOR' },
  2: { activo: 1, must_change_password: 0, password_hash: 'h2', rol: 'ALUMNO' },
  3: { activo: 0, must_change_password: 0, password_hash: 'h3', rol: 'EMPRESA' },
  4: { activo: 1, must_change_password: 1, password_hash: 'h4', rol: 'COORDINADOR' },
};
let extra = () => undefined;
const pool = fakePool((sql, params) => {
  if (sql.includes('FROM dual_usuarios u JOIN dual_roles r')) {
    return accounts[params[0]] ? [accounts[params[0]]] : [];
  }
  const out = extra(sql, params);
  if (out !== undefined) return out;
  if (sql.startsWith('SELECT COUNT(*) AS n FROM dual_firma_sesiones')) return [{ n: 0 }];
  if (sql.startsWith('INSERT INTO dual_firma_sesiones')) return { insertId: 1 };
  return [];
});
stub('src/db/pool', pool);

const { signToken } = require('../src/middleware/auth');
const app = require('../src/app');

let server;
let base;
test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());
test.beforeEach(() => { extra = () => undefined; });

const token = (id) => signToken({ id, rol: accounts[id].rol }, accounts[id].password_hash);
const auth = (id) => ({ Authorization: `Bearer ${token(id)}` });

async function call(method, path, { headers = {}, body, json } = {}) {
  const init = { method, headers: { ...headers } };
  if (json !== undefined) {
    init.body = typeof json === 'string' ? json : JSON.stringify(json);
    init.headers['Content-Type'] = 'application/json';
  } else if (body !== undefined) {
    init.body = body;
  }
  const res = await fetch(base + path, init);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, headers: res.headers, data };
}

const PDF = Buffer.from('%PDF-1.4\n%fake but signed\n');
function form(fields = {}, files = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  for (const [k, { buffer, type, name = 'f.pdf' }] of Object.entries(files)) {
    fd.append(k, new Blob([buffer], { type }), name);
  }
  return fd;
}

// ── Headers and body parsing ────────────────────────────────────────────

test('every response carries the security headers and no X-Powered-By', async () => {
  const r = await call('GET', '/especialidades');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal(r.headers.get('strict-transport-security'), null, 'HSTS only over HTTPS');
});

test('malformed JSON is a 400 in JSON, not an HTML stack trace', async () => {
  const r = await call('POST', '/auth/login', { json: '{"usuario": ' });
  assert.equal(r.status, 400);
  assert.equal(r.headers.get('content-type').startsWith('application/json'), true);
  assert.match(r.data.error, /JSON/);
});

test('a JSON body over 100 KB is refused with 413', async () => {
  const r = await call('POST', '/auth/login', { json: { usuario: 'x'.repeat(110 * 1024), password: 'y' } });
  assert.equal(r.status, 413);
  assert.match(r.data.error, /demasiado grande/);
});

test('an unknown route answers 404', async () => {
  const r = await call('GET', '/no-existe');
  assert.equal(r.status, 404);
});

test('a database error inside a handler becomes a 500 with a generic message', async () => {
  extra = () => { throw new Error('ECONNREFUSED secret detail'); };
  const r = await call('GET', '/especialidades');
  assert.equal(r.status, 500);
  assert.deepEqual(r.data, { error: 'Error interno del servidor.' });
  assert.doesNotMatch(JSON.stringify(r.data), /secret detail/);
});

// ── Authentication and roles ────────────────────────────────────────────

test('protected route without a token: 401 AUTH_REQUIRED', async () => {
  const r = await call('GET', '/usuarios');
  assert.equal(r.status, 401);
  assert.equal(r.data.code, 'AUTH_REQUIRED');
});

test('a token signed with another secret is refused', async () => {
  const jwt = require('jsonwebtoken');
  const forged = jwt.sign({ id: 1, rol: 'ADMINISTRADOR' }, 'another-secret-another-secret-another');
  const r = await call('GET', '/usuarios', { headers: { Authorization: `Bearer ${forged}` } });
  assert.equal(r.status, 401);
  assert.equal(r.data.code, 'TOKEN_INVALID');
});

test('a token with alg "none" is refused', async () => {
  const head = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ id: 1, rol: 'ADMINISTRADOR' })).toString('base64url');
  const r = await call('GET', '/usuarios', { headers: { Authorization: `Bearer ${head}.${body}.` } });
  assert.equal(r.status, 401);
});

test('a deactivated account is refused even with a valid token', async () => {
  const r = await call('GET', '/documentos/empresa', { headers: auth(3) });
  assert.equal(r.status, 401);
  assert.equal(r.data.code, 'ACCOUNT_DISABLED');
});

test('a token issued before a password change is stale', async () => {
  const old = signToken({ id: 1, rol: 'ADMINISTRADOR' }, 'old-hash');
  const r = await call('GET', '/usuarios', { headers: { Authorization: `Bearer ${old}` } });
  assert.equal(r.status, 401);
  assert.equal(r.data.code, 'SESSION_STALE');
});

test('a token whose role changed since login is stale', async () => {
  const t = signToken({ id: 2, rol: 'ADMINISTRADOR' }, 'h2');
  const r = await call('GET', '/usuarios', { headers: { Authorization: `Bearer ${t}` } });
  assert.equal(r.status, 401);
  assert.equal(r.data.code, 'SESSION_STALE');
});

test('wrong role: 403 FORBIDDEN', async () => {
  const r = await call('GET', '/usuarios', { headers: auth(2) });
  assert.equal(r.status, 403);
  assert.equal(r.data.code, 'FORBIDDEN');
});

test('pending password change blocks every route except /auth/me and /auth/changePassword', async () => {
  const blocked = await call('GET', '/solicitudes/alumno', { headers: auth(4) });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'PASSWORD_CHANGE_REQUIRED');
  const me = await call('GET', '/auth/me', { headers: auth(4) });
  assert.notEqual(me.status, 403);
  assert.notEqual(me.status, 401);
});

// ── Uploads ─────────────────────────────────────────────────────────────

test('upload declared as another type is refused before the service', async () => {
  pool.calls.length = 0;
  const body = form({ clave: 'CV' }, { archivo: { buffer: PDF, type: 'image/png', name: 'x.png' } });
  const r = await call('POST', '/documentos/subir', { headers: auth(1), body });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'Solo se aceptan archivos PDF.');
  assert.equal(pool.calls.filter((c) => !c.sql.includes('dual_usuarios u')).length, 0);
});

test('a file declared as PDF without the %PDF- signature is refused', async () => {
  const body = form({ clave: 'CV' }, { archivo: { buffer: Buffer.from('MZ\x90\x00 not a pdf'), type: 'application/pdf' } });
  const r = await call('POST', '/documentos/subir', { headers: auth(1), body });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'Solo se aceptan archivos PDF.');
});

test('a PDF over 10 MB is refused with the Spanish message', async () => {
  const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 + 10, 0x20)]);
  const body = form({ clave: 'CV' }, { archivo: { buffer: big, type: 'application/pdf' } });
  const r = await call('POST', '/documentos/subir', { headers: auth(1), body });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /10 MB/);
});

test('a second file in a single-file field is refused', async () => {
  const fd = form({ clave: 'CV' });
  fd.append('archivo', new Blob([PDF], { type: 'application/pdf' }), 'a.pdf');
  fd.append('archivo', new Blob([PDF], { type: 'application/pdf' }), 'b.pdf');
  const r = await call('POST', '/documentos/subir', { headers: auth(1), body: fd });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'Se ha enviado un archivo que no se esperaba.');
});

test('an upload with the wrong role never reaches multer', async () => {
  const body = form({}, { archivo: { buffer: PDF, type: 'application/pdf' } });
  const r = await call('POST', '/documentos/plantillas', { headers: auth(2), body });
  assert.equal(r.status, 403);
});

test('email attachment over 10 MB: «El PDF es demasiado grande.»', async () => {
  const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 + 10, 0x20)]);
  const body = form({}, { archivo: { buffer: big, type: 'application/pdf' } });
  const r = await call('POST', '/correos/BIENVENIDA/adjuntos/archivo', { headers: auth(1), body });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'El PDF es demasiado grande.');
});

test('email attachment that is not a PDF', async () => {
  const body = form({}, { archivo: { buffer: Buffer.from('hello'), type: 'application/pdf' } });
  const r = await call('POST', '/correos/BIENVENIDA/adjuntos/archivo', { headers: auth(1), body });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'Solo se aceptan archivos PDF.');
});

test('public student form: a fake CV is refused, the PNG signature field is not checked as PDF', async () => {
  const body = form({}, {
    cv: { buffer: Buffer.from('not pdf'), type: 'application/pdf' },
    firma: { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), type: 'image/png', name: 'f.png' },
  });
  const r = await call('POST', '/solicitudes/alumno', { body });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'Solo se aceptan archivos PDF.');
});

// ── Signatures (firmasRoute) ────────────────────────────────────────────

test('signature image over 1 MB is refused by the route', async () => {
  const body = form({}, { imagen: { buffer: Buffer.alloc(1024 * 1024 + 1), type: 'image/png', name: 'f.png' } });
  const r = await call('PUT', '/firmas/centro', { headers: auth(1), body });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'La imagen de la firma es demasiado grande.');
});

test('only ALUMNO and EMPRESA save their own signature; only ADMINISTRADOR the centre one', async () => {
  const body = () => form({}, { imagen: { buffer: Buffer.alloc(10), type: 'image/png', name: 'f.png' } });
  assert.equal((await call('PUT', '/firmas/mia', { headers: auth(1), body: body() })).status, 403);
  assert.equal((await call('PUT', '/firmas/centro', { headers: auth(2), body: body() })).status, 403);
  assert.equal((await call('DELETE', '/firmas/mia', { headers: auth(1) })).status, 403);
});

test('phone signature: a session read with a wrong reading key is not found', async () => {
  const r = await call('GET', '/firmas/sesiones/1', { headers: { 'X-Firma-Lectura': 'wrong' } });
  assert.equal(r.status, 404);
});

test('phone signature sessions: 20 per IP, the 21st gets 429 with Retry-After', async () => {
  const { limiteSesiones } = require('../src/routes/firmasRoute');
  limiteSesiones.reset();
  for (let i = 0; i < 20; i += 1) {
    const ok = await call('POST', '/firmas/sesiones');
    assert.equal(ok.status, 201, `request ${i + 1}`);
    assert.ok(ok.data.token && ok.data.lectura);
  }
  const r = await call('POST', '/firmas/sesiones');
  assert.equal(r.status, 429);
  assert.equal(r.data.code, 'TOO_MANY_ATTEMPTS');
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  limiteSesiones.reset();
});

test('phone signature: too many sessions open at once (all IPs) gives 429', async () => {
  extra = (sql) => (sql.startsWith('SELECT COUNT(*) AS n FROM dual_firma_sesiones') ? [{ n: 100000 }] : undefined);
  const r = await call('POST', '/firmas/sesiones');
  assert.equal(r.status, 429);
  assert.match(r.data.error, /demasiadas firmas en curso/);
});

// ── Public sign-up rate limit ───────────────────────────────────────────

test('public student form: the 11th submission from one IP in an hour gets 429', async () => {
  const { signupRateLimit } = require('../src/middleware/loginRateLimit');
  signupRateLimit.reset();
  for (let i = 0; i < 10; i += 1) {
    const r = await call('POST', '/solicitudes/alumno', { body: form({}) });
    assert.notEqual(r.status, 429, `request ${i + 1}`);
  }
  const r = await call('POST', '/solicitudes/alumno', { body: form({}) });
  assert.equal(r.status, 429);
  assert.equal(r.data.error, 'Se han recibido demasiadas solicitudes. Vuelve a intentarlo más tarde.');
  signupRateLimit.reset();
});

// ── Password reset does not reveal accounts ─────────────────────────────

test('forgot password gives the same answer for an unknown user', async () => {
  const r = await call('POST', '/auth/forgotPassword', { json: { username: 'nadie@example.invalid' } });
  assert.equal(r.status, 200);
  assert.match(r.data.message, /Si la cuenta existe/);
});
