// Documents: the single upload guard (type, role, owner, reservation state,
// contract family, validated files), uploads per endpoint, signatures and
// generation from templates.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let st = {};
const pool = fakePool((sql, params) => {
  for (const [match, out] of st.respuestas || []) {
    if (sql.includes(match)) return typeof out === 'function' ? out(sql, params) : out;
  }
  if (sql.includes('SELECT d.idempresa FROM dual_usuarios u')) return st.empresa ? [{ idempresa: st.empresa }] : [];
  if (sql.includes('SELECT u.id_alumno FROM dual_usuarios u')) return st.alumno ? [{ id_alumno: st.alumno }] : [];
  if (sql.startsWith('SELECT id_alumno FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ?')) {
    return st.solAlumno ? [{ id_alumno: st.solAlumno }] : [];
  }
  if (sql.startsWith('SELECT id_empresa FROM dual_solicitudes_empresa WHERE id_solicitud_empresa = ?')) {
    return st.solEmpresa ? [{ id_empresa: st.solEmpresa }] : [];
  }
  if (sql.startsWith('SELECT se.id_empresa, tc.nombre AS tipo_contrato, er.nombre AS estado_reserva')) {
    return st.reserva ? [st.reserva] : [];
  }
  if (sql.startsWith('SELECT tc.nombre AS tipo_contrato FROM dual_reservas r')) {
    return st.reserva ? [{ tipo_contrato: st.reserva.tipo_contrato }] : [];
  }
  if (sql.startsWith('SELECT ev.nombre AS estado FROM dual_documentos d')) return st.actual ? [{ estado: st.actual }] : [];
  if (sql.startsWith('SELECT id_tipo_documento FROM dual_tipos_documento')) return [{ id_tipo_documento: 11 }];
  return [];
});
stub('src/db/pool', pool);
const guardados = [];
stub('src/services/documentosStore', {
  saveByClave: async (clave, padres, buffer, origen) => {
    if (st.falloGuardar) throw st.falloGuardar;
    guardados.push({ clave, padres, origen });
    return 900;
  },
});
const generados = [];
stub('src/services/documentGenerationService', {
  generateDocument: async (a) => {
    if (st.falloGenerar) throw st.falloGenerar;
    generados.push(a);
    return st.generado || { ok: true, id_documento: 901, pdf: Buffer.from('%PDF') };
  },
});
const avisos = [];
stub('src/services/notificaciones', new Proxy({}, { get: (_t, n) => (...a) => { avisos.push([n, ...a]); } }));

const svc = load('src/services/documentosService');

const ADMIN = { id: 1, rol: 'ADMINISTRADOR' };
const EMPRESA = { id: 3, rol: 'EMPRESA' };
const ALUMNO = { id: 4, rol: 'ALUMNO' };
const file = { buffer: Buffer.from('%PDF-1.4') };

async function llamar(fn, { user = ADMIN, params = {}, body = {}, query = {}, sinArchivo = false, ...estado } = {}) {
  st = { empresa: 100, alumno: 7, solAlumno: 7, solEmpresa: 100, ...estado };
  for (const l of [guardados, generados, avisos, pool.calls]) l.length = 0;
  const res = mockRes();
  await svc[fn](mockReq({ params, body, query, user, file: sinArchivo ? undefined : file }), res);
  return res;
}

// ── Upload guard ────────────────────────────────────────────────────────────

test('student upload: own application only, and only student document types', async () => {
  let res = await llamar('uploadAlumno', { user: ALUMNO, params: { idSolicitud: '40', tipo: 'cv' } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(guardados[0], {
    clave: 'CV', padres: { id_solicitud_alumno: 40, id_solicitud_empresa: null, id_reserva: null },
    origen: { origen: 'SUBIDA', idUsuario: 4, rol: 'ALUMNO' },
  });
  res = await llamar('uploadAlumno', { user: ALUMNO, params: { idSolicitud: '40', tipo: 'anexo-dga' } });
  assert.equal(guardados[0].clave, 'ANEXO_DGA', 'dashes accepted in the type');

  res = await llamar('uploadAlumno', { user: ALUMNO, params: { idSolicitud: '40', tipo: 'cv' }, solAlumno: 8 });
  assert.equal(res.statusCode, 403);
  res = await llamar('uploadAlumno', { user: ALUMNO, params: { idSolicitud: '40', tipo: 'cv' }, alumno: null });
  assert.equal(res.statusCode, 404);
  res = await llamar('uploadAlumno', { user: ALUMNO, params: { idSolicitud: '40', tipo: 'convenio' } });
  assert.equal(res.statusCode, 400);
  res = await llamar('uploadAlumno', { user: ALUMNO, params: { idSolicitud: '40', tipo: 'no-existe' } });
  assert.equal(res.statusCode, 400);
  res = await llamar('uploadAlumno', { user: ALUMNO, params: { idSolicitud: 'x', tipo: 'cv' } });
  assert.equal(res.statusCode, 400);
  res = await llamar('uploadAlumno', { user: ALUMNO, params: { idSolicitud: '40', tipo: 'cv' }, solAlumno: null });
  assert.equal(res.statusCode, 404);
  assert.equal(guardados.length, 0);
});

test('an upload needs a file; a validated document cannot be replaced', async () => {
  let res = await llamar('uploadAlumno', { user: ALUMNO, params: { idSolicitud: '40', tipo: 'cv' }, sinArchivo: true });
  assert.equal(res.statusCode, 400);
  assert.equal(pool.calls.length, 0);
  res = await llamar('uploadAlumno', { user: ALUMNO, params: { idSolicitud: '40', tipo: 'cv' }, actual: 'VALIDADO' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /validado no se puede reemplazar/);
  res = await llamar('uploadAlumno', { user: ALUMNO, params: { idSolicitud: '40', tipo: 'cv' }, actual: 'RECHAZADO' });
  assert.equal(res.statusCode, 200);
});

test('a role the catalogue does not allow is refused (staff never upload a student\'s CV)', async () => {
  const res = await llamar('uploadAlumno', { user: ADMIN, params: { idSolicitud: '40', tipo: 'cv' } });
  assert.equal(res.statusCode, 403);
  assert.equal(guardados.length, 0);
});

test('company convenio upload: its own application only', async () => {
  let res = await llamar('uploadEmpresa', { user: EMPRESA, params: { idSolicitud: '10' } });
  assert.equal(res.statusCode, 200);
  assert.equal(guardados[0].padres.id_solicitud_empresa, 10);
  res = await llamar('uploadEmpresa', { user: EMPRESA, params: { idSolicitud: '10' }, solEmpresa: 200 });
  assert.equal(res.statusCode, 403);
  res = await llamar('uploadEmpresa', { user: EMPRESA, params: { idSolicitud: '10' }, solEmpresa: null });
  assert.equal(res.statusCode, 404);
  res = await llamar('uploadEmpresa', { user: EMPRESA, params: { idSolicitud: 'x' } });
  assert.equal(res.statusCode, 400);
});

const RESERVA = { id_empresa: 100, tipo_contrato: 'CONTRATO_DE_FORMACION_EN_ALTERNANCIA', estado_reserva: 'PENDIENTE' };

test('reservation annex: chosen from the contract type; needs a type, an active reservation and the owner', async () => {
  let res = await llamar('uploadReserva', { user: EMPRESA, params: { idReserva: '8' }, reserva: RESERVA });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(guardados[0].clave, 'ANEXO_II');
  res = await llamar('uploadReserva', { user: EMPRESA, params: { idReserva: '8' }, reserva: { ...RESERVA, tipo_contrato: 'Beca' } });
  assert.equal(guardados[0].clave, 'ANEXO_III');

  const casos = [
    [{ params: { idReserva: 'x' } }, 400],
    [{ params: { idReserva: '8' }, reserva: null }, 404],
    [{ params: { idReserva: '8' }, reserva: { ...RESERVA, tipo_contrato: null } }, 400],
    [{ params: { idReserva: '8' }, reserva: { ...RESERVA, estado_reserva: 'CANCELADA' } }, 400],
    [{ params: { idReserva: '8' }, reserva: { ...RESERVA, id_empresa: 200 } }, 403],
  ];
  for (const [args, status] of casos) {
    assert.equal((await llamar('uploadReserva', { user: EMPRESA, ...args })).statusCode, status, JSON.stringify(args));
  }
});

test('generic upload checks the declared type against the reservation contract', async () => {
  let res = await llamar('uploadContexto', { user: EMPRESA, body: { clave: 'anexo_iii', id_reserva: '8' }, reserva: RESERVA });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /corresponde el Anexo II/);
  res = await llamar('uploadContexto', { user: EMPRESA, body: { clave: 'CALENDARIO', id_reserva: '8' }, reserva: RESERVA });
  assert.equal(res.statusCode, 200, 'the calendar has no contract family');
  res = await llamar('uploadContexto', { user: ADMIN, body: { clave: 'CALENDARIO', id_reserva: '8' }, reserva: RESERVA });
  assert.equal(res.statusCode, 200, 'staff may upload the calendar');
  res = await llamar('uploadContexto', { user: EMPRESA, body: { clave: 'ANEXO_2', id_reserva: '8' }, reserva: RESERVA });
  assert.equal(res.statusCode, 400, 'legacy types are never uploaded');
  res = await llamar('uploadContexto', { user: EMPRESA, body: { clave: 'CALENDARIO' }, reserva: RESERVA });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Falta la reserva/);
});

test('a refusal while saving is returned as is; other errors as SQL errors', async () => {
  let res = await llamar('uploadAlumno', { user: ALUMNO, params: { idSolicitud: '40', tipo: 'cv' }, falloGuardar: Object.assign(new Error('Ocupado'), { status: 409 }) });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'Ocupado');
  res = await llamar('uploadAlumno', { user: ALUMNO, params: { idSolicitud: '40', tipo: 'cv' }, falloGuardar: Object.assign(new Error('x'), { code: 'ER_LOCK_DEADLOCK' }) });
  assert.equal(res.statusCode, 409);
});

// ── Signatures ──────────────────────────────────────────────────────────────

const DOC = { id_documento: 50, id_reserva: 8, id_solicitud_alumno: null, id_solicitud_empresa: null, es_actual: 1, tiene_archivo: 1, tipo: 'ANEXO_II', estado_validacion: 'PENDIENTE', estado_reserva: 'PENDIENTE' };
const conDoc = (doc, extra = []) => [
  ['SELECT id_solicitud_alumno, id_solicitud_empresa, id_reserva FROM dual_documentos', [{ id_reserva: doc?.id_reserva ?? 8 }]],
  ['FOR UPDATE OF d, r, se', doc ? [doc] : []],
  ['SELECT se.id_empresa FROM dual_reservas r', [{ id_empresa: 100 }]],
  ...extra,
];

test('sign: the caller\'s role signs the current file once, in a transaction, audited', async () => {
  const res = await llamar('firmar', { user: EMPRESA, params: { id: '50' }, respuestas: conDoc(DOC) });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { message: 'Firma registrada.', id_documento: 50, rol: 'EMPRESA', estado: 'FIRMADO' });
  const ins = pool.calls.find((c) => c.sql.startsWith('INSERT INTO dual_documento_firmas'));
  assert.deepEqual(ins.params, [50, 'EMPRESA', 3, 3]);
  assert.ok(pool.calls.some((c) => c.sql.startsWith('INSERT INTO dual_eventos') && c.params[2] === 'FIRMAR'));
  assert.ok(pool.calls.some((c) => c.sql === 'COMMIT'));
});

test('sign: staff sign as the centre; a second signature is a no-op', async () => {
  let res = await llamar('firmar', { params: { id: '50' }, respuestas: conDoc(DOC) });
  assert.equal(res.body.rol, 'GESTOR');
  res = await llamar('firmar', { params: { id: '50' }, respuestas: conDoc(DOC, [['SELECT rol, estado, metodo FROM dual_documento_firmas', [{ rol: 'GESTOR', estado: 'FIRMADO' }]]]) });
  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /ya estaba registrada/);
  assert.ok(!pool.calls.some((c) => c.sql.startsWith('INSERT')));
});

test('sign: refused for missing files, old versions, rejected files, cancelled reservations and other companies', async () => {
  const casos = [
    [null, 404],
    [{ ...DOC, tiene_archivo: 0 }, 404],
    [{ ...DOC, es_actual: 0 }, 409],
    [{ ...DOC, estado_validacion: 'RECHAZADO' }, 400],
    [{ ...DOC, estado_reserva: 'CANCELADA' }, 400],
    [{ ...DOC, tipo: 'CV' }, 400],
  ];
  for (const [doc, status] of casos) {
    const res = await llamar('firmar', { user: EMPRESA, params: { id: '50' }, respuestas: conDoc(doc) });
    assert.equal(res.statusCode, status, JSON.stringify(doc));
    assert.ok(!pool.calls.some((c) => c.sql.startsWith('INSERT')));
  }
  const otra = await llamar('firmar', { user: EMPRESA, params: { id: '50' }, empresa: 200, respuestas: conDoc(DOC) });
  assert.equal(otra.statusCode, 403);
  assert.equal((await llamar('firmar', { params: { id: 'x' } })).statusCode, 400);
});

test('sign by context: the reservation\'s current file of that type, for its company or student only', async () => {
  const actual = ['SELECT id_documento FROM dual_documentos WHERE id_reserva = ?', [{ id_documento: 50 }]];
  let res = await llamar('firmarContexto', { user: EMPRESA, body: { clave: 'anexo_ii', id_reserva: '8' }, respuestas: [actual, ...conDoc(DOC)] });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.id_documento, 50);

  const casos = [
    [EMPRESA, { clave: 'CV', id_reserva: '8' }, [], 400],
    [EMPRESA, { clave: 'ANEXO_II' }, [], 400],
    [EMPRESA, { clave: 'ANEXO_II', id_reserva: '8' }, [['SELECT se.id_empresa FROM dual_reservas r', [{ id_empresa: 200 }]]], 403],
    [ALUMNO, { clave: 'ANEXO_II', id_reserva: '8' }, [['SELECT sa.id_alumno FROM dual_reservas r', [{ id_alumno: 9 }]]], 403],
    [ALUMNO, { clave: 'ANEXO_II', id_reserva: '8' }, [['SELECT sa.id_alumno FROM dual_reservas r', [{ id_alumno: 7 }]]], 400],
  ];
  for (const [user, body, respuestas, status] of casos) {
    res = await llamar('firmarContexto', { user, body, respuestas });
    assert.equal(res.statusCode, status, `${user.rol} ${JSON.stringify(body)}`);
  }
  assert.match(res.body.error, /No hay un documento que firmar/);
});

// ── Generation ──────────────────────────────────────────────────────────────

test('generate: only template documents, with their parent; the company gets a new convenio by email', async () => {
  assert.equal((await llamar('generar', { body: { clave: 'CV' } })).statusCode, 400);
  assert.equal((await llamar('generar', { body: { clave: 'CONVENIO' } })).statusCode, 400);
  assert.equal((await llamar('generar', { body: { clave: 'ANEXO_II' } })).statusCode, 400);

  let res = await llamar('generar', { body: { clave: 'convenio', id_solicitud_empresa: '10', regenerar: true } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(generados[0], {
    clave: 'CONVENIO', parents: { id_solicitud_alumno: null, id_solicitud_empresa: 10, id_reserva: null },
    userId: 1, userRol: 'ADMINISTRADOR', regenerar: true,
  });
  assert.deepEqual(avisos.map((a) => a.slice(0, 2)), [['convenioDisponible', 10]]);

  res = await llamar('generar', { body: { clave: 'CONVENIO', id_solicitud_empresa: '10' }, generado: { ok: false, code: 'SIN_PLANTILLA' } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'SIN_PLANTILLA');
  assert.equal(avisos.length, 0);
});

test('generate an annex: the reservation must exist, be active and need that annex', async () => {
  const r = (fila) => [['SELECT er.nombre AS estado_reserva, tc.nombre AS tipo_contrato', fila ? [fila] : []]];
  const casos = [
    [null, 404],
    [{ estado_reserva: 'CANCELADA', tipo_contrato: 'CONTRATO' }, 400],
    [{ estado_reserva: 'PENDIENTE', tipo_contrato: 'Beca' }, 400],
    [{ estado_reserva: 'PENDIENTE', tipo_contrato: null }, 400],
  ];
  for (const [fila, status] of casos) {
    assert.equal((await llamar('generar', { body: { clave: 'ANEXO_II', id_reserva: '8' }, respuestas: r(fila) })).statusCode, status, JSON.stringify(fila));
  }
  const res = await llamar('generar', { body: { clave: 'ANEXO_II', id_reserva: '8' }, respuestas: r({ estado_reserva: 'PENDIENTE', tipo_contrato: 'CONTRATO' }) });
  assert.equal(res.statusCode, 200);
  assert.equal(generados[0].parents.id_reserva, 8);
  assert.equal(avisos.length, 0, 'only the convenio is emailed');
});

test('a generation refusal (already exists, validated) keeps its status', async () => {
  const res = await llamar('generar', {
    body: { clave: 'CONVENIO', id_solicitud_empresa: '10' },
    falloGenerar: Object.assign(new Error('El documento ya existe.'), { status: 409 }),
  });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /ya existe/);
  assert.equal(avisos.length, 0);
});

// ── Lists ───────────────────────────────────────────────────────────────────

test('own document lists need a linked student or company', async () => {
  assert.equal((await llamar('getMios', { user: ALUMNO, alumno: null })).statusCode, 404);
  assert.equal((await llamar('getEmpresaDocumentos', { user: EMPRESA, empresa: null })).statusCode, 404);
});
