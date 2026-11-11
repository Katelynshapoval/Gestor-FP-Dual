// The staff «Documentos › Seguimiento» page: filters, search, order, paging,
// counters and the filter options (documentStaffQuery), plus the reservation
// helpers used by the reservation detail and badges (documentosWorkflow).
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool } = require('./helpers/harness');
const q = require('../src/services/documentStaffQuery');

const item = (extra) => ({
  clave: 'CV', nombre: 'CV', contexto: 'solicitud_alumno', id_convocatoria: 5, convocatoria: '2026/2027',
  estado_operativo: 'PENDIENTE_VALIDACION', estado_operativo_label: 'Pendiente de validar',
  accion_pendiente_de: ['CENTRO'], id_alumno: 1, alumno: 'Ana', dni: '1Z', id_empresa: null, empresa: null,
  id_especialidad: 2, especialidad: 'Joyería', id_solicitud_alumno: 40, id_documento: 1, fecha: null, ...extra,
});

test('query parsing: safe defaults for page, size and every filter', () => {
  assert.deepEqual(q.parseStaffQuery(), {
    page: 1, pageSize: 10, search: '', convocatoria: '', documento: '', estado: '', accionPendiente: '',
    alumno: '', empresa: '', especialidad: '', contexto: '',
  });
  const p = q.parseStaffQuery({ page: '3', pageSize: '50', search: '  ANA ', estado: ' VALIDADO ' });
  assert.deepEqual([p.page, p.pageSize, p.search, p.estado], [3, 50, 'ana', 'VALIDADO']);
  assert.equal(q.parseStaffQuery({ pageSize: '1000' }).pageSize, 10, 'only 10, 20 or 50');
  assert.equal(q.parseStaffQuery({ page: '-2' }).page, 1);
  assert.equal(q.parseStaffQuery({ page: 'x' }).page, 1);
});

const ITEMS = [
  item({ id_documento: 1, alumno: 'Ana', estado_operativo: 'VALIDADO', estado_operativo_label: 'Validado', accion_pendiente_de: [] }),
  item({ id_documento: 2, alumno: 'Luis', dni: '2X', id_alumno: 2 }),
  item({ id_documento: 3, clave: 'CONVENIO', nombre: 'Convenio', contexto: 'solicitud_empresa', alumno: null, dni: null, id_alumno: null,
    id_empresa: 100, empresa: 'ACME', cif: 'B12345674', estado_operativo: 'PENDIENTE_FIRMA', accion_pendiente_de: ['EMPRESA'] }),
  item({ id_documento: 4, id_convocatoria: 4, convocatoria: '2025/2026', estado_operativo: 'RECHAZADO', accion_pendiente_de: ['ALUMNO'] }),
];

test('page: items needing action first, newest convocatoria first, then by activity', () => {
  const page = q.buildStaffPage(ITEMS, {});
  // 3 and 2 tie (action needed, same convocatoria, no date): stable order by document key, CONVENIO < CV.
  assert.deepEqual(page.items.map((i) => i.id_documento), [3, 2, 4, 1]);
  assert.deepEqual(page.pagination, { page: 1, pageSize: 10, totalItems: 4, totalPages: 1 });
  assert.deepEqual(page.summary, { total: 4, pendientes: 3, accionCentro: 1 });
  const fechas = q.buildStaffPage([
    item({ id_documento: 7, fecha: '2026-01-01' }), item({ id_documento: 8, fecha: '2026-03-01' }), item({ id_documento: 9, fecha: 'no-fecha' }),
  ], {});
  assert.deepEqual(fechas.items.map((i) => i.id_documento), [8, 7, 9]);
});

test('filters by convocatoria (id or name), document, state, student, company, ciclo, context and pending party', () => {
  const ids = (query) => q.buildStaffPage(ITEMS, query).items.map((i) => i.id_documento).sort();
  assert.deepEqual(ids({ convocatoria: '4' }), [4]);
  assert.deepEqual(ids({ convocatoria: '2025/2026' }), [4]);
  assert.deepEqual(ids({ documento: 'CONVENIO' }), [3]);
  assert.deepEqual(ids({ documento: 'Convenio' }), [3]);
  assert.deepEqual(ids({ estado: 'VALIDADO' }), [1]);
  assert.deepEqual(ids({ estado: 'Validado' }), [1]);
  assert.deepEqual(ids({ alumno: '2' }), [2]);
  assert.deepEqual(ids({ empresa: 'ACME' }), [3]);
  assert.deepEqual(ids({ especialidad: '2' }), [1, 2, 3, 4]);
  assert.deepEqual(ids({ contexto: 'solicitud_empresa' }), [3]);
  assert.deepEqual(ids({ accionPendiente: 'ALUMNO' }), [4]);
  assert.deepEqual(ids({ accionPendiente: 'NINGUNA' }), [1]);
});

test('search looks at student, DNI, company, CIF and document name, ignoring case', () => {
  const ids = (search) => q.buildStaffPage(ITEMS, { search }).items.map((i) => i.id_documento).sort();
  assert.deepEqual(ids('luis'), [2]);
  assert.deepEqual(ids('2x'), [2]);
  assert.deepEqual(ids('b12345674'), [3]);
  assert.deepEqual(ids('convenio'), [3]);
  assert.deepEqual(ids('nadie'), []);
});

test('paging: a page past the end shows the last one; an empty result has no pages', () => {
  const muchos = Array.from({ length: 23 }, (_, i) => item({ id_documento: i + 1, accion_pendiente_de: [] }));
  let page = q.buildStaffPage(muchos, { page: '3', pageSize: '10' });
  assert.equal(page.items.length, 3);
  assert.deepEqual(page.pagination, { page: 3, pageSize: 10, totalItems: 23, totalPages: 3 });
  page = q.buildStaffPage(muchos, { page: '9' });
  assert.equal(page.pagination.page, 3);
  page = q.buildStaffPage(muchos, { search: 'zzz' });
  assert.deepEqual(page.pagination, { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 });
  assert.deepEqual(page.items, []);
});

test('filter options: unique, sorted, scoped to the convocatoria; state counts ignore the state filter', () => {
  const page = q.buildStaffPage(ITEMS, { convocatoria: '5', estado: 'VALIDADO' });
  assert.deepEqual(page.filtros.convocatorias, [{ value: '5', label: '2026/2027' }, { value: '4', label: '2025/2026' }]);
  assert.deepEqual(page.filtros.documentos.map((o) => o.value), ['CONVENIO', 'CV']);
  assert.deepEqual(page.filtros.alumnos.map((o) => o.label), ['Ana', 'Luis']);
  assert.deepEqual(page.filtros.empresas, [{ value: '100', label: 'ACME' }]);
  assert.deepEqual(page.filtros.estados.map((o) => [o.value, o.count]), [
    ['PENDIENTE_VALIDACION', 1], ['PENDIENTE_FIRMA', 1], ['VALIDADO', 1],
  ]);
  assert.equal(page.filtros.contextos.length, 3);
  assert.deepEqual(page.filtros.acciones.map((o) => o.value), ['CENTRO', 'ALUMNO', 'EMPRESA', 'NINGUNA']);
});

// ── Reservation helpers ─────────────────────────────────────────────────────

let respuestas = [];
const pool = fakePool((sql, params) => {
  for (const [match, out] of respuestas) if (sql.includes(match)) return typeof out === 'function' ? out(sql, params) : out;
  return [];
});
stub('src/db/pool', pool);
const wf = load('src/services/documentosWorkflow');
const fila = (id, clave, idReserva, extra = {}) => ({
  id_documento: id, clave, id_reserva: idReserva, id_solicitud_alumno: null, id_solicitud_empresa: null,
  estado_validacion: 'PENDIENTE', tiene_archivo: 1, ...extra,
});

test('reservation documents: the annex of its contract and the calendar; a cancelled one is read-only', async () => {
  respuestas = [['FROM dual_documentos d', [fila(5, 'ANEXO_II', 8)]]];
  const reserva = { id_reserva: 8, tipo_contrato_clave: 'CONTRATO', tipo_contrato: 'Contrato', estado_reserva: 'PENDIENTE', empresa: 'ACME' };
  let items = await wf.reservaDocumentos(reserva, 'EMPRESA');
  assert.deepEqual(items.map((i) => i.clave), ['ANEXO_II', 'CALENDARIO']);
  assert.equal(items[0].tipo_contrato, 'Contrato');
  assert.equal(items[1].tipo_contrato, null);
  assert.equal(items[0].puede_reemplazar, true);

  items = await wf.reservaDocumentos({ ...reserva, estado_reserva: 'CANCELADA' }, 'EMPRESA');
  for (const i of items) {
    assert.deepEqual([i.puede_subir, i.puede_reemplazar, i.puede_firmar, i.puede_revisar, i.accion_pendiente, i.requiere_accion_actual],
      [false, false, false, false, null, false], i.clave);
  }
  items = await wf.reservaDocumentos({ ...reserva, tipo_contrato_clave: null }, 'ADMINISTRADOR');
  assert.deepEqual(items.map((i) => i.clave), ['CALENDARIO'], 'no annex until the contract type is set');
});

test('reservation badges: annex and calendar state, with the signatures still missing', async () => {
  assert.deepEqual(await wf.reservaDocSummary([]), {});
  respuestas = [
    ['FROM dual_documentos d', [fila(5, 'ANEXO_III', 8)]],
    ['FROM dual_documento_firmas', [{ id_documento: 5, rol: 'EMPRESA', estado: 'FIRMADO' }]],
  ];
  const out = await wf.reservaDocSummary([{ id_reserva: 8, tipo_contrato_clave: 'Beca' }, { id_reserva: 9, tipo_contrato_clave: null }]);
  assert.equal(out[8].anexo.clave, 'ANEXO_III');
  assert.equal(out[8].anexo.id_documento, 5);
  assert.deepEqual(out[8].anexo.firmas_pendientes.sort(), ['ALUMNO', 'GESTOR']);
  assert.equal(out[9].anexo, null);
  assert.equal(out[9].calendario.id_documento, null);
});

test('reservation history: earlier versions and legacy documents, labelled', async () => {
  respuestas = [['AND (d.es_actual = 0 OR td.nombre IN (?))', [
    { id_documento: 3, clave: 'ANEXO_II', estado_validacion: 'RECHAZADO', tiene_archivo: 1, motivo: 'firma' },
    { id_documento: 2, clave: 'ANEXO_H', estado_validacion: 'VALIDADO', tiene_archivo: 0 },
  ]]];
  const hist = await wf.reservaHistorial(8);
  assert.deepEqual(hist.map((h) => [h.id_documento, h.nombre, h.motivo_historial, h.tiene_archivo]), [
    [3, 'Anexo II', 'VERSION_ANTERIOR', true],
    [2, 'Anexo H (histórico)', 'LEGACY', false],
  ]);
  const call = pool.calls.at(-1);
  assert.equal(call.params[0], 8);
  assert.ok(call.params[1].includes('ANEXO_H'));
});

test('student rows get their documents and whether the application can be validated now', async () => {
  assert.deepEqual(await wf.attachSolicitudDocumentos([], 'GESTOR'), []);
  const val = (id, clave) => ({ id_documento: id, clave, id_solicitud_alumno: 40, estado_validacion: 'VALIDADO', tiene_archivo: 1 });
  respuestas = [['FROM dual_documentos d', [val(1, 'CV'), val(2, 'ANEXO_DGA')]]];
  let [row] = await wf.attachSolicitudDocumentos([{ id_solicitud_alumno: 40, estado_validacion: 'PENDIENTE' }], 'GESTOR');
  assert.deepEqual(row.documentos.map((d) => d.clave), ['CV', 'ANEXO_DGA']);
  assert.equal(row.puede_validar_solicitud, true);
  [row] = await wf.attachSolicitudDocumentos([{ id_solicitud_alumno: 40, estado_validacion: 'VALIDADO' }], 'GESTOR');
  assert.equal(row.puede_validar_solicitud, false, 'already validated');
  respuestas = [['FROM dual_documentos d', [val(1, 'CV')]]];
  [row] = await wf.attachSolicitudDocumentos([{ id_solicitud_alumno: 40, estado_validacion: 'PENDIENTE' }], 'GESTOR');
  assert.equal(row.puede_validar_solicitud, false, 'Anexo DGA missing');
});

test('the staff page is built from the full staff list', async () => {
  respuestas = [['ORDER BY emp.empresa, se.id_solicitud_empresa DESC', [{ id_solicitud_empresa: 10, empresa: 'ACME', id_convocatoria: 5, convocatoria: 'x' }]]];
  const page = await wf.queryStaffPage({ documento: 'CONVENIO' });
  assert.deepEqual(page.items.map((i) => i.clave), ['CONVENIO']);
});
