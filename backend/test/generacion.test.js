// Document generation: the data each template receives (convenio, Anexo II/III),
// when a document may be generated or regenerated, and the PDF conversion
// (no scripts, no outside requests, browser always closed). The DOCX engine,
// mammoth and puppeteer are replaced, so no browser is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool } = require('./helpers/harness');

let st = {};
const pool = fakePool((sql, params) => {
  for (const [match, out] of st.respuestas || []) {
    if (sql.includes(match)) return typeof out === 'function' ? out(sql, params) : out;
  }
  return [];
});
stub('src/db/pool', pool);

const informes = [];
stub('docx-templates', {
  createReport: async (opts) => {
    informes.push(opts);
    // Exercise the command resolver the way docx-templates calls it.
    const sandbox = { ...opts.data, __code__: 'razonSocial' };
    informes.at(-1).resuelto = opts.runJs({ sandbox }).result;
    return Buffer.from('docx-relleno');
  },
});
stub('mammoth', { convertToHtml: async ({ buffer }) => ({ value: `<p>${buffer.toString()}</p>` }) });
const navegador = { pages: [], cerrado: 0 };
stub('puppeteer', {
  launch: async () => ({
    newPage: async () => {
      const page = {
        js: true, intercept: false, handlers: {}, content: null,
        async setJavaScriptEnabled(v) { this.js = v; },
        async setRequestInterception(v) { this.intercept = v; },
        on(ev, fn) { this.handlers[ev] = fn; },
        async setContent(html) { if (st.falloPdf) throw new Error('render'); this.content = html; },
        async pdf(opts) { this.pdfOpts = opts; return Buffer.from('%PDF-gen'); },
      };
      navegador.pages.push(page);
      return page;
    },
    close: async () => { navegador.cerrado += 1; },
  }),
});
const guardados = [];
stub('src/services/documentosStore', {
  saveByClave: async (clave, parents, pdf, meta) => { guardados.push({ clave, parents, meta }); return 555; },
});
const realED = require('../src/services/empresaDatos');
stub('src/services/empresaDatos', {
  ...realED,
  loadEmpresaDatosRead: async () => st.empresa || null,
});

const gen = load('src/services/documentGenerationService');
const cfg = load('src/services/documentGenerationConfig');

const EMPRESA = {
  empresa: 'ACME S.L.', nombreRepresentante: 'Ana', dniRepresentante: '12345678Z', domicilioLegal: 'C/ Mayor 1',
  cpLegal: '50001', localidadLegal: 'Zaragoza', provinciaLegal: '', cif: 'B12345674', cargoRepresentante: 'Gerente',
  convocatoria: '2026/2027', emailCoordinador: 'l@acme.test',
};
const RESERVA = {
  alumno: 'Luis', dni_alumno: '1Z', empresa: 'ACME', cif: 'B1', especialidad: 'Joyería', codigo_especialidad: 'JOY',
  tipo_contrato: 'CONTRATO_FORMACION', nombre_mostrar: 'Contrato de formación', convocatoria: '2026/2027',
  tutor_nombre: null, tutor_email: 'p@acme.test', tutor_telefono: null,
};

// ── Data for each template ──────────────────────────────────────────────────

test('convenio data: company, representative, address, ciclos and the coordinator email', async () => {
  st = { empresa: EMPRESA, respuestas: [['FROM dual_solicitud_empresa_especialidades see', [{ codigo: 'DAW' }, { codigo: 'JOY' }]]] };
  const data = await cfg.generationConfig('convenio').loadData({ id_solicitud_empresa: 10 });
  assert.equal(data.razonSocial, 'ACME S.L.');
  assert.equal(data.dirRazSocial, 'C/ Mayor 1, 50001, Zaragoza', 'empty parts are skipped');
  assert.equal(data.specialities, 'DAW, JOY');
  assert.equal(data.emailCoordinador, 'l@acme.test');
  for (const v of cfg.GENERATION.CONVENIO.variables) assert.ok(v in data, `the template variable ${v} is filled`);
  st = { empresa: null };
  await assert.rejects(cfg.GENERATION.CONVENIO.loadData({ id_solicitud_empresa: 10 }), (e) => e.status === 404);
});

test('annex data: student, company, ciclo, contract and tutor; only the annex the contract needs', async () => {
  st = { respuestas: [['WHERE r.id_reserva = ?', [RESERVA]]] };
  const data = await cfg.GENERATION.ANEXO_II.loadData({ id_reserva: 8 });
  assert.deepEqual([data.alumno, data.tipoContrato, data.tutor, data.emailTutor, data.telefonoTutor], ['Luis', 'Contrato de formación', '', 'p@acme.test', '']);
  for (const v of cfg.GENERATION.ANEXO_II.variables) assert.ok(v in data, v);
  await assert.rejects(cfg.GENERATION.ANEXO_III.loadData({ id_reserva: 8 }), (e) => e.status === 400 && /Anexo II/.test(e.message));
  st = { respuestas: [['WHERE r.id_reserva = ?', [{ ...RESERVA, tipo_contrato: null }]]] };
  await assert.rejects(cfg.GENERATION.ANEXO_II.loadData({ id_reserva: 8 }), (e) => e.status === 400 && /tipo de contrato/.test(e.message));
  st = { respuestas: [] };
  await assert.rejects(cfg.GENERATION.ANEXO_II.loadData({ id_reserva: 8 }), (e) => e.status === 404);
  assert.deepEqual(cfg.generatableClaves(), ['CONVENIO', 'ANEXO_II', 'ANEXO_III']);
  assert.equal(cfg.generationConfig('CV'), null);
  assert.equal(cfg.generationConfig(undefined), null);
});

// ── When a document is generated ────────────────────────────────────────────

const PLANTILLA = { id_plantilla: 3, archivo: Buffer.from('plantilla'), nombre_archivo: 'c.docx', version: 2, clave: 'CONVENIO' };
const conPlantilla = (extra = []) => [['FROM dual_documento_plantillas p', [PLANTILLA]], ...extra];
const actual = (fila) => ['WHERE d.id_solicitud_empresa = ? AND d.id_tipo_documento = ?', fila ? [fila] : []];

test('only template documents; without an active template nothing is generated', async () => {
  await assert.rejects(gen.generateDocument({ clave: 'CV', parents: {} }), (e) => e.status === 400);
  st = { respuestas: [] };
  const out = await gen.generateDocument({ clave: 'CONVENIO', parents: { id_solicitud_empresa: 10 } });
  assert.deepEqual(out, { ok: false, code: 'SIN_PLANTILLA', clave: 'CONVENIO' });
});

test('an existing document is regenerated only on request, and never once validated', async () => {
  st = { empresa: EMPRESA, respuestas: conPlantilla([['FROM dual_tipos_documento WHERE nombre', [{ id_tipo_documento: 3 }]], actual({ id_documento: 9, tiene_archivo: 1, estado_validacion: 'PENDIENTE' })]) };
  await assert.rejects(gen.generateDocument({ clave: 'CONVENIO', parents: { id_solicitud_empresa: 10 } }), (e) => e.status === 409);
  st.respuestas = conPlantilla([['FROM dual_tipos_documento WHERE nombre', [{ id_tipo_documento: 3 }]], actual({ id_documento: 9, tiene_archivo: 1, estado_validacion: 'VALIDADO' })]);
  await assert.rejects(gen.generateDocument({ clave: 'CONVENIO', parents: { id_solicitud_empresa: 10 }, regenerar: true }), (e) => e.status === 400);
  assert.equal(guardados.length, 0);
});

test('generation fills the active template, converts it to PDF and stores it with its origin', async () => {
  guardados.length = 0;
  informes.length = 0;
  st = { empresa: EMPRESA, respuestas: conPlantilla([['FROM dual_tipos_documento WHERE nombre', [{ id_tipo_documento: 3 }]]]) };
  const out = await gen.generateDocument({ clave: 'CONVENIO', parents: { id_solicitud_empresa: 10 }, userId: 1, userRol: 'ADMINISTRADOR' });
  assert.equal(out.ok, true);
  assert.deepEqual([out.id_documento, out.id_plantilla, out.plantilla_version, out.email, out.empresa], [555, 3, 2, 'l@acme.test', 'ACME S.L.']);
  assert.equal(out.pdf.toString(), '%PDF-gen');
  assert.deepEqual(informes[0].cmdDelimiter, ['<<', '>>']);
  assert.equal(informes[0].template, PLANTILLA.archivo);
  assert.equal(informes[0].resuelto, 'ACME S.L.', 'template commands only read values');
  assert.deepEqual(guardados[0], {
    clave: 'CONVENIO', parents: { id_solicitud_empresa: 10 },
    meta: { origen: 'GENERADO', idUsuario: 1, rol: 'ADMINISTRADOR', idPlantilla: 3 },
  });
});

// ── PDF conversion ──────────────────────────────────────────────────────────

test('PDF conversion: no scripts, only data: and about:blank requests, A4 with margins', async () => {
  navegador.pages.length = 0;
  navegador.cerrado = 0;
  st = {};
  const pdf = await gen.docxBufferToPdf(Buffer.from('hola'));
  assert.equal(pdf.toString(), '%PDF-gen');
  const page = navegador.pages[0];
  assert.equal(page.js, false);
  assert.equal(page.intercept, true);
  assert.equal(page.content, '<p>hola</p>');
  assert.equal(page.pdfOpts.format, 'A4');
  const peticion = (url) => {
    const r = { url: () => url, estado: null, continue() { this.estado = 'ok'; }, abort() { this.estado = 'bloqueada'; } };
    page.handlers.request(r);
    return r.estado;
  };
  assert.equal(peticion('data:image/png;base64,AAA'), 'ok');
  assert.equal(peticion('about:blank'), 'ok');
  assert.equal(peticion('http://169.254.169.254/latest/meta-data'), 'bloqueada');
  assert.equal(peticion('https://example.com/x.png'), 'bloqueada');
  assert.equal(peticion('file:///etc/passwd'), 'bloqueada');
  assert.equal(navegador.cerrado, 1);
});

test('PDF conversion: the browser is closed even when rendering fails', async () => {
  navegador.cerrado = 0;
  st = { falloPdf: true };
  await assert.rejects(gen.docxBufferToPdf(Buffer.from('x')), /render/);
  assert.equal(navegador.cerrado, 1);
});
