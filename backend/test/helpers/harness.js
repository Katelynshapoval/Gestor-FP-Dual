// Minimal test harness for node:test. No database, no network.
// - stub(id, value): replaces a module for every later require() of it.
//   Use 'src/...' for project modules (e.g. 'src/db/pool') or a package name.
// - fakePool(handler): mysql2-like pool; handler(sql, params) returns rows
//   (or a result object for INSERT/UPDATE).
// - mockReq / mockRes: just enough of Express for service functions.
const Module = require('module');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const stubs = new Map();
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (stubs.has(request)) return stubs.get(request);
  if (parent && parent.filename && request.startsWith('.')) {
    const resolved = path.resolve(path.dirname(parent.filename), request).replace(/\.js$/, '');
    if (stubs.has(resolved)) return stubs.get(resolved);
  }
  return originalLoad.apply(this, arguments);
};

function key(id) {
  return id.startsWith('src/') ? path.join(SRC, id.slice(4)).replace(/\.js$/, '') : id;
}

function stub(id, value) {
  stubs.set(key(id), value);
}

function load(id) {
  const file = require.resolve(path.join(SRC, id.slice(4)));
  delete require.cache[file];
  return require(file);
}

function fakePool(handler) {
  const calls = [];
  async function query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    calls.push({ sql: text, params });
    const out = await handler(text, params);
    return [out === undefined ? [] : out, []];
  }
  const conn = {
    query,
    beginTransaction: async () => calls.push({ sql: 'BEGIN' }),
    commit: async () => calls.push({ sql: 'COMMIT' }),
    rollback: async () => calls.push({ sql: 'ROLLBACK' }),
    release: () => {},
  };
  return { query, getConnection: async () => conn, calls };
}

// bcrypt stand-in: hash(x) = 'h:' + x
const fakeBcrypt = {
  hash: async (pw) => `h:${pw}`,
  compare: async (pw, hash) => hash === `h:${pw}`,
};

function mockReq(overrides = {}) {
  return { headers: {}, params: {}, query: {}, body: {}, ip: '127.0.0.1', ...overrides };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    send(payload) { this.body = payload; return this; },
  };
  return res;
}

module.exports = { stub, load, fakePool, fakeBcrypt, mockReq, mockRes };
