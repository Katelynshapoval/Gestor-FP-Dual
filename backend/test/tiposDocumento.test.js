// Document types added by the centre (migration 025): the catalogue turns each
// row into a document definition (parent, signers, required, contract family),
// lists and generation pick them up, the confirmation of a reservation waits
// for the required ones, and the API validates, audits and refreshes them.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let st = {};
const pool = fakePool((sql, params) => {
  for (const [match, out] of st.respuestas || []) {
    if (sql.includes(match)) return typeof out === 'function' ? out(sql, params) : out;
  }
  if (sql.startsWith('INSERT')) return { insertId: 50 };
  return [];
});
stub('src/db/pool', pool);

const cat = require('../src/services/documentCatalogue');
const reglas = load('src/services/estadoReglas');
const tipos = load('src/services/tiposDocumento');
const cfg = load('src/services/documentGenerationConfig');

const ADMIN = { id: 1, rol: 'ADMINISTRADOR' };
const fila = (extra) => ({
  id_tipo_documento: 20, nombre: 'ANEXO_IV', nombre_mostrar: 'Anexo IV', ambito: 'reserva', generado: 1,
  firma_empresa: 1, firma_centro: 1, firma_alumno: 0, requerido: 1, familia_contrato: 'beca',
  activo: 1, es_sistema: 0, orden: 110, ...extra,
});

async function llamar(fn, { params = {}, body = {}, respuestas = [] } = {}) {
  st = { respuestas };
  pool.calls.length = 0;
  const res = mockRes();
  await tipos[fn](mockReq({ params, body, user: ADMIN }), res);
  return res;
}
const escrituras = () => pool.calls.filter((c) => /^(INSERT|UPDATE)/.test(c.sql));
const eventos = () => pool.calls.filter((c) => c.sql.startsWith('INSERT INTO dual_eventos')).map((c) => [c.params[0], c.params[2]]);

test.afterEach(() => cat.setCustomTypes([]));

// ── Catalogue ───────────────────────────────────────────────────────────────

test('a custom type becomes a generated, reviewed definition with its signers and family', () => {
  cat.setCustomTypes([fila(), { ...fila({ nombre: 'CV', es_sistema: 1 }) }]);
  const def = cat.defByClave('ANEXO_IV');
  assert.equal(def.nombre, 'Anexo IV');
  assert.equal(def.custom, true);
  assert.equal(def.generated, true);
  assert.equal(def.requiresReview, true);
  assert.equal(def.required, true);
  assert.equal(def.contractFamily, 'beca');
  assert.deepEqual(def.signers, ['EMPRESA', 'GESTOR']);
  assert.deepEqual(def.actor, { GESTOR: 'review', EMPRESA: 'upload', ALUMNO: 'view' });
  assert.equal(cat.defByClave('CV').custom, undefined, 'system rows stay in the code');
  assert.ok(cat.generatedDefs().some((d) => d.clave === 'ANEXO_IV'), 'it gets a template');
});

test('who sees a custom type depends on where it belongs', () => {
  cat.setCustomTypes([
    fila({ nombre: 'A', nombre_mostrar: 'A', ambito: 'solicitud_alumno', firma_empresa: 0, firma_alumno: 1, familia_contrato: null }),
    fila({ nombre: 'E', nombre_mostrar: 'E', ambito: 'solicitud_empresa', firma_alumno: 0, familia_contrato: null }),
  ]);
  assert.deepEqual(cat.defByClave('A').actor, { GESTOR: 'review', ALUMNO: 'upload', EMPRESA: 'hidden' });
  assert.equal(cat.defByClave('A').requeridoParaValidarAlumno, true);
  assert.ok(cat.requiredForStudentValidation().some((d) => d.clave === 'A'));
  assert.deepEqual(cat.defByClave('E').actor, { GESTOR: 'review', EMPRESA: 'upload', ALUMNO: 'hidden' });
  assert.equal(cat.defByClave('E').requeridoParaValidarAlumno, false);
});

test('a reservation lists the types of its contract family; none of them before the type is set', () => {
  cat.setCustomTypes([fila(), fila({ nombre: 'TODAS', nombre_mostrar: 'Para todas', familia_contrato: null, orden: 120 })]);
  const claves = (tc) => cat.defsFor('reserva', { tipoContrato: tc }).map((d) => d.clave);
  assert.deepEqual(claves('BECA'), ['ANEXO_III', 'CALENDARIO', 'ANEXO_IV', 'TODAS']);
  assert.deepEqual(claves('CONTRATO_DE_FORMACION_EN_ALTERNANCIA'), ['ANEXO_II', 'CALENDARIO', 'TODAS']);
  assert.deepEqual(claves(null), ['CALENDARIO', 'TODAS']);
  assert.equal(cat.familiaContrato('Beca'), 'beca');
  assert.equal(cat.familiaContrato('Convenio'), 'contrato');
  assert.equal(cat.familiaContrato(''), null);
});

test('a switched-off type is no longer offered but keeps its definition', () => {
  cat.setCustomTypes([fila({ activo: 0 })]);
  assert.ok(cat.defByClave('ANEXO_IV').legacy);
  assert.ok(!cat.defsFor('reserva', { tipoContrato: 'BECA' }).some((d) => d.clave === 'ANEXO_IV'));
  assert.ok(!cat.generatedDefs().some((d) => d.clave === 'ANEXO_IV'));
});

// ── Generation data ─────────────────────────────────────────────────────────

test('templates use the fields of their parent; a reservation type checks its family', async () => {
  cat.setCustomTypes([fila()]);
  const c = cfg.generationConfig('ANEXO_IV');
  assert.deepEqual(c.variables, cfg.GENERATION.ANEXO_II.variables);
  assert.ok(cfg.variablesPorAmbito('solicitud_alumno').some((v) => v.nombre === 'dniAlumno' && v.marcador === '<<dniAlumno>>'));
  st = { respuestas: [['FROM dual_reservas r', [{ alumno: 'Ana', tipo_contrato: 'CONVENIO', nombre_mostrar: 'Convenio' }]]] };
  await assert.rejects(c.loadData({ id_reserva: 8 }), (e) => e.status === 400 && /solo corresponde a reservas de beca/.test(e.message));
  st = { respuestas: [['FROM dual_reservas r', [{ alumno: 'Ana', tipo_contrato: 'BECA', nombre_mostrar: 'Beca' }]]] };
  assert.equal((await c.loadData({ id_reserva: 8 })).alumno, 'Ana');
  assert.equal(cfg.generationConfig('EXCEL'), null, 'an uploaded type is not generated');
});

// ── Confirmation ────────────────────────────────────────────────────────────

test('a reservation is confirmed only when every required added document is there, signed and validated', () => {
  cat.setCustomTypes([fila()]);
  const def = cat.defByClave('ANEXO_IV');
  const anexoDef = cat.defByClave('ANEXO_III');
  const reserva = { estado: 'PENDIENTE', id_tipo_contrato: 1, tipo_contrato: 'BECA' };
  const anexo = { id_documento: 3, tiene_archivo: 1, estado_validacion: 'VALIDADO' };
  const firmado = ['EMPRESA', 'GESTOR', 'ALUMNO'].map((rol) => ({ rol, estado: 'FIRMADO' }));
  const confirmar = (extra) => reglas.reservaConfirmable(reserva, null, anexoDef, anexo, firmado, [{ def, ...extra }]);

  assert.equal(confirmar({ row: null, firmas: [] }).code, 'DOCUMENTO_FALTA');
  const fichero = { id_documento: 9, tiene_archivo: 1, estado_validacion: 'PENDIENTE' };
  assert.equal(confirmar({ row: fichero, firmas: [{ rol: 'EMPRESA', estado: 'FIRMADO' }] }).code, 'FIRMAS_PENDIENTES');
  assert.equal(confirmar({ row: fichero, firmas: firmado }).code, 'DOCUMENTO_SIN_VALIDAR');
  assert.equal(confirmar({ row: { ...fichero, estado_validacion: 'VALIDADO' }, firmas: firmado }), null);
});

test('changing beca ↔ contrato is refused while an added document of that family is under review', () => {
  cat.setCustomTypes([fila()]);
  const reserva = { estado: 'PENDIENTE', tipo_contrato: 'BECA' };
  const denied = reglas.tipoContratoCambiable(reserva, 'CONVENIO', [{ clave: 'ANEXO_IV', tiene_archivo: 1, estado_validacion: 'PENDIENTE' }]);
  assert.equal(denied.code, 'ANEXO_EXISTENTE');
  assert.match(denied.error, /«Anexo IV»/);
  assert.equal(reglas.tipoContratoCambiable(reserva, 'CONVENIO', [{ clave: 'ANEXO_IV', tiene_archivo: 1, estado_validacion: 'RECHAZADO' }]), null);
});

// ── API ─────────────────────────────────────────────────────────────────────

test('names become internal keys without accents or symbols', () => {
  assert.equal(tipos.claveDesde('Anexo IV (prácticas)'), 'ANEXO_IV_PRACTICAS');
  assert.equal(tipos.claveDesde('  ñ  '), 'N');
  assert.equal(tipos.claveDesde('***'), 'DOCUMENTO');
});

test('validation: name, parent, consistent signers; the family only for reservations', () => {
  const v = (body) => { try { return tipos.validar(body); } catch (e) { return e.message; } };
  assert.match(v({ nombre: 'x', ambito: 'reserva' }), /nombre/);
  assert.match(v({ nombre: 'A'.repeat(81), ambito: 'reserva' }), /80/);
  assert.match(v({ nombre: 'Doc <b>', ambito: 'reserva' }), /no permitidos/);
  assert.match(v({ nombre: 'Doc', ambito: 'empleo' }), /a qué pertenece/);
  assert.match(v({ nombre: 'Doc', ambito: 'solicitud_empresa', firma_alumno: true }), /alumno no firma/);
  assert.match(v({ nombre: 'Doc', ambito: 'solicitud_alumno', firma_empresa: true }), /empresa no firma/);
  assert.match(v({ nombre: 'Doc', ambito: 'reserva', familia_contrato: 'otro' }), /contrato no válido/);
  assert.equal(v({ nombre: 'Doc', ambito: 'solicitud_empresa', familia_contrato: 'beca' }).familia, null);
  const ok = v({ nombre: '  Anexo   IV ', ambito: 'reserva', firma_empresa: true, requerido: '1', familia_contrato: 'todos' });
  assert.deepEqual(ok, { nombre: 'Anexo IV', ambito: 'reserva', firma: { empresa: true, centro: false, alumno: false }, requerido: true, familia: null, activo: true });
});

test('create: unique name, free key, audited, catalogue refreshed', async () => {
  let res = await llamar('create', { body: { nombre: 'Anexo IV', ambito: 'reserva' }, respuestas: [['LOWER(nombre_mostrar) = LOWER(?)', [{ id_tipo_documento: 3 }]]] });
  assert.equal(res.statusCode, 409);
  assert.equal(escrituras().length, 0);

  res = await llamar('create', {
    body: { nombre: 'Anexo IV', ambito: 'reserva', firma_empresa: true, firma_centro: true, requerido: true, familia_contrato: 'beca' },
    respuestas: [
      ['WHERE nombre LIKE ?', [{ nombre: 'ANEXO_IV' }]],
      ['COALESCE(MAX(orden), 100) + 10', [{ orden: 110 }]],
      ['SELECT * FROM dual_tipos_documento', [fila({ nombre: 'ANEXO_IV_2' })]],
    ],
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(res.body.clave, 'ANEXO_IV_2', 'the key is free even when the name was used before');
  const ins = pool.calls.find((c) => c.sql.startsWith('INSERT INTO dual_tipos_documento'));
  assert.deepEqual(ins.params, ['ANEXO_IV_2', 'Anexo IV', 'reserva', true, true, false, true, 'beca', true, 110]);
  assert.deepEqual(eventos(), [['TIPO_DOCUMENTO', 'CREAR']]);
  assert.ok(pool.calls.some((c) => c.sql === 'COMMIT'));
  assert.ok(cat.defByClave('ANEXO_IV_2'), 'the catalogue knows it right away');
});

test('update: system types are read-only; the parent is fixed once documents exist; switching off is its own event', async () => {
  let res = await llamar('update', { params: { clave: 'cv' }, body: { nombre: 'Currículum' }, respuestas: [['FOR UPDATE', [fila({ nombre: 'CV', es_sistema: 1 })]]] });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /sistema/);

  res = await llamar('update', {
    params: { clave: 'anexo_iv' }, body: { ambito: 'solicitud_empresa', firma_alumno: false },
    respuestas: [['FOR UPDATE', [fila()]], ['COUNT(*) AS n FROM dual_documentos', [{ n: 2 }]]],
  });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /Ya hay documentos/);
  assert.equal(escrituras().length, 0);

  res = await llamar('update', { params: { clave: 'ANEXO_IV' }, body: { activo: false }, respuestas: [['FOR UPDATE', [fila()]]] });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(eventos(), [['TIPO_DOCUMENTO', 'DESACTIVAR']]);
  const ev = pool.calls.find((c) => c.sql.startsWith('INSERT INTO dual_eventos'));
  assert.deepEqual(JSON.parse(ev.params[8]), { clave: 'ANEXO_IV', antes: { activo: true }, despues: { activo: false } });

  res = await llamar('update', { params: { clave: 'ANEXO_IV' }, body: { nombre: 'Anexo IV' }, respuestas: [['FOR UPDATE', [fila()]]] });
  assert.equal(res.statusCode, 200);
  assert.equal(escrituras().length, 0, 'no change, nothing written');
});

test('loading before migration 025 keeps the system types only', async () => {
  st = { respuestas: [['SELECT * FROM dual_tipos_documento', () => { const e = new Error('x'); e.code = 'ER_BAD_FIELD_ERROR'; throw e; }]] };
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await tipos.cargar(), 0);
  } finally {
    console.warn = warn;
  }
  assert.equal(cat.allDefs().length, cat.CATALOGUE.length);
});

test('lists: a reservation shows the added type to staff (to generate) and to the company (in preparation)', async () => {
  cat.setCustomTypes([fila()]);
  const wf = load('src/services/documentosWorkflow');
  st = { respuestas: [['WHERE p.es_activa = 1', [{ clave: 'ANEXO_IV' }]]] };
  const reserva = { id_reserva: 8, tipo_contrato_clave: 'BECA', tipo_contrato: 'Beca', estado_reserva: 'PENDIENTE' };
  const staff = await wf.reservaDocumentos(reserva, 'ADMINISTRADOR');
  assert.deepEqual(staff.map((d) => d.clave), ['ANEXO_III', 'CALENDARIO', 'ANEXO_IV']);
  const iv = staff.find((d) => d.clave === 'ANEXO_IV');
  assert.equal(iv.puede_generar, true);
  assert.equal(iv.requerido, true);
  assert.equal(iv.personalizado, true);
  assert.equal(iv.tipo_contrato, 'Beca');

  const empresa = (await wf.reservaDocumentos(reserva, 'EMPRESA')).find((d) => d.clave === 'ANEXO_IV');
  assert.equal(empresa.estado_operativo_label, 'En preparación por el centro');
  assert.equal(empresa.puede_subir, false);
  assert.equal(empresa.falta_plantilla, false);

  const contrato = await wf.reservaDocumentos({ ...reserva, tipo_contrato_clave: 'CONVENIO' }, 'ADMINISTRADOR');
  assert.ok(!contrato.some((d) => d.clave === 'ANEXO_IV'), 'not on a contrato reservation');
});
