// Company convenio without an active CONVENIO template: confirmation email
// always sent, "convenio disponible" email on generation, catch-up action,
// staff counters and the company's view. No database, no real email: the
// pool, the generator and the mail transporter are fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let handler = () => [];
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);

// Recording transporter (replaces the harness's null one).
const sent = [];
let mailFails = false;
stub('src/mail/config', {
  transporter: {
    async sendMail(options) {
      if (mailFails) throw new Error('SMTP caído');
      sent.push(options);
      return { simulated: true };
    },
  },
});

// Document generator: no template / no Puppeteer.
const PDF = Buffer.from('%PDF-1.4 convenio');
let hasTemplate = true;
let generateImpl = async () => ({ ok: true, id_documento: 900, pdf: PDF });
const generated = [];
stub('src/services/documentGenerationService', {
  loadActiveTemplate: async () => (hasTemplate ? { id_plantilla: 1, version: 1 } : null),
  generateDocument: async (args) => {
    generated.push(args);
    if (!hasTemplate) return { ok: false, code: 'SIN_PLANTILLA', clave: args.clave };
    return generateImpl(args);
  },
});

const EMPRESAS = {
  10: { empresa: 'Talleres <Ebro>', coordinador: 'Ana', email: 'ana@example.test', convocatoria: '2026/2027' },
  11: { empresa: 'Logística Norte', coordinador: 'Luis', email: 'luis@example.test', convocatoria: '2026/2027' },
  12: { empresa: 'Fallos SL', coordinador: 'Eva', email: 'eva@example.test', convocatoria: '2026/2027' },
};

function db({ pendientes = [10, 11], activa = { id_convocatoria: 2, nombre: '2026/2027' } } = {}) {
  return (sql, params) => {
    if (sql.includes('FROM dual_convocatorias WHERE activa = 1')) return activa ? [activa] : [];
    if (sql.includes('NOT EXISTS')) {
      return pendientes.map((id) => ({ id_solicitud_empresa: id, empresa: EMPRESAS[id].empresa }));
    }
    if (sql.includes('ct.email, c.nombre AS convocatoria')) return [EMPRESAS[params[0]]].filter(Boolean);
    return [];
  };
}

function reset(opts) {
  handler = db(opts);
  sent.length = 0;
  generated.length = 0;
  mailFails = false;
  hasTemplate = true;
  generateImpl = async () => ({ ok: true, id_documento: 900, pdf: PDF });
}

// Notifications are fire-and-forget in request handlers: wait for them.
async function waitForMail(n = 1) {
  for (let i = 0; i < 50 && sent.length < n; i++) await new Promise((r) => setImmediate(r));
}

// ── Confirmation after applying (create and reapply share this function) ────

test('confirmation: with a template the convenio PDF is attached', async () => {
  reset();
  const { safelyGenerateAndSendConvenio } = load('src/services/solicitudesEmpresaService')._internals;
  await safelyGenerateAndSendConvenio(10, 'x', null);
  assert.equal(generated.length, 1);
  assert.equal(generated[0].clave, 'CONVENIO');
  assert.equal(generated[0].regenerar, false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ana@example.test');
  assert.equal(sent[0].subject, 'Solicitud Dual Empresa recibida');
  assert.equal(sent[0].attachments.length, 1);
  assert.equal(sent[0].attachments[0].content, PDF);
  assert.match(sent[0].attachments[0].filename, /^CONVENIO_Talleres_Ebro_\d{4}\.pdf$/);
  assert.match(sent[0].html, /Adjuntamos el convenio/);
  // Company name is HTML-escaped.
  assert.match(sent[0].html, /Talleres &lt;Ebro&gt;/);
});

test('confirmation: without a template it is still sent, with no attachment', async () => {
  reset();
  hasTemplate = false;
  const { safelyGenerateAndSendConvenio } = load('src/services/solicitudesEmpresaService')._internals;
  await safelyGenerateAndSendConvenio(10, 'x', null);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, 'Solicitud Dual Empresa recibida');
  assert.equal(sent[0].attachments, undefined);
  assert.match(sent[0].html, /estará disponible en el portal en cuanto el centro lo genere/);
});

test('confirmation: a generation error still sends it without the PDF', async () => {
  reset();
  generateImpl = async () => {
    throw new Error('puppeteer no arranca');
  };
  const { safelyGenerateAndSendConvenio } = load('src/services/solicitudesEmpresaService')._internals;
  await safelyGenerateAndSendConvenio(10, 'x', null);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].attachments, undefined);
});

test('confirmation: a mail failure never throws', async () => {
  reset();
  mailFails = true;
  const { safelyGenerateAndSendConvenio } = load('src/services/solicitudesEmpresaService')._internals;
  await assert.doesNotReject(() => safelyGenerateAndSendConvenio(10, 'x', null));
  hasTemplate = false;
  await assert.doesNotReject(() => safelyGenerateAndSendConvenio(10, 'x', null));
});

test('confirmation: both create and reapply go through the shared function', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'solicitudesEmpresaService.js'), 'utf8');
  assert.equal((src.match(/await safelyGenerateAndSendConvenio\(/g) || []).length, 2);
  assert.ok(!src.includes('sendCompanyConfirmationEmail'));
});

// ── Single generation from the documents page ───────────────────────────────

test('generar: a generated CONVENIO emails the company with the PDF', async () => {
  reset();
  const svc = load('src/services/documentosService');
  const res = mockRes();
  await svc.generar(
    mockReq({ body: { clave: 'CONVENIO', id_solicitud_empresa: '11' }, user: { id: 5, rol: 'COORDINADOR' } }),
    res,
  );
  assert.equal(res.statusCode, 200);
  await waitForMail();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'luis@example.test');
  assert.equal(sent[0].subject, 'Tu convenio está disponible');
  assert.equal(sent[0].attachments[0].content, PDF);
});

test('generar: no template answers 409 and sends nothing', async () => {
  reset();
  hasTemplate = false;
  const svc = load('src/services/documentosService');
  const res = mockRes();
  await svc.generar(
    mockReq({ body: { clave: 'CONVENIO', id_solicitud_empresa: '11' }, user: { id: 5, rol: 'COORDINADOR' } }),
    res,
  );
  assert.equal(res.statusCode, 409);
  await waitForMail();
  assert.equal(sent.length, 0);
});

test('generar: a mail failure does not change the response', async () => {
  reset();
  mailFails = true;
  const svc = load('src/services/documentosService');
  const res = mockRes();
  await svc.generar(
    mockReq({ body: { clave: 'CONVENIO', id_solicitud_empresa: '11' }, user: { id: 5, rol: 'COORDINADOR' } }),
    res,
  );
  assert.equal(res.statusCode, 200);
});

// ── Catch-up: "Generar convenios pendientes" ────────────────────────────────

test('pendientes: generates each missing convenio and emails each company', async () => {
  reset();
  const svc = load('src/services/conveniosPendientes');
  const res = mockRes();
  await svc.generarPendientesHandler(mockReq({ user: { id: 5, rol: 'ADMINISTRADOR' } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.generados.map((g) => g.id_solicitud_empresa), [10, 11]);
  assert.deepEqual(res.body.fallidos, []);
  assert.equal(res.body.message, 'Convenios generados: 2.');
  assert.ok(generated.every((g) => g.regenerar === false && g.userId === 5 && g.userRol === 'ADMINISTRADOR'));
  assert.deepEqual(sent.map((m) => m.to), ['ana@example.test', 'luis@example.test']);
  assert.ok(sent.every((m) => m.subject === 'Tu convenio está disponible' && m.attachments.length === 1));
  // Scoped to the active convocatoria; existing convenios (uploaded or generated) excluded.
  const q = pool.calls.find((c) => c.sql.includes('NOT EXISTS'));
  assert.deepEqual(q.params, [2]);
  assert.match(q.sql, /d\.archivo IS NOT NULL/);
  assert.match(q.sql, /<> 'RECHAZADO'/);
});

test('pendientes: one at a time, and one failure does not stop the rest', async () => {
  reset({ pendientes: [10, 12, 11] });
  let running = 0;
  let maxRunning = 0;
  generateImpl = async ({ parents }) => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((r) => setImmediate(r));
    running -= 1;
    if (parents.id_solicitud_empresa === 12) {
      const err = new Error('Un documento validado no se puede regenerar.');
      err.status = 400;
      throw err;
    }
    return { ok: true, id_documento: 900 + parents.id_solicitud_empresa, pdf: PDF };
  };
  const svc = load('src/services/conveniosPendientes');
  const res = mockRes();
  await svc.generarPendientesHandler(mockReq({ user: { id: 5, rol: 'COORDINADOR' } }), res);
  assert.equal(maxRunning, 1);
  assert.deepEqual(res.body.generados.map((g) => g.id_solicitud_empresa), [10, 11]);
  assert.deepEqual(res.body.fallidos, [
    { id_solicitud_empresa: 12, empresa: 'Fallos SL', error: 'Un documento validado no se puede regenerar.' },
  ]);
  assert.equal(res.body.message, 'Convenios generados: 2. Con error: 1.');
  // No email for the one that failed.
  assert.deepEqual(sent.map((m) => m.to), ['ana@example.test', 'luis@example.test']);
});

test('pendientes: without a template nothing is generated (409)', async () => {
  reset();
  hasTemplate = false;
  const svc = load('src/services/conveniosPendientes');
  const res = mockRes();
  await svc.generarPendientesHandler(mockReq({ user: { id: 5, rol: 'ADMINISTRADOR' } }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'SIN_PLANTILLA');
  assert.equal(generated.length, 0);
});

test('pendientes: no active convocatoria answers 400', async () => {
  reset({ activa: null });
  const svc = load('src/services/conveniosPendientes');
  const res = mockRes();
  await svc.generarPendientesHandler(mockReq({ user: { id: 5, rol: 'ADMINISTRADOR' } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(generated.length, 0);
});

test('pendientes: a second run while one is going is refused', async () => {
  reset();
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  generateImpl = async () => {
    await gate;
    return { ok: true, id_documento: 1, pdf: PDF };
  };
  const svc = load('src/services/conveniosPendientes');
  const first = svc.generarPendientes({ id: 5, rol: 'ADMINISTRADOR' });
  await new Promise((r) => setImmediate(r));
  const second = await svc.generarPendientes({ id: 5, rol: 'ADMINISTRADOR' });
  assert.equal(second.status, 409);
  release();
  assert.equal((await first).status, 200);
  // The lock is released afterwards.
  assert.equal((await svc.generarPendientes({ id: 5, rol: 'ADMINISTRADOR' })).status, 200);
});

test('route: catch-up is limited to ADMINISTRADOR and COORDINADOR', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'documentosRoute.js'), 'utf8');
  assert.match(
    src,
    /'\/documentos\/convenios\/generar-pendientes',\s*requireAuth, requireRole\('ADMINISTRADOR', 'COORDINADOR'\)/,
  );
});

// ── Staff counters ──────────────────────────────────────────────────────────

test('resumen: reports template status and applications waiting', async () => {
  reset({ pendientes: [10, 11, 12] });
  const svc = load('src/services/conveniosPendientes');
  hasTemplate = false;
  assert.deepEqual(await svc.resumen(2), { plantilla_activa: false, solicitudes_sin_convenio: 3 });
  hasTemplate = true;
  assert.deepEqual(await svc.resumen(2), { plantilla_activa: true, solicitudes_sin_convenio: 3 });
  assert.deepEqual(await svc.resumen(null), { plantilla_activa: true, solicitudes_sin_convenio: 0 });
});

test('plantillas list: includes the convenio summary of the active convocatoria', async () => {
  reset({ pendientes: [10] });
  hasTemplate = false;
  const svc = load('src/services/plantillasService');
  const res = mockRes();
  await svc.list(mockReq({ user: { id: 1, rol: 'COORDINADOR' } }), res);
  assert.ok(Array.isArray(res.body.tipos));
  assert.deepEqual(res.body.convenio, {
    convocatoria: '2026/2027',
    plantilla_activa: false,
    solicitudes_sin_convenio: 1,
  });
});

// ── Company view of a convenio not generated yet ────────────────────────────

test('company view: pending convenio is "en preparación" and cannot be uploaded', () => {
  const { projectItem } = load('src/services/documentosWorkflow');
  const { defByClave } = require('../src/services/documentCatalogue');
  const def = defByClave('CONVENIO');
  const ctx = { id_solicitud_empresa: 10, empresa: 'X', convocatoria: '2026/2027' };

  for (const templates of [new Set(), new Set(['CONVENIO'])]) {
    const empresa = projectItem(def, 'EMPRESA', ctx, null, [], { templates });
    assert.equal(empresa.estado_operativo_label, 'En preparación por el centro');
    assert.equal(empresa.accion_pendiente, 'Convenio: en preparación por el centro');
    assert.equal(empresa.puede_subir, false);
    assert.equal(empresa.falta_plantilla, false);
  }

  // Staff keep their wording and the missing-template detail.
  const staff = projectItem(def, 'COORDINADOR', ctx, null, [], { templates: new Set() });
  assert.equal(staff.estado_operativo_label, 'Pendiente de generar');
  assert.equal(staff.falta_plantilla, true);
  assert.match(staff.accion_pendiente, /No hay plantilla activa/);

  // Once the file exists the company can see, sign and replace it as before.
  const row = { id_documento: 7, tiene_archivo: 1, estado_validacion: 'PENDIENTE', estado_workflow: 'SUBIDO' };
  const conArchivo = projectItem(def, 'EMPRESA', ctx, row, [], { templates: new Set(['CONVENIO']) });
  assert.notEqual(conArchivo.estado_operativo_label, 'En preparación por el centro');
  assert.equal(conArchivo.puede_ver, true);
  assert.equal(conArchivo.puede_reemplazar, true);
});
