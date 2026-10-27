// Phase 3 · reservation detail endpoint, WF-8, WF-9/15 list fields, WF-12,
// stable error codes. No database: the pool is the harness fake.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let handler = () => [];
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);

const staff = { id: 1, rol: 'COORDINADOR' };

function reset(fn) {
  pool.calls.length = 0;
  handler = fn;
}

// One reservation: student 40 (user 70), company 9 (user 80), BECA, annex III
// uploaded by the company and still pending review.
function reservaDb({ estado = 'PENDIENTE', tipo = 'BECA', idTipo = 1, anexo = 'PENDIENTE', firmas = ['EMPRESA'] } = {}) {
  return (sql, params) => {
    if (sql.includes('FROM dual_reservas r') && sql.includes('tutor_c.telefono AS tutor_telefono, t.activo AS tutor_activo')) {
      return [{
        id_reserva: 3, estado_reserva: estado, motivo: null, id_tipo_contrato: idTipo,
        tipo_contrato_clave: tipo, tipo_contrato: tipo ? 'Beca' : null,
        id_empresa_tutor: null, tutor_nombre: null, tutor_email: null, tutor_telefono: null, tutor_activo: null,
        id_solicitud_alumno: 11, id_alumno: 40, alumno: 'Ana', dni: '00000000T',
        id_solicitud_empresa: 5, id_empresa: 9, empresa: 'ACME', cif: 'B00000000',
        id_solicitud_empresa_especialidad: 21, id_especialidad: 2, especialidad: 'DAM', codigo_especialidad: 'DAM',
        id_convocatoria: 2, convocatoria: '2026/2027', convocatoria_activa: 1,
      }];
    }
    // company / student ownership lookups (dbHelpers)
    if (sql.includes('JOIN ge_contactos c ON c.idcontacto = u.id_contacto')) {
      return [{ idempresa: params[0] === 80 ? 9 : 99 }];
    }
    if (sql.includes("AND r.nombre = 'ALUMNO'")) return [{ id_alumno: params[0] === 70 ? 40 : 41 }];
    // reservaDocumentos / reservaDocSummary (latestDocs)
    if (sql.includes('FROM dual_documentos d') && sql.includes('AS tiene_archivo') && sql.includes('origen_nombre')) {
      return tipo ? [{
        id_documento: 30, id_solicitud_alumno: null, id_solicitud_empresa: null, id_reserva: 3,
        motivo: null, estado_workflow: 'SUBIDO', origen_documento: 'SUBIDA', id_usuario_origen: 80,
        id_plantilla: null, registrado_en: null, firmas_exentas_legacy: 0,
        clave: 'ANEXO_III', estado_validacion: anexo, tiene_archivo: 1,
      }] : [];
    }
    if (sql.startsWith('SELECT id_documento, rol, estado, metodo, firmado_en FROM dual_documento_firmas')) {
      return firmas.map((rol) => ({ id_documento: 30, rol, estado: 'FIRMADO', metodo: 'SUBIDA_FIRMADA' }));
    }
    if (sql.includes('FROM dual_documento_plantillas p')) return [];
    // currentAnexos (reservasService)
    if (sql.startsWith('SELECT d.id_documento, td.nombre AS clave')) {
      return tipo ? [{ id_documento: 30, clave: 'ANEXO_III', estado_validacion: anexo, firmas_exentas_legacy: 0, tiene_archivo: 1 }] : [];
    }
    if (sql.startsWith('SELECT rol, estado FROM dual_documento_firmas')) {
      return firmas.map((rol) => ({ rol, estado: 'FIRMADO' }));
    }
    // historial
    if (sql.includes('AND (d.es_actual = 0 OR td.nombre IN (?))')) return [];
    return [];
  };
}

test('detalle: staff get documents, checklist and actions for a pending reservation', async () => {
  const svc = load('src/services/reservasService');
  reset(reservaDb());
  const res = mockRes();
  await svc.getDetalle(mockReq({ params: { id: '3' }, user: staff }), res);
  assert.equal(res.statusCode, 200);
  const b = res.body;
  assert.equal(b.reserva.anexo_clave, 'ANEXO_III');
  assert.deepEqual(b.documentos.map((d) => d.clave), ['ANEXO_III', 'CALENDARIO']);
  const anexo = b.documentos[0];
  assert.equal(anexo.estado_operativo, 'PENDIENTE_FIRMA', 'centre and student still have to sign');
  assert.equal(anexo.puede_revisar, false, 'no review before signatures (D1)');
  assert.equal(anexo.puede_firmar, true, 'staff sign as GESTOR');
  const req = Object.fromEntries(b.confirmacion.requisitos.map((r) => [r.clave, r.ok]));
  assert.deepEqual(req, { TIPO_CONTRATO: true, ANEXO_SUBIDO: true, FIRMAS: false, VALIDADO: false });
  assert.deepEqual(b.confirmacion.requisitos.find((r) => r.clave === 'FIRMAS').pendientes, ['GESTOR', 'ALUMNO']);
  assert.equal(b.confirmacion.lista, false);
  assert.equal(b.acciones.confirmar.permitido, false);
  assert.match(b.acciones.confirmar.motivo, /faltan firmas/i);
  assert.equal(b.acciones.cambiar_tipo.permitido, true);
  assert.equal(b.acciones.cambio_familia.permitido, false, 'annex file under review locks the family (D2)');
  assert.equal(b.acciones.cancelar.via, 'cancelar-admin');
  assert.equal(b.acciones.reasignar.permitido, true);
});

test('detalle: a fully signed and validated annex makes the reservation confirmable', async () => {
  const svc = load('src/services/reservasService');
  reset(reservaDb({ anexo: 'VALIDADO', firmas: ['EMPRESA', 'GESTOR', 'ALUMNO'] }));
  const res = mockRes();
  await svc.getDetalle(mockReq({ params: { id: '3' }, user: staff }), res);
  assert.equal(res.body.confirmacion.lista, true);
  assert.equal(res.body.acciones.confirmar.permitido, true);
});

test('detalle: the owning company sees its own actions only; other companies get 403', async () => {
  const svc = load('src/services/reservasService');
  reset(reservaDb());
  let res = mockRes();
  await svc.getDetalle(mockReq({ params: { id: '3' }, user: { id: 80, rol: 'EMPRESA' } }), res);
  assert.equal(res.statusCode, 200);
  const a = res.body.acciones;
  assert.equal(a.confirmar.permitido, false);
  assert.equal(a.cambiar_tipo.permitido, false);
  assert.equal(a.reasignar.permitido, false);
  assert.equal(a.cancelar.permitido, true);
  assert.equal(a.cancelar.via, 'cancelar');
  assert.deepEqual(res.body.historial, [], 'history is staff-only');
  const anexo = res.body.documentos.find((d) => d.clave === 'ANEXO_III');
  assert.equal(anexo.puede_revisar, false);

  res = mockRes();
  await svc.getDetalle(mockReq({ params: { id: '3' }, user: { id: 81, rol: 'EMPRESA' } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'FORBIDDEN');
});

test('detalle: a company cannot cancel a confirmed reservation; the student only views', async () => {
  const svc = load('src/services/reservasService');
  reset(reservaDb({ estado: 'CONFIRMADA', anexo: 'VALIDADO', firmas: ['EMPRESA', 'GESTOR', 'ALUMNO'] }));
  let res = mockRes();
  await svc.getDetalle(mockReq({ params: { id: '3' }, user: { id: 80, rol: 'EMPRESA' } }), res);
  assert.equal(res.body.acciones.cancelar.permitido, false);
  assert.match(res.body.acciones.cancelar.motivo, /solo la puede cancelar el centro/);

  res = mockRes();
  await svc.getDetalle(mockReq({ params: { id: '3' }, user: { id: 70, rol: 'ALUMNO' } }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(Object.values(res.body.acciones).filter((a) => a.permitido && a !== res.body.acciones.cambio_familia).length === 0,
    'no reservation action for the student');

  res = mockRes();
  await svc.getDetalle(mockReq({ params: { id: '3' }, user: { id: 71, rol: 'ALUMNO' } }), res);
  assert.equal(res.statusCode, 403);
});

test('detalle: without a contract type only the calendar is listed and the annex is "not applicable"', async () => {
  const svc = load('src/services/reservasService');
  reset(reservaDb({ tipo: null, idTipo: null }));
  const res = mockRes();
  await svc.getDetalle(mockReq({ params: { id: '3' }, user: staff }), res);
  assert.equal(res.body.reserva.anexo_clave, null);
  assert.deepEqual(res.body.documentos.map((d) => d.clave), ['CALENDARIO']);
  assert.equal(res.body.confirmacion.requisitos[0].ok, false);
  assert.match(res.body.acciones.confirmar.motivo, /tipo de contrato/);
});

test('WF-15: reservation lists carry the real annex/calendar state', async () => {
  const svc = load('src/services/reservasService');
  reset((sql, params) => {
    if (sql.startsWith('SELECT r.id_reserva, er.nombre AS estado_reserva, r.motivo, r.id_tipo_contrato, tc.nombre_mostrar AS tipo_contrato')) {
      return [{ id_reserva: 3, estado_reserva: 'CONFIRMADA', tipo_contrato_clave: 'BECA' }];
    }
    return reservaDb({ anexo: 'PENDIENTE', firmas: [] })(sql, params);
  });
  const res = mockRes();
  await svc.getAll(mockReq({ user: staff }), res);
  const r = res.body[0];
  assert.equal(r.estado_reserva, 'CONFIRMADA');
  assert.equal(r.documentos_resumen.anexo.clave, 'ANEXO_III');
  assert.notEqual(r.documentos_resumen.anexo.estado_operativo, 'VALIDADO', 'confirmed does not mean validated');
  assert.equal(r.documentos_resumen.calendario.clave, 'CALENDARIO');
  const sql = pool.calls.find((c) => c.sql.startsWith('SELECT r.id_reserva, er.nombre AS estado_reserva')).sql;
  assert.match(sql, /se\.id_solicitud_empresa/, 'WF-9: the application id is listed');
  assert.match(sql, /conv\.nombre AS convocatoria/);
});

test('WF-8: reassignment destinations include confirmed students and exclude the origin offer', async () => {
  const svc = load('src/services/reservasService');
  reset((sql) => {
    if (sql.startsWith('SELECT r.id_solicitud_empresa_especialidad, er.nombre AS estado')) {
      return [{ id_solicitud_empresa_especialidad: 21, estado: 'CONFIRMADA' }];
    }
    if (sql.includes('AND ee.id_solicitud_empresa_especialidad <> ?')) return [{ id_solicitud_empresa_especialidad: 22 }];
    return [];
  });
  const res = mockRes();
  await svc.getOfertasElegibles(mockReq({ user: staff, query: { id_solicitud_alumno: '11', reasignar_desde: '3' } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{ id_solicitud_empresa_especialidad: 22 }]);
  const sql = pool.calls.find((c) => c.sql.includes('AND ee.id_solicitud_empresa_especialidad <> ?'));
  assert.equal(sql.params[1], 21, 'origin offer excluded');
  assert.doesNotMatch(sql.sql, /er\.nombre = \?\s*\)\s*$/, 'no "already confirmed" exclusion');

  reset((sql) => (sql.startsWith('SELECT r.id_solicitud_empresa_especialidad') ? [{ id_solicitud_empresa_especialidad: 21, estado: 'CANCELADA' }] : []));
  const res2 = mockRes();
  await svc.getOfertasElegibles(mockReq({ user: staff, query: { id_solicitud_alumno: '11', reasignar_desde: '3' } }), res2);
  assert.equal(res2.statusCode, 400);
});

test('WF-12: the backend refuses an invalid CIF, DNI or short password before writing', async () => {
  const svc = load('src/services/solicitudesEmpresaService');
  const base = {
    cif: 'B12345674', empresa: 'ACME', domicilioLegal: 'C/ A 1', cpLegal: '50001', provinciaLegal: 'Zaragoza', localidadLegal: 'Zaragoza',
    dniRepresentante: '12345678Z', nombreRepresentante: 'R', emailRepresentante: 'r@a.es', telefonoRepresentante: '1',
    dniCoordinador: '00000000T', nombreCoordinador: 'C', emailCoordinador: 'c@a.es', telefonoCoordinador: '2',
    descripcion_puesto: 'x', especialidades: [{ idEspecialidad: 1, cantidadAlumnos: 1 }], passwordCoordinador: 'abcdefgh',
  };
  const { cifValido } = load('src/helpers/dbHelpers');
  assert.equal(cifValido(base.cif), true, 'fixture CIF is valid');
  for (const [field, value, code] of [['cif', 'B12345670', 'CIF_INVALIDO'], ['dniRepresentante', '12345678A', 'DNI_INVALIDO'], ['dniCoordinador', 'X0000000A', 'DNI_INVALIDO'], ['passwordCoordinador', 'short', 'PASSWORD_CORTA']]) {
    reset(() => []);
    const res = mockRes();
    await svc.create(mockReq({ body: { ...base, [field]: value } }), res);
    assert.equal(res.statusCode, 400, field);
    assert.equal(res.body.code, code, field);
    assert.equal(pool.calls.filter((c) => /^INSERT/.test(c.sql)).length, 0, `${field}: nothing written`);
  }
});

test('error codes: SQL rule errors and auth failures carry a stable code', async () => {
  const { sendSqlError } = load('src/helpers/dbHelpers');
  let res = mockRes();
  sendSqlError(res, Object.assign(new Error('Solo una reserva PENDIENTE puede confirmarse.'), { sqlState: '45000' }));
  assert.deepEqual([res.statusCode, res.body.code], [400, 'REGLA_NEGOCIO']);
  res = mockRes();
  sendSqlError(res, Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }));
  assert.deepEqual([res.statusCode, res.body.code], [409, 'DUPLICADO']);

  const { requireRole } = load('src/middleware/auth');
  res = mockRes();
  requireRole('ADMINISTRADOR')(mockReq({ user: { id: 1, rol: 'EMPRESA' } }), res, () => {});
  assert.deepEqual([res.statusCode, res.body.code], [403, 'FORBIDDEN']);
});

test('dniNieValido checks the control letter of DNI and NIE', () => {
  const { dniNieValido } = load('src/helpers/dbHelpers');
  assert.equal(dniNieValido('00000000T'), true);
  assert.equal(dniNieValido(' 12345678z '), true, 'normalised');
  assert.equal(dniNieValido('12345678A'), false);
  assert.equal(dniNieValido('X0000000T'), true);
  assert.equal(dniNieValido('Y0000000Z'), true);
  assert.equal(dniNieValido('B12345678'), false);
});
