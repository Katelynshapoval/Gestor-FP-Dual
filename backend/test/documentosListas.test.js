// The document lists of each portal (documentosWorkflow): which documents a
// student, a company and the staff see, from which application or reservation,
// the newest file wins, and what each one may do with it.
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
const wf = load('src/services/documentosWorkflow');

const doc = (id, clave, padre, extra = {}) => ({
  id_documento: id, clave, estado_validacion: 'PENDIENTE', tiene_archivo: 1, origen_documento: 'SUBIDA',
  id_solicitud_alumno: null, id_solicitud_empresa: null, id_reserva: null, ...padre, ...extra,
});

function con(respuestas) {
  st = { respuestas };
  pool.calls.length = 0;
}
const plantillas = (claves) => ['FROM dual_documento_plantillas p', claves.map((clave) => ({ clave }))];
const porClave = (items) => Object.fromEntries(items.map((i) => [`${i.clave}:${i.id_reserva || i.id_solicitud_empresa || i.id_solicitud_alumno}`, i]));

// ── Student ─────────────────────────────────────────────────────────────────

test('student without an application sees nothing', async () => {
  con([]);
  assert.deepEqual(await wf.buildAlumnoList(7), []);
  assert.equal(pool.calls.length, 1);
});

test('student list: own application documents, plus annex and calendar of each live reservation (never the convenio)', async () => {
  con([
    ['WHERE sa.id_alumno = ?', [{ id_solicitud_alumno: 40, convocatoria: '2026/2027', nombre: 'Ana', dni: '1Z', especialidad: 'Joyería' }]],
    ["er.nombre <> 'CANCELADA' ORDER BY r.id_reserva DESC", [
      { id_reserva: 8, tipo_contrato: 'Beca', empresa: 'ACME', cif: 'B1', id_solicitud_empresa: 10, convocatoria: 'x', especialidad: 'Joyería' },
      { id_reserva: 9, tipo_contrato: null, empresa: 'ACME', cif: 'B1', id_solicitud_empresa: 10, convocatoria: 'x', especialidad: 'Joyería' },
    ]],
    ['FROM dual_documentos d', [
      doc(3, 'CV', { id_solicitud_alumno: 40 }, { estado_validacion: 'VALIDADO' }),
      doc(2, 'CV', { id_solicitud_alumno: 40 }, { estado_validacion: 'RECHAZADO' }),
      doc(5, 'ANEXO_III', { id_reserva: 8 }),
      doc(6, 'CONVENIO', { id_solicitud_empresa: 10 }),
    ]],
    ['FROM dual_documento_firmas', [{ id_documento: 5, rol: 'EMPRESA', estado: 'FIRMADO' }]],
  ]);
  const items = await wf.buildAlumnoList(7);
  const claves = items.map((i) => `${i.clave}:${i.id_reserva || i.id_solicitud_empresa || i.id_solicitud_alumno}`);
  assert.deepEqual(claves, ['CV:40', 'ANEXO_DGA:40', 'ANEXO_III:8', 'CALENDARIO:8', 'CALENDARIO:9'],
    'no convenio (company document); no annex until the contract type is set; hidden types never listed');
  const m = porClave(items);
  assert.equal(m['CV:40'].id_documento, 3, 'the newest file wins');
  assert.equal(m['CV:40'].estado_validacion, 'VALIDADO');
  assert.equal(m['CV:40'].puede_reemplazar, false, 'a validated CV cannot be replaced');
  assert.equal(m['ANEXO_DGA:40'].puede_subir, true);
  assert.equal(m['ANEXO_III:8'].puede_subir, false, 'students never upload the annex');
  assert.equal(m['ANEXO_III:8'].empresa, 'ACME');
  // The doc query covers the application and the reservations, not the companies.
  const q = pool.calls.find((c) => c.sql.includes('FROM dual_documentos d'));
  assert.deepEqual(q.params, [40, [8, 9, -1]]);
});

// ── Company ─────────────────────────────────────────────────────────────────

test('company list: convenio and Anexo XIV per application, annex and calendar per live reservation', async () => {
  con([
    ['WHERE se.id_empresa = ? ORDER BY c.activa DESC', [{ id_solicitud_empresa: 10, convocatoria: 'x', empresa: 'ACME', cif: 'B1' }]],
    ["WHERE se.id_empresa = ? AND er.nombre <> 'CANCELADA'", [{ id_reserva: 8, tipo_contrato: 'CONTRATO', alumno: 'Ana', dni: '1Z', id_solicitud_empresa: 10, empresa: 'ACME', cif: 'B1' }]],
    ['FROM dual_documentos d', [doc(5, 'ANEXO_II', { id_reserva: 8 })]],
    ['FROM dual_documento_firmas', [{ id_documento: 5, rol: 'EMPRESA', estado: 'PENDIENTE' }]],
    plantillas(['CONVENIO']),
  ]);
  const items = await wf.buildEmpresaList(100);
  const m = porClave(items);
  assert.deepEqual(Object.keys(m), ['CONVENIO:10', 'ANEXO_XIV:10', 'ANEXO_II:8', 'CALENDARIO:8']);
  assert.equal(m['CONVENIO:10'].estado_operativo_label, 'En preparación por el centro', 'no convenio file yet');
  assert.equal(m['CONVENIO:10'].puede_subir, false);
  assert.equal(m['CONVENIO:10'].falta_plantilla, false, 'the centre\'s template problem is not shown to the company');
  assert.equal(m['ANEXO_XIV:10'].puede_subir, true);
  assert.equal(m['ANEXO_II:8'].puede_reemplazar, true);
  assert.equal(m['ANEXO_II:8'].alumno, 'Ana');
  assert.deepEqual(pool.calls[0].params, [100]);
  assert.deepEqual(pool.calls[1].params, [100]);
});

// ── Staff ───────────────────────────────────────────────────────────────────

test('staff list: everything, with review, generation and signature actions', async () => {
  con([
    ['ORDER BY a.nombre, sa.id_solicitud_alumno DESC', [{ id_solicitud_alumno: 40, alumno: 'Ana', dni: '1Z' }]],
    ['ORDER BY emp.empresa, se.id_solicitud_empresa DESC', [{ id_solicitud_empresa: 10, empresa: 'ACME', cif: 'B1' }]],
    ["WHERE er.nombre <> 'CANCELADA'", [{ id_reserva: 8, tipo_contrato: 'CONTRATO', alumno: 'Ana', id_solicitud_empresa: 10 }]],
    ['FROM dual_documentos d', [
      doc(1, 'CV', { id_solicitud_alumno: 40 }),
      doc(5, 'ANEXO_II', { id_reserva: 8 }),
    ]],
    ['FROM dual_documento_firmas', [
      { id_documento: 5, rol: 'EMPRESA', estado: 'FIRMADO' },
      { id_documento: 5, rol: 'ALUMNO', estado: 'FIRMADO' },
    ]],
    plantillas(['CONVENIO']),
  ]);
  const items = await wf.buildStaffList();
  const m = porClave(items);
  assert.ok(m['CV:40'] && m['ANEXO_DGA:40']);
  assert.ok(m['CONVENIO:10'] && m['ANEXO_XIV:10'] && m['ANEXO_G:10'] && m['EXCEL:10']);
  assert.ok(m['ANEXO_II:8'] && m['CALENDARIO:8']);
  assert.equal(m['CV:40'].puede_revisar, true, 'an uploaded CV awaits review');
  assert.equal(m['CONVENIO:10'].puede_generar, true, 'active template and no file yet');
  assert.equal(m['CONVENIO:10'].estado_operativo_label === 'En preparación por el centro', false);
  assert.equal(m['ANEXO_II:8'].puede_firmar, true, 'the centre signs after the company and the student');
  assert.equal(m['ANEXO_II:8'].puede_revisar, false, 'no review before every signature');
});

test('staff list without a template: the centre is told the template is missing', async () => {
  con([
    ['ORDER BY emp.empresa, se.id_solicitud_empresa DESC', [{ id_solicitud_empresa: 10, empresa: 'ACME' }]],
  ]);
  const items = await wf.buildStaffList();
  const conv = items.find((i) => i.clave === 'CONVENIO');
  assert.equal(conv.puede_generar, false);
  assert.equal(conv.falta_plantilla, true);
});

// ── Helpers used by every screen ────────────────────────────────────────────

test('student validation waits for every required document to be validated', async () => {
  con([['WHERE d.id_solicitud_alumno = ?', [doc(1, 'CV', { id_solicitud_alumno: 40 }, { estado_validacion: 'VALIDADO' })]]]);
  assert.deepEqual(await wf.missingStudentValidation(40), ['Anexo DGA']);
  con([['WHERE d.id_solicitud_alumno = ?', [
    doc(1, 'CV', { id_solicitud_alumno: 40 }, { estado_validacion: 'VALIDADO' }),
    doc(2, 'ANEXO_DGA', { id_solicitud_alumno: 40 }, { estado_validacion: 'VALIDADO' }),
  ]]]);
  assert.deepEqual(await wf.missingStudentValidation(40), []);
});

test('document types are found by name, never by id', async () => {
  con([['FROM dual_tipos_documento WHERE nombre = ?', (_s, p) => (p[0] === 'CV' ? [{ id_tipo_documento: 1 }] : [])]]);
  assert.equal(await wf.tipoIdByNombre('CV'), 1);
  assert.equal(await wf.tipoIdByNombre('NADA'), null);
});

test('students see a document only from their own contexts and never hidden types', () => {
  const { defByClave } = require('../src/services/documentCatalogue');
  assert.equal(wf.alumnoMaySee(defByClave('CV'), { id_solicitud_alumno: 1 }), true);
  assert.equal(wf.alumnoMaySee(defByClave('ANEXO_XIV'), { id_solicitud_empresa: 1 }), false);
  assert.equal(wf.alumnoMaySee(defByClave('CONVENIO'), { id_solicitud_empresa: 1 }), false, 'el convenio es de la empresa');
  assert.equal(wf.alumnoMaySee(defByClave('ANEXO_2'), { id_reserva: 1 }), false, 'legacy');
  assert.equal(wf.alumnoMaySee(defByClave('CV'), {}), false);
  assert.equal(wf.alumnoMaySee(null, { id_reserva: 1 }), false);
});
