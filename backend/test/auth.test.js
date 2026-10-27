// Phase 1 · SEC-1, SEC-2, SEC-8, login limiter
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { stub, load, fakePool, fakeBcrypt, mockReq, mockRes } = require('./helpers/harness');

const SECRET = 'test-secret-that-is-long-enough-0123456789';
const OLD_FALLBACK = 'dual_jwt_secret_change_in_production';

// Database state shared by the fake pool
const db = {
  users: {
    1: { activo: 1, must_change_password: 0, rol: 'ADMINISTRADOR', password_hash: 'h:correcta1' },
    2: { activo: 0, must_change_password: 0, rol: 'EMPRESA', password_hash: 'h:x' },
    3: { activo: 1, must_change_password: 1, rol: 'ALUMNO', password_hash: 'h:temporal1' },
  },
  updates: [],
};

const pool = fakePool((sql, params) => {
  if (sql.startsWith('SELECT u.activo, u.must_change_password, r.nombre AS rol')) {
    const u = db.users[params[0]];
    return u ? [u] : [];
  }
  if (sql.startsWith('SELECT password_hash, must_change_password FROM dual_usuarios')) {
    const u = db.users[params[0]];
    return u ? [u] : [];
  }
  if (sql.startsWith('UPDATE dual_usuarios SET password_hash')) {
    db.updates.push(params);
    return { affectedRows: 1 };
  }
  // login lookups: staff email "admin@x" → user 1
  if (sql.includes("r.nombre IN ('ADMINISTRADOR', 'COORDINADOR')")) {
    return params[0] === 'admin@x'
      ? [{ id_usuario: 1, nombre_mostrar: 'Admin', email: 'admin@x', rol: 'ADMINISTRADOR', ...db.users[1] }]
      : [];
  }
  return [];
});

stub('src/db/pool', pool);
stub('bcrypt', fakeBcrypt);

function runMiddleware(mw, req) {
  const res = mockRes();
  return new Promise((resolve, reject) => {
    const maybe = mw(req, res, (err) => (err ? reject(err) : resolve({ res, nextCalled: true, req })));
    Promise.resolve(maybe).then(() => resolve({ res, nextCalled: false, req }), reject);
  });
}

const bearer = (payload, secret = SECRET) => ({ authorization: `Bearer ${jwt.sign(payload, secret)}` });

test('SEC-1: missing, short or old fallback secret is refused', () => {
  const auth = load('src/middleware/auth');
  delete process.env.JWT_SECRET;
  assert.throws(() => auth.assertJwtConfig(), /JWT_SECRET/);
  process.env.JWT_SECRET = 'short';
  assert.throws(() => auth.assertJwtConfig(), /JWT_SECRET/);
  process.env.JWT_SECRET = OLD_FALLBACK;
  assert.throws(() => auth.assertJwtConfig(), /JWT_SECRET/);
  process.env.JWT_SECRET = SECRET;
  assert.doesNotThrow(() => auth.assertJwtConfig());
});

test('SEC-1: a token signed with the old hard-coded fallback is rejected', async () => {
  process.env.JWT_SECRET = SECRET;
  const auth = load('src/middleware/auth');
  const forged = bearer({ id: 1, rol: 'ADMINISTRADOR' }, OLD_FALLBACK);
  const { res, nextCalled } = await runMiddleware(auth.requireAuth, mockReq({ headers: forged }));
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('SEC-8: active user with matching role passes; deactivated user is rejected on the next request', async () => {
  process.env.JWT_SECRET = SECRET;
  const auth = load('src/middleware/auth');
  const ok = await runMiddleware(auth.requireAuth, mockReq({ headers: bearer({ id: 1, rol: 'ADMINISTRADOR' }) }));
  assert.equal(ok.nextCalled, true);
  assert.equal(ok.req.user.rol, 'ADMINISTRADOR');

  const off = await runMiddleware(auth.requireAuth, mockReq({ headers: bearer({ id: 2, rol: 'EMPRESA' }) }));
  assert.equal(off.nextCalled, false);
  assert.equal(off.res.statusCode, 401);
  assert.equal(off.res.body.code, 'ACCOUNT_DISABLED');

  const gone = await runMiddleware(auth.requireAuth, mockReq({ headers: bearer({ id: 99, rol: 'ADMINISTRADOR' }) }));
  assert.equal(gone.res.statusCode, 401);
});

test('SEC-8: a token whose role no longer matches the database is rejected', async () => {
  process.env.JWT_SECRET = SECRET;
  const auth = load('src/middleware/auth');
  const r = await runMiddleware(auth.requireAuth, mockReq({ headers: bearer({ id: 1, rol: 'COORDINADOR' }) }));
  assert.equal(r.res.statusCode, 401);
  assert.equal(r.res.body.code, 'SESSION_STALE');
});

test('SEC-2: must_change_password blocks normal routes but allows /auth/me and changePassword', async () => {
  process.env.JWT_SECRET = SECRET;
  const auth = load('src/middleware/auth');
  const headers = bearer({ id: 3, rol: 'ALUMNO' });
  const blocked = await runMiddleware(auth.requireAuth, mockReq({ headers }));
  assert.equal(blocked.res.statusCode, 403);
  assert.equal(blocked.res.body.code, 'PASSWORD_CHANGE_REQUIRED');
  const allowed = await runMiddleware(auth.requireAuthAllowPasswordChange, mockReq({ headers }));
  assert.equal(allowed.nextCalled, true);
});

test('SEC-2: changing a password without the current one returns 400; a wrong one 401', async () => {
  const svc = load('src/services/authService');
  let res = mockRes();
  await svc.changePassword(mockReq({ user: { id: 1 }, body: { newPassword: 'nuevaClave1' } }), res);
  assert.equal(res.statusCode, 400);

  res = mockRes();
  await svc.changePassword(mockReq({ user: { id: 1 }, body: { currentPassword: 'mala', newPassword: 'nuevaClave1' } }), res);
  assert.equal(res.statusCode, 401);

  db.updates.length = 0;
  res = mockRes();
  await svc.changePassword(mockReq({ user: { id: 1 }, body: { currentPassword: 'correcta1', newPassword: 'nuevaClave1' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(db.updates.length, 1);
});

test('SEC-2: the forced change (flag read from DB) does not need the current password', async () => {
  const svc = load('src/services/authService');
  const res = mockRes();
  await svc.changePassword(mockReq({ user: { id: 3 }, body: { newPassword: 'definitiva1' } }), res);
  assert.equal(res.statusCode, 200);
});

test('SEC-2: new password must differ and have at least 8 characters', async () => {
  const svc = load('src/services/authService');
  let res = mockRes();
  await svc.changePassword(mockReq({ user: { id: 3 }, body: { newPassword: 'corta' } }), res);
  assert.equal(res.statusCode, 400);
  res = mockRes();
  await svc.changePassword(mockReq({ user: { id: 3 }, body: { newPassword: 'temporal1' } }), res);
  assert.equal(res.statusCode, 400);
});

test('Login limiter: 5 failures for one identifier → 429 with Retry-After; others unaffected', async () => {
  process.env.JWT_SECRET = SECRET;
  const svc = load('src/services/authService');
  const { loginRateLimiter } = require('../src/middleware/loginRateLimit');
  loginRateLimiter.reset();
  for (let i = 0; i < 5; i++) {
    const res = mockRes();
    await svc.loginWithCredentials(mockReq({ body: { username: 'admin@x', password: 'mal' } }), res);
    assert.equal(res.statusCode, 401);
  }
  let res = mockRes();
  await svc.loginWithCredentials(mockReq({ body: { username: 'admin@x', password: 'correcta1' } }), res);
  assert.equal(res.statusCode, 429);
  assert.ok(Number(res.headers['retry-after']) > 0);

  res = mockRes();
  await svc.loginWithCredentials(mockReq({ ip: '10.0.0.2', body: { username: 'admin@x', password: 'correcta1' } }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.token);
  loginRateLimiter.reset();
});

test('Login limiter: window expiry and success reset', () => {
  const { createLoginRateLimiter } = require('../src/middleware/loginRateLimit');
  let now = 0;
  const lim = createLoginRateLimiter({ windowMs: 1000, maxPerIdentifier: 2, maxPerIp: 100, now: () => now });
  lim.recordFailure('ip', 'a');
  lim.recordFailure('ip', 'a');
  assert.ok(lim.retryAfter('ip', 'a') > 0);
  now = 1500;
  assert.equal(lim.retryAfter('ip', 'a'), 0);
  lim.recordFailure('ip', 'b');
  lim.recordSuccess('ip', 'b');
  lim.recordFailure('ip', 'b');
  assert.equal(lim.retryAfter('ip', 'b'), 0);
});
