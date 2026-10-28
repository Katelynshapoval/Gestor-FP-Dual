// Security audit fixes (docs/security/security-audit.md): SEC-002, SEC-003,
// SEC-004, SEC-008, SEC-012. SEC-001, SEC-006 and SEC-009 live next to the
// tests of the same flows (authorization, auth, phase5).
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let handler = () => [];
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);

let solicitud = { id_empresa: 7, estado_validacion: 'VALIDADO', convocatoria_activa: 1 };
stub('src/services/empresaDatos', { loadEmpresaDatosRead: async () => solicitud });

function empresaDb() {
  pool.calls.length = 0;
  handler = (sql) => {
    if (sql.startsWith('SELECT d.idempresa FROM dual_usuarios')) return [{ idempresa: 7 }];
    if (sql.startsWith('SELECT id_solicitud_empresa FROM dual_solicitudes_empresa')) return [{ id_solicitud_empresa: 3 }];
    if (sql.startsWith('SELECT id_especialidad, nombre FROM dual_especialidades')) return [{ id_especialidad: 9, nombre: 'DAW' }];
    if (sql.startsWith('INSERT INTO dual_solicitud_empresa_especialidades')) return { insertId: 55 };
    return [];
  };
}

const addReq = (rol, cantidad = 2) =>
  mockReq({ user: { id: 1, rol }, params: { id: '3' }, body: { id_especialidad: 9, cantidad } });
const inserts = () => pool.calls.filter((c) => c.sql.startsWith('INSERT INTO dual_solicitud_empresa_especialidades'));

// ── SEC-002 ─────────────────────────────────────────────────────────────
test('SEC-002: a validated company cannot add a ciclo by itself', async () => {
  const svc = load('src/services/solicitudesEmpresaService');
  solicitud = { id_empresa: 7, estado_validacion: 'VALIDADO', convocatoria_activa: 1 };
  empresaDb();
  const res = mockRes();
  await svc.addEspecialidad(addReq('EMPRESA'), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'REQUIERE_CENTRO');
  assert.equal(inserts().length, 0);
});

test('SEC-002: staff can still add a ciclo to a validated application; a pending one stays open to the company', async () => {
  const svc = load('src/services/solicitudesEmpresaService');
  solicitud = { id_empresa: 7, estado_validacion: 'VALIDADO', convocatoria_activa: 1 };
  empresaDb();
  let res = mockRes();
  await svc.addEspecialidad(addReq('COORDINADOR'), res);
  assert.equal(res.statusCode, 201);
  assert.equal(inserts().length, 1);

  solicitud = { id_empresa: 7, estado_validacion: 'PENDIENTE', convocatoria_activa: 1 };
  empresaDb();
  res = mockRes();
  await svc.addEspecialidad(addReq('EMPRESA'), res);
  assert.equal(res.statusCode, 201);
});

test('SEC-002: places per ciclo are capped', async () => {
  const svc = load('src/services/solicitudesEmpresaService');
  solicitud = { id_empresa: 7, estado_validacion: 'PENDIENTE', convocatoria_activa: 1 };
  empresaDb();
  let res = mockRes();
  await svc.addEspecialidad(addReq('COORDINADOR', 1000), res);
  assert.equal(res.statusCode, 400);
  assert.equal(inserts().length, 0);

  res = mockRes();
  await svc.updateCupoEspecialidad(
    mockReq({ user: { id: 1, rol: 'COORDINADOR' }, params: { id: '3', idOferta: '55' }, body: { cantidad: 1000 } }),
    res,
  );
  assert.equal(res.statusCode, 400);
});

test('SEC-002: a validated company cannot raise its places, only lower them', async () => {
  const svc = load('src/services/solicitudesEmpresaService');
  solicitud = { id_empresa: 7, estado_validacion: 'VALIDADO', convocatoria_activa: 1 };
  empresaDb();
  const base = handler;
  handler = (sql, params) => {
    if (sql.startsWith('SELECT cantidad_alumnos FROM dual_solicitud_empresa_especialidades')) return [{ cantidad_alumnos: 2 }];
    if (sql.startsWith('SELECT esp.nombre AS especialidad')) return [{ especialidad: 'DAW', empresa: 'ACME', email_coordinador: 'c@x.test' }];
    return base(sql, params);
  };
  const res = mockRes();
  await svc.updateCupoEspecialidad(
    mockReq({ user: { id: 1, rol: 'EMPRESA' }, params: { id: '3', idOferta: '55' }, body: { cantidad: 5 } }),
    res,
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'REQUIERE_CENTRO');
  assert.ok(!pool.calls.some((c) => c.sql.startsWith('UPDATE dual_solicitud_empresa_especialidades')));
});

// ── SEC-003 ─────────────────────────────────────────────────────────────
test('SEC-003: public sign-ups are limited per IP and in total', () => {
  const { createSignupRateLimit } = require('../src/middleware/loginRateLimit');
  let t = 1_000_000;
  const limit = createSignupRateLimit({ maxPerIp: 2, maxPerDay: 3, now: () => t });
  const call = (ip) => {
    const res = mockRes();
    let passed = false;
    limit(mockReq({ ip }), res, () => { passed = true; });
    return { passed, res };
  };
  assert.equal(call('1.1.1.1').passed, true);
  assert.equal(call('1.1.1.1').passed, true);
  const third = call('1.1.1.1');
  assert.equal(third.passed, false);
  assert.equal(third.res.statusCode, 429);
  assert.ok(Number(third.res.headers['retry-after']) > 0);
  assert.equal(call('2.2.2.2').passed, true); // 3rd of the day
  assert.equal(call('3.3.3.3').passed, false); // daily cap reached
  t += 25 * 60 * 60 * 1000;
  assert.equal(call('3.3.3.3').passed, true);
});

// ── SEC-004 ─────────────────────────────────────────────────────────────
test('SEC-004: template commands are variable lookups, never code', () => {
  stub('puppeteer', {});
  stub('mammoth', {});
  const { resolveTemplateVariable } = load('src/services/documentGenerationService');
  const data = { razonSocial: 'ACME', $fila: { codigo: 'DAW' } };
  assert.equal(resolveTemplateVariable(data, ' razonSocial '), 'ACME');
  assert.equal(resolveTemplateVariable(data, '$fila.codigo'), 'DAW');
  assert.equal(resolveTemplateVariable(data, 'noExiste'), undefined);
  for (const code of ['process.exit(1)', '1 + 1', 'a; b', 'razonSocial.constructor', '__proto__', 'this.constructor.constructor', 'require("fs")']) {
    assert.throws(() => resolveTemplateVariable(data, code), /plantilla/, code);
  }
});

// ── SEC-008 ─────────────────────────────────────────────────────────────
test('SEC-008: uploads must really be PDF files', () => {
  const { requirePdfSignature, isPdf } = require('../src/middleware/pdfUpload');
  assert.equal(isPdf(Buffer.from('%PDF-1.7\n...')), true);
  assert.equal(isPdf(Buffer.from('\n\n%PDF-1.4')), true);
  assert.equal(isPdf(Buffer.from('<html><script>alert(1)</script>')), false);

  const run = (req) => {
    const res = mockRes();
    let passed = false;
    requirePdfSignature(req, res, () => { passed = true; });
    return { passed, res };
  };
  assert.equal(run(mockReq({ file: { buffer: Buffer.from('%PDF-1.4') } })).passed, true);
  const bad = run(mockReq({ files: { cv: [{ buffer: Buffer.from('%PDF-1.4') }], anexoDga: [{ buffer: Buffer.from('<html>') }] } }));
  assert.equal(bad.passed, false);
  assert.equal(bad.res.statusCode, 400);
});

// ── SEC-012 ─────────────────────────────────────────────────────────────
test('SEC-012: template downloads use a server-made name and type', async () => {
  const svc = load('src/services/plantillasService');
  handler = (sql) => (sql.startsWith('SELECT p.archivo, p.version, td.nombre AS clave')
    ? [{ archivo: Buffer.from('PK\x03\x04'), version: 3, clave: 'CONVENIO' }]
    : []);
  const headers = {};
  const res = { ...mockRes(), setHeader: (k, v) => { headers[k] = v; } };
  await svc.descargar(mockReq({ params: { id: '1' } }), res);
  assert.equal(headers['Content-Disposition'], 'attachment; filename="plantilla-convenio-v3.docx"');
  assert.equal(headers['Content-Type'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});
