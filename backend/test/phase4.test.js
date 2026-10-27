// Phase 4 · staff dashboard counters (GET /panel/resumen) and the public
// convocatoria status. No database: the pool and the document workflow are fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let handler = () => [];
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);

let staffQueries = [];
stub('src/services/documentosWorkflow', {
  reservaDocSummary: async (rows) =>
    Object.fromEntries(
      rows.map((r) => [
        r.id_reserva,
        { anexo: r.tipo_contrato_clave ? { estado_operativo: r._anexo } : null },
      ]),
    ),
  queryStaffPage: async (q) => {
    staffQueries.push(q);
    return { pagination: { totalItems: 7 } };
  },
});

const CONVOCATORIAS = [
  { id_convocatoria: 3, nombre: '2027/2028', activa: 0, fecha_inicio: '2027-09-01', fecha_fin: '2028-08-31' },
  { id_convocatoria: 2, nombre: '2026/2027', activa: 1, fecha_inicio: '2026-09-01', fecha_fin: '2027-08-31' },
];

function panelDb({ convocatorias = CONVOCATORIAS } = {}) {
  return (sql, params) => {
    if (sql.startsWith('SELECT id_convocatoria, nombre, activa')) return convocatorias;
    if (sql.includes('FROM dual_solicitudes_alumno s')) return [{ n: params[0] === 2 ? 4 : 0 }];
    if (sql.includes('FROM dual_solicitudes_empresa s')) return [{ n: 1 }];
    if (sql.includes('FROM dual_empresa_cambios')) return [{ n: 2 }];
    if (sql.includes('FROM dual_reservas r')) {
      return [
        { id_reserva: 1, tipo_contrato_clave: null },
        { id_reserva: 2, tipo_contrato_clave: 'BECA', _anexo: 'VALIDADO' },
        { id_reserva: 3, tipo_contrato_clave: 'BECA', _anexo: 'PENDIENTE_VALIDACION' },
        { id_reserva: 4, tipo_contrato_clave: 'OTRO', _anexo: 'PENDIENTE_FIRMA' },
        { id_reserva: 5, tipo_contrato_clave: 'OTRO', _anexo: 'RECHAZADO' },
        { id_reserva: 6, tipo_contrato_clave: 'OTRO', _anexo: 'PENDIENTE_SUBIDA' },
      ];
    }
    return [];
  };
}

test('panel: defaults to the active convocatoria and scopes every count to it', async () => {
  handler = panelDb();
  staffQueries = [];
  const svc = load('src/services/panelService');
  const res = mockRes();
  await svc.resumen(mockReq({ query: {} }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.convocatoria.id_convocatoria, 2);
  assert.equal(res.body.convocatoria.activa, true);
  const c = res.body.contadores;
  assert.equal(c.solicitudes_alumno_pendientes, 4);
  assert.equal(c.solicitudes_empresa_pendientes, 1);
  assert.equal(c.cambios_empresa_pendientes, 2);
  assert.equal(c.documentos_accion_centro, 7);
  assert.deepEqual(staffQueries[0], { convocatoria: '2', accionPendiente: 'CENTRO', pageSize: 10 });
  assert.deepEqual(c.reservas, { pendientes: 6, sinTipo: 1, listas: 1, revisar: 1, firmas: 1, documento: 2 });
  // Every scoped query received the convocatoria id.
  const scoped = pool.calls.filter((q) => q.sql.includes('id_convocatoria = ?'));
  assert.ok(scoped.length >= 4);
  assert.ok(scoped.every((q) => q.params.includes(2)));
});

test('panel: a requested convocatoria is used; an unknown one returns no counters', async () => {
  handler = panelDb();
  const svc = load('src/services/panelService');
  let res = mockRes();
  await svc.resumen(mockReq({ query: { convocatoria: '3' } }), res);
  assert.equal(res.body.convocatoria.id_convocatoria, 3);
  assert.equal(res.body.contadores.solicitudes_alumno_pendientes, 0);

  res = mockRes();
  await svc.resumen(mockReq({ query: { convocatoria: '99' } }), res);
  assert.equal(res.body.convocatoria, null);
  assert.equal(res.body.contadores, null);
  assert.equal(res.body.convocatorias.length, 2);
});

test('panel: with no convocatorias at all it answers without counting', async () => {
  handler = panelDb({ convocatorias: [] });
  const svc = load('src/services/panelService');
  const res = mockRes();
  await svc.resumen(mockReq({ query: {} }), res);
  assert.deepEqual(res.body, { convocatoria: null, convocatorias: [], contadores: null });
});

test('panel route is staff-only', () => {
  const route = load('src/routes/panelRoute');
  const layer = route.stack.find((l) => l.route?.path === '/panel/resumen');
  assert.ok(layer, 'route registered');
  // requireAuth, requireRole(...), handler
  assert.equal(layer.route.stack.length, 3);
});

test('convocatoria status: open with the active one, and the next one when closed', async () => {
  let activa = [{ id_convocatoria: 2, nombre: '2026/2027', fecha_inicio: '2026-09-01', fecha_fin: '2027-08-31' }];
  handler = (sql) => {
    if (sql.includes('WHERE activa = 1')) return activa;
    if (sql.includes('fecha_inicio > CURDATE()')) return [{ id_convocatoria: 3, nombre: '2027/2028', fecha_inicio: '2027-09-01', fecha_fin: '2028-08-31' }];
    if (sql.includes('FOR UPDATE')) return [];
    return [];
  };
  const svc = load('src/services/convocatoriasService');
  let res = mockRes();
  await svc.getEstado(mockReq(), res);
  assert.equal(res.body.abierta, true);
  assert.equal(res.body.activa.nombre, '2026/2027');

  activa = [];
  res = mockRes();
  await svc.getEstado(mockReq(), res);
  assert.equal(res.body.abierta, false);
  assert.equal(res.body.activa, null);
  assert.equal(res.body.proxima.nombre, '2027/2028');
});

// ── Notifications (WF-19) ───────────────────────────────────────────────────

const sent = [];
let failNext = false;
stub('src/mail/config', {
  transporter: {
    sendMail: async (m) => {
      if (failNext) {
        failNext = false;
        throw new Error('SMTP caído');
      }
      sent.push(m);
      return {};
    },
  },
});

const RESERVA_ROW = {
  id_reserva: 9, estado: 'PENDIENTE', alumno: 'Ana <b>López</b>', email_alumno: 'ana@example.test',
  empresa: 'ACME & Hijos', coordinador: 'Coord', email_empresa: 'coord@acme.test',
  especialidad: 'Joyería', convocatoria: '2026/2027',
};

function notifDb(sql) {
  if (sql.includes('FROM dual_reservas r') && sql.includes('email_alumno')) return [RESERVA_ROW];
  if (sql.includes('FROM dual_solicitudes_alumno sa') && sql.includes('a.email')) {
    return [{ nombre: 'Ana', email: 'ana@example.test', convocatoria: '2026/2027', especialidad: 'Joyería' }];
  }
  if (sql.includes('FROM dual_solicitudes_empresa se') && sql.includes('ct.email')) {
    return [{ empresa: 'ACME', coordinador: 'Coord', email: 'coord@acme.test', convocatoria: '2026/2027' }];
  }
  if (sql.includes('FROM dual_documentos d')) {
    return [{ id_documento: 5, clave: 'CV', id_solicitud_alumno: 3, id_solicitud_empresa: null, id_reserva: null }];
  }
  return [];
}

test('notifications: recipients follow the approved mapping', async () => {
  handler = notifDb;
  const n = load('src/services/notificaciones');

  sent.length = 0;
  await n.reservaCreada(9);
  assert.deepEqual(sent.map((m) => m.to), ['ana@example.test']);

  sent.length = 0;
  await n.reservaCreada(9, { porCentro: true });
  assert.deepEqual(sent.map((m) => m.to).sort(), ['ana@example.test', 'coord@acme.test']);

  sent.length = 0;
  await n.reservaCancelada(9);
  assert.deepEqual(sent.map((m) => m.to), ['ana@example.test']);

  sent.length = 0;
  await n.reservaCancelada(9, { avisarEmpresa: true, avisarAlumno: false });
  assert.deepEqual(sent.map((m) => m.to), ['coord@acme.test']);

  sent.length = 0;
  await n.reservaConfirmada(9);
  assert.deepEqual(sent.map((m) => m.to).sort(), ['ana@example.test', 'coord@acme.test']);

  sent.length = 0;
  await n.solicitudAlumno(3, 'RECHAZADO', 'Falta el CV firmado');
  assert.equal(sent[0].to, 'ana@example.test');
  assert.match(sent[0].html, /Falta el CV firmado/);

  sent.length = 0;
  await n.solicitudEmpresa(4, 'VALIDADO');
  assert.equal(sent[0].to, 'coord@acme.test');

  sent.length = 0;
  await n.documentoRechazado(5, 'Ilegible');
  assert.equal(sent[0].to, 'ana@example.test');
  assert.match(sent[0].subject, /CV/);
});

test('notifications: values are HTML-escaped; no DNI, phone or cancellation reason', async () => {
  handler = notifDb;
  const n = load('src/services/notificaciones');
  sent.length = 0;
  await n.reservaCancelada(9, { avisarEmpresa: true });
  for (const m of sent) {
    assert.ok(!m.html.includes('<b>López</b>'));
    assert.ok(m.html.includes('&lt;b&gt;López&lt;/b&gt;') || !m.html.includes('López'));
    assert.ok(m.html.includes('ACME &amp; Hijos'));
    assert.ok(!/motivo/i.test(m.html));
  }
});

test('notifications never throw: a delivery failure or a missing row only logs', async () => {
  handler = notifDb;
  const n = load('src/services/notificaciones');
  failNext = true;
  assert.equal(await n.solicitudAlumno(3, 'VALIDADO'), false);
  handler = () => {
    throw new Error('DB caída');
  };
  assert.equal(await n.reservaConfirmada(9), false);
  handler = () => [];
  assert.equal(await n.reservaCreada(404), false);
  // Reopening (REABRIR → PENDIENTE) has no email.
  handler = notifDb;
  sent.length = 0;
  assert.equal(await n.solicitudAlumno(3, 'PENDIENTE'), false);
  assert.equal(sent.length, 0);
});

test('mail/config: development defaults to log mode and masks the recipient', () => {
  const path = require('node:path');
  const file = require.resolve(path.join(__dirname, '..', 'src', 'mail', 'config.js'));
  const saved = { mode: process.env.MAIL_MODE, env: process.env.NODE_ENV };
  delete process.env.MAIL_MODE;
  process.env.NODE_ENV = 'development';
  delete require.cache[file];
  const real = require(file);
  assert.equal(real.MAIL_MODE, 'log');
  assert.equal(real.maskEmail('ana.lopez@example.test'), 'a***@example.test');
  if (saved.mode === undefined) delete process.env.MAIL_MODE;
  else process.env.MAIL_MODE = saved.mode;
  process.env.NODE_ENV = saved.env;
  delete require.cache[file];
});

// ── SEC-11 and the company password rule ────────────────────────────────────

test('SEC-11: students do not receive the free-text cancellation reason', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'reservasService.js'), 'utf8');
  const alumno = src.slice(src.indexOf('exports.getReservasAlumno'), src.indexOf('};', src.indexOf('exports.getReservasAlumno')));
  assert.match(alumno, /NULL AS motivo/);
  assert.doesNotMatch(alumno, /r\.motivo/);
  assert.match(src, /motivo: estado === ESTADOS_RESERVA\.CANCELADA && rol !== 'ALUMNO'/);
});

test('SEC-11: GET /usuarios is ADMINISTRADOR only', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'authRoute.js'), 'utf8');
  assert.match(src, /router\.get\('\/usuarios', requireAuth, requireRole\('ADMINISTRADOR'\),/);
});

test('self-registered companies are not forced to change the password they chose', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'solicitudesEmpresaService.js'), 'utf8');
  assert.match(src, /must_change_password\s*\)\s*VALUES \(\?, NULL, \?, \?, \?, 1, 0\)/);
});
