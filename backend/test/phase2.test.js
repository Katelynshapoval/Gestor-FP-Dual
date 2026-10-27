// Phase 2 · state rules (D1, D2, D7), WF-4/5/6/11, PM-6, migrations tooling.
// No database: the pool is the harness fake. Real-database checks live in
// test/db/phase2.db.test.js and only run with DB_INTEGRATION=1.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let handler = () => [];
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);

const staff = { id: 1, rol: 'COORDINADOR' };
const calls = (prefix) => pool.calls.filter((c) => c.sql && c.sql.startsWith(prefix));
const events = () => pool.calls.filter((c) => c.sql && c.sql.startsWith('INSERT INTO dual_eventos'));

function reset(fn) {
  pool.calls.length = 0;
  handler = fn;
}

// ── tooling ─────────────────────────────────────────────────────────────
test('migrations: the splitter honours DELIMITER blocks', () => {
  const { splitSqlScript } = require('../scripts/lib/sqlScript');
  const out = splitSqlScript([
    '-- comment only',
    'CREATE TABLE a (x int);',
    'DELIMITER $$',
    'CREATE PROCEDURE p() BEGIN',
    '  SELECT 1;',
    '  SELECT 2;',
    'END$$',
    'DELIMITER ;',
    'DROP TABLE a;',
  ].join('\n'));
  assert.equal(out.length, 3);
  assert.match(out[1], /SELECT 1;\n {2}SELECT 2;\nEND$/);
  assert.equal(out[2], 'DROP TABLE a');
});

test('migrations: every migration has a rollback and splits cleanly', () => {
  const { splitSqlScript } = require('../scripts/lib/sqlScript');
  const dir = path.join(__dirname, '..', '..', 'db');
  const files = fs.readdirSync(path.join(dir, 'migrations')).filter((f) => /^\d{3}_.*\.sql$/.test(f));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const down = path.join(dir, 'rollback', f.replace(/\.sql$/, '.down.sql'));
    assert.ok(fs.existsSync(down), `falta rollback de ${f}`);
    const stmts = splitSqlScript(fs.readFileSync(path.join(dir, 'migrations', f), 'utf8'));
    assert.ok(stmts.every((s) => !/^\s*DELIMITER/m.test(s)), `${f}: DELIMITER sin procesar`);
  }
  const baseline = splitSqlScript(fs.readFileSync(path.join(dir, '000_baseline.sql'), 'utf8'));
  assert.ok(baseline.some((s) => s.includes('CREATE TABLE `dual_reservas`')));
  assert.ok(!baseline.some((s) => /DEFINER=`/.test(s)), 'baseline sin DEFINER');
  assert.ok(!baseline.some((s) => /INSERT INTO `(gf_alumnosfct|ge_empresas|dual_usuarios)`/.test(s)), 'baseline sin datos personales');
});

// ── pure rules ──────────────────────────────────────────────────────────
test('D1: a document cannot be validated until every signer has signed', () => {
  const reglas = load('src/services/estadoReglas');
  const { defByClave } = load('src/services/documentCatalogue');
  const def = defByClave('ANEXO_II');
  const doc = { id_documento: 9, es_actual: 1, tiene_archivo: 1, estado_validacion: 'PENDIENTE' };

  const none = reglas.documentoValidable(def, doc, []);
  assert.equal(none.code, 'FIRMAS_PENDIENTES');
  assert.match(none.error, /empresa, centro, alumno/);

  const two = reglas.documentoValidable(def, doc, [
    { rol: 'EMPRESA', estado: 'FIRMADO' }, { rol: 'GESTOR', estado: 'FIRMADO' }, { rol: 'ALUMNO', estado: 'SIN_FIRMAR' },
  ]);
  assert.match(two.error, /alumno\.$/);

  const all = ['EMPRESA', 'GESTOR', 'ALUMNO'].map((rol) => ({ rol, estado: 'FIRMADO' }));
  assert.equal(reglas.documentoValidable(def, doc, all), null);
});

test('D1: only rows explicitly exempted by migration 013 skip signatures', () => {
  const reglas = load('src/services/estadoReglas');
  const { defByClave, deriveDocumentState } = load('src/services/documentCatalogue');
  const def = defByClave('CONVENIO');
  const legacyNoRows = { id_documento: 3, es_actual: 1, tiene_archivo: 1, estado_validacion: 'PENDIENTE', origen_documento: 'LEGACY' };
  assert.equal(reglas.documentoValidable(def, legacyNoRows, []).code, 'FIRMAS_PENDIENTES',
    'a legacy origin without the explicit flag is not exempt');
  assert.equal(reglas.documentoValidable(def, { ...legacyNoRows, firmas_exentas_legacy: 1 }, []), null);

  const state = deriveDocumentState(def, legacyNoRows, []);
  assert.equal(state.estado_operativo, 'PENDIENTE_FIRMA');
  const exempt = deriveDocumentState(def, { ...legacyNoRows, firmas_exentas_legacy: 1, estado_validacion: 'VALIDADO' }, []);
  assert.equal(exempt.estado_operativo, 'VALIDADO');
  assert.deepEqual(exempt.firmas, []);
});

test('D1: state guards for validate / reject / sign', () => {
  const reglas = load('src/services/estadoReglas');
  const { defByClave } = load('src/services/documentCatalogue');
  const cv = defByClave('CV');
  const anexo = defByClave('ANEXO_II');
  const base = { id_documento: 1, es_actual: 1, tiene_archivo: 1, estado_validacion: 'PENDIENTE' };
  assert.equal(reglas.documentoValidable(cv, base, []), null, 'CV has no signers');
  assert.equal(reglas.documentoValidable(cv, { ...base, es_actual: 0 }, []).status, 409);
  assert.equal(reglas.documentoValidable(cv, { ...base, estado_validacion: 'VALIDADO' }, []).code, 'YA_VALIDADO');
  assert.equal(reglas.documentoValidable(cv, { ...base, estado_validacion: 'RECHAZADO' }, []).code, 'RECHAZADO');
  assert.equal(reglas.documentoValidable(anexo, { ...base, estado_reserva: 'CANCELADA' }, []).code, 'RESERVA_CANCELADA');
  assert.equal(reglas.documentoValidable(defByClave('CALENDARIO'), base, []).code, 'SIN_REVISION');
  assert.equal(reglas.documentoRechazable(cv, { ...base, estado_validacion: 'RECHAZADO' }).status, 409);
  assert.equal(reglas.documentoFirmable(anexo, base, 'EMPRESA'), null);
  assert.equal(reglas.documentoFirmable(anexo, { ...base, estado_validacion: 'RECHAZADO' }, 'EMPRESA').code, 'RECHAZADO');
  assert.equal(reglas.documentoFirmable(defByClave('CONVENIO'), base, 'ALUMNO').status, 403);
});

test('D2: the contract type can be corrected until a real annex file is under review', () => {
  const { tipoContratoCambiable } = load('src/services/estadoReglas');
  const pendiente = { estado: 'PENDIENTE', tipo_contrato: 'BECA' };
  assert.equal(tipoContratoCambiable({ estado: 'PENDIENTE', tipo_contrato: null }, 'BECA', []), null, 'first choice');
  assert.equal(tipoContratoCambiable(pendiente, 'CONTRATO_DE_FORMACION_EN_ALTERNANCIA', []), null, 'no annex yet');
  assert.equal(tipoContratoCambiable(pendiente, 'CONTRATO_DE_FORMACION_EN_ALTERNANCIA',
    [{ clave: 'ANEXO_III', tiene_archivo: 0, estado_validacion: 'PENDIENTE' }]), null, 'empty requirement row');
  assert.equal(tipoContratoCambiable(pendiente, 'CONTRATO_DE_FORMACION_EN_ALTERNANCIA',
    [{ clave: 'ANEXO_III', tiene_archivo: 1, estado_validacion: 'PENDIENTE' }]).code, 'ANEXO_EXISTENTE');
  assert.equal(tipoContratoCambiable(pendiente, 'CONTRATO_DE_FORMACION_EN_ALTERNANCIA',
    [{ clave: 'ANEXO_III', tiene_archivo: 1, estado_validacion: 'VALIDADO' }]).code, 'ANEXO_EXISTENTE');
  assert.equal(tipoContratoCambiable(pendiente, 'CONTRATO_DE_FORMACION_EN_ALTERNANCIA',
    [{ clave: 'ANEXO_III', tiene_archivo: 1, estado_validacion: 'RECHAZADO' }]), null, 'rejected file goes to history');
  assert.equal(tipoContratoCambiable({ estado: 'CONVENIO', tipo_contrato: 'OTRO' }, 'CONVENIO', []), null);
  assert.equal(tipoContratoCambiable({ estado: 'CONFIRMADA', tipo_contrato: 'BECA' }, 'BECA', []).code, 'RESERVA_CONFIRMADA');
  assert.equal(tipoContratoCambiable({ estado: 'CANCELADA' }, 'BECA', []).code, 'RESERVA_CANCELADA');
  // Same family (Contrato ↔ Otro both use Anexo II): never blocked by the annex.
  assert.equal(tipoContratoCambiable({ estado: 'PENDIENTE', tipo_contrato: 'OTRO' }, 'CONVENIO',
    [{ clave: 'ANEXO_II', tiene_archivo: 1, estado_validacion: 'VALIDADO' }]), null);
});

test('D2: confirmation needs the stored type and a fully signed, validated annex', () => {
  const { reservaConfirmable } = load('src/services/estadoReglas');
  const { defByClave } = load('src/services/documentCatalogue');
  const def = defByClave('ANEXO_III');
  const r = { estado: 'PENDIENTE', id_tipo_contrato: 1, tipo_contrato: 'BECA' };
  const signed = ['EMPRESA', 'GESTOR', 'ALUMNO'].map((rol) => ({ rol, estado: 'FIRMADO' }));
  const ok = { id_documento: 5, tiene_archivo: 1, estado_validacion: 'VALIDADO' };
  assert.equal(reservaConfirmable({ ...r, id_tipo_contrato: null }, null, def, ok, signed).code, 'SIN_TIPO_CONTRATO');
  assert.equal(reservaConfirmable(r, 2, def, ok, signed).code, 'TIPO_DISTINTO');
  assert.equal(reservaConfirmable(r, null, def, null, []).code, 'ANEXO_FALTA');
  assert.equal(reservaConfirmable(r, null, def, ok, signed.slice(0, 2)).code, 'FIRMAS_PENDIENTES');
  assert.equal(reservaConfirmable(r, null, def, { ...ok, estado_validacion: 'PENDIENTE' }, signed).code, 'ANEXO_SIN_VALIDAR');
  assert.equal(reservaConfirmable({ ...r, estado: 'CONFIRMADA' }, null, def, ok, signed).code, 'NO_PENDIENTE');
  assert.equal(reservaConfirmable(r, 1, def, ok, signed), null);
  assert.equal(reservaConfirmable(r, null, def, ok, signed), null);
});

test('D7: application transitions', () => {
  const { solicitudTransicion: t } = load('src/services/estadoReglas');
  assert.equal(t('PENDIENTE', 'VALIDAR'), null);
  assert.equal(t('PENDIENTE', 'RECHAZAR'), null);
  assert.equal(t('VALIDADO', 'RECHAZAR').code, 'ESTADO_NO_PERMITE');
  assert.equal(t('RECHAZADO', 'VALIDAR').code, 'ESTADO_NO_PERMITE');
  assert.equal(t('RECHAZADO', 'REABRIR'), null);
  assert.equal(t('RECHAZADO', 'REABRIR', { convocatoriaActiva: false }).code, 'CONVOCATORIA_CERRADA');
  assert.equal(t('PENDIENTE', 'REABRIR').code, 'ESTADO_NO_PERMITE');
  assert.equal(t(null, 'VALIDAR').status, 404);
});

// ── services against the fake pool ──────────────────────────────────────
function docRow(overrides = {}) {
  return {
    id_documento: 7, id_solicitud_alumno: null, id_solicitud_empresa: null, id_reserva: 3,
    es_actual: 1, firmas_exentas_legacy: 0, tiene_archivo: 1, tipo: 'ANEXO_II',
    estado_validacion: 'PENDIENTE', estado_reserva: 'PENDIENTE', estado_solicitud_empresa: null,
    ...overrides,
  };
}

test('WF-6: POST /documentos/:id/validar refuses missing signatures without touching the row', async () => {
  const svc = load('src/services/documentosService');
  reset((sql) => {
    if (sql.includes('FROM dual_documentos d') && sql.endsWith('FOR UPDATE')) return [docRow()];
    if (sql.startsWith('SELECT rol, estado, metodo FROM dual_documento_firmas')) return [{ rol: 'EMPRESA', estado: 'FIRMADO' }];
    return [];
  });
  const res = mockRes();
  await svc.validar(mockReq({ params: { id: '7' }, user: staff }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'FIRMAS_PENDIENTES');
  assert.equal(calls('CALL sp_validar_documento').length, 0);
  assert.ok(pool.calls.some((c) => c.sql === 'ROLLBACK'));
});

test('WF-6/WF-7: a signed convenio validates the PENDIENTE company in the same transaction, with events', async () => {
  const svc = load('src/services/documentosService');
  reset((sql) => {
    if (sql.includes('FROM dual_documentos d') && sql.endsWith('FOR UPDATE')) {
      return [docRow({ tipo: 'CONVENIO', id_reserva: null, id_solicitud_empresa: 4, estado_reserva: null, estado_solicitud_empresa: 'PENDIENTE' })];
    }
    if (sql.startsWith('SELECT rol, estado, metodo FROM dual_documento_firmas')) {
      return [{ rol: 'EMPRESA', estado: 'FIRMADO', metodo: 'SUBIDA_FIRMADA' }];
    }
    return [];
  });
  const res = mockRes();
  await svc.validar(mockReq({ params: { id: '7' }, user: staff }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.empresa_validada, true);
  assert.deepEqual(calls('CALL sp_validar_solicitud_empresa')[0].params, [4]);
  const ev = events();
  assert.equal(ev.length, 2);
  assert.deepEqual(ev[0].params.slice(0, 6), ['DOCUMENTO', 7, 'VALIDAR', 'PENDIENTE', 'VALIDADO', 1]);
  assert.deepEqual(ev[1].params.slice(0, 5), ['SOLICITUD_EMPRESA', 4, 'VALIDAR', 'PENDIENTE', 'VALIDADO']);
  assert.ok(pool.calls.at(-1).sql === 'COMMIT');
});

test('D6 open: rejecting the convenio of a validated company leaves the company as it is', async () => {
  const svc = load('src/services/documentosService');
  reset((sql) => {
    if (sql.includes('FROM dual_documentos d') && sql.endsWith('FOR UPDATE')) {
      return [docRow({ tipo: 'CONVENIO', id_reserva: null, id_solicitud_empresa: 4, estado_reserva: null, estado_validacion: 'VALIDADO', estado_solicitud_empresa: 'VALIDADO' })];
    }
    return [];
  });
  const res = mockRes();
  await svc.rechazar(mockReq({ params: { id: '7' }, body: { motivo: 'Falta sello' }, user: staff }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls('CALL sp_rechazar_documento').length, 1);
  assert.equal(pool.calls.filter((c) => /solicitud_empresa/.test(c.sql) && c.sql.startsWith('CALL')).length, 0);
  assert.match(events()[0].params[8], /empresa_validada_sin_cambios/);
});

test('PM-6 + D1: saving a document is one transaction; the uploading signer attests, others reset', async () => {
  const { saveByClave } = load('src/services/documentosStore');
  reset((sql) => {
    if (sql.startsWith('SELECT id_tipo_documento FROM dual_tipos_documento')) return [{ id_tipo_documento: 10 }];
    if (sql.startsWith('CALL sp_guardar_documento')) return [[{ id_documento: 21 }]];
    return { affectedRows: 1 };
  });
  const id = await saveByClave('ANEXO_II', { id_reserva: 3 }, Buffer.from('%PDF'), { origen: 'SUBIDA', idUsuario: 8, rol: 'EMPRESA' });
  assert.equal(id, 21);
  const sqls = pool.calls.map((c) => c.sql);
  assert.equal(sqls[0], 'BEGIN');
  assert.equal(sqls.at(-1), 'COMMIT');
  const firmas = pool.calls.filter((c) => c.sql.startsWith('INSERT INTO dual_documento_firmas'));
  assert.equal(firmas.length, 3);
  const empresa = firmas.find((f) => f.params[1] === 'EMPRESA');
  assert.match(empresa.sql, /'FIRMADO'.*'SUBIDA_FIRMADA'/);
  assert.ok(firmas.filter((f) => f.params[1] !== 'EMPRESA').every((f) => /'SIN_FIRMAR'/.test(f.sql)));
  assert.ok(pool.calls.some((c) => /firmas_exentas_legacy = 0/.test(c.sql)), 'a new file is never exempt');
  assert.equal(events()[0].params[2], 'SUBIR');
});

test('PM-6: a failure after the procedure rolls the whole save back', async () => {
  const { saveByClave } = load('src/services/documentosStore');
  reset((sql) => {
    if (sql.startsWith('SELECT id_tipo_documento')) return [{ id_tipo_documento: 10 }];
    if (sql.startsWith('CALL sp_guardar_documento')) return [[{ id_documento: 21 }]];
    if (sql.startsWith('INSERT INTO dual_documento_firmas')) throw Object.assign(new Error('boom'), { code: 'ER_X' });
    return { affectedRows: 1 };
  });
  await assert.rejects(() => saveByClave('ANEXO_II', { id_reserva: 3 }, Buffer.from('%PDF'), { origen: 'GENERADO', idUsuario: 1 }));
  assert.equal(pool.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(pool.calls.filter((c) => c.sql === 'COMMIT').length, 0);
});

function reservaDb({ estado = 'PENDIENTE', tipo = 'BECA', idTipo = 1, anexos = [], firmas = [] } = {}) {
  return (sql) => {
    if (sql.startsWith('SELECT r.id_reserva, r.id_tipo_contrato, er.nombre AS estado')) {
      return [{ id_reserva: 3, id_tipo_contrato: idTipo, estado, tipo_contrato: tipo }];
    }
    if (sql.startsWith('SELECT r.id_reserva, r.id_solicitud_alumno, r.id_tipo_contrato')) {
      return [{ id_reserva: 3, id_solicitud_alumno: 11, id_tipo_contrato: idTipo, estado, tipo_contrato: tipo }];
    }
    if (sql.startsWith('SELECT id_tipo_contrato, nombre FROM dual_tipos_contrato')) {
      return [{ id_tipo_contrato: 2, nombre: 'CONTRATO_DE_FORMACION_EN_ALTERNANCIA' }];
    }
    if (sql.startsWith('SELECT d.id_documento, td.nombre AS clave')) return anexos;
    if (sql.startsWith('SELECT rol, estado FROM dual_documento_firmas')) return firmas;
    if (sql.startsWith('SELECT r.id_reserva FROM dual_reservas r')) return [{ id_reserva: 12 }];
    return { affectedRows: 1 };
  };
}

test('WF-5: changing Beca → Contrato is refused while the Anexo III file is under review', async () => {
  const svc = load('src/services/reservasService');
  reset(reservaDb({ anexos: [{ id_documento: 30, clave: 'ANEXO_III', tiene_archivo: 1, estado_validacion: 'PENDIENTE' }] }));
  const res = mockRes();
  await svc.setTipoContrato(mockReq({ params: { id: '3' }, body: { id_tipo_contrato: 2 }, user: staff }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(calls('UPDATE dual_reservas').length, 0);
});

test('WF-5: a rejected Anexo III is retired when the type is corrected; the change is audited', async () => {
  const svc = load('src/services/reservasService');
  reset(reservaDb({ anexos: [{ id_documento: 30, clave: 'ANEXO_III', tiene_archivo: 1, estado_validacion: 'RECHAZADO' }] }));
  const res = mockRes();
  await svc.setTipoContrato(mockReq({ params: { id: '3' }, body: { id_tipo_contrato: 2 }, user: staff }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.documentos_retirados, [30]);
  assert.deepEqual(calls('UPDATE dual_documentos SET es_actual = 0')[0].params, [[30]]);
  // estado_anterior/estado_nuevo are varchar(30): type ids there, names in detalle (Phase 4 fix).
  const params = events()[0].params;
  assert.deepEqual(params.slice(0, 5), ['RESERVA', 3, 'TIPO_CONTRATO', '1', '2']);
  assert.deepEqual(JSON.parse(params[8]), {
    tipo_anterior: 'BECA',
    tipo_nuevo: 'CONTRATO_DE_FORMACION_EN_ALTERNANCIA',
    documentos_retirados: [30],
  });
  assert.ok(params.slice(3, 5).every((v) => v == null || v.length <= 30));
});

test('WF-5: confirmation refuses a different type in the request and an unsigned annex', async () => {
  const svc = load('src/services/reservasService');
  const signed2 = [{ rol: 'EMPRESA', estado: 'FIRMADO' }, { rol: 'GESTOR', estado: 'FIRMADO' }];
  reset(reservaDb({ anexos: [{ id_documento: 30, clave: 'ANEXO_III', tiene_archivo: 1, estado_validacion: 'VALIDADO' }], firmas: signed2 }));
  let res = mockRes();
  await svc.confirmar(mockReq({ params: { id: '3' }, body: { id_tipo_contrato: 2 }, user: staff }), res);
  assert.equal(res.body.code, 'TIPO_DISTINTO');
  res = mockRes();
  await svc.confirmar(mockReq({ params: { id: '3' }, body: {}, user: staff }), res);
  assert.equal(res.body.code, 'FIRMAS_PENDIENTES');
  assert.equal(calls('CALL sp_confirmar_reserva').length, 0);
});

test('WF-5: confirmation uses the stored type and logs the cancelled sibling reservations', async () => {
  const svc = load('src/services/reservasService');
  const signed = ['EMPRESA', 'GESTOR', 'ALUMNO'].map((rol) => ({ rol, estado: 'FIRMADO' }));
  reset(reservaDb({ anexos: [{ id_documento: 30, clave: 'ANEXO_III', tiene_archivo: 1, estado_validacion: 'VALIDADO' }], firmas: signed }));
  const res = mockRes();
  await svc.confirmar(mockReq({ params: { id: '3' }, body: {}, user: staff }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls('CALL sp_confirmar_reserva')[0].params, [3, 1]);
  const ev = events();
  assert.deepEqual(ev.map((e) => [e.params[1], e.params[2]]), [[3, 'CONFIRMAR'], [12, 'CANCELAR']]);
});

test('WF-4: staff lists only show the CURRENT annex (retired ones stay in history)', async () => {
  const svc = load('src/services/reservasService');
  reset(() => []);
  await svc.getAll(mockReq({ user: staff }), mockRes());
  const sql = pool.calls[0].sql;
  assert.equal((sql.match(/AND d\.es_actual = 1/g) || []).length, 2);
});

test('D7: reopening a rejected student application in the active convocatoria', async () => {
  const svc = load('src/services/solicitudesAlumnoService');
  reset((sql) => {
    if (sql.startsWith('SELECT ev.nombre AS estado, c.activa FROM dual_solicitudes_alumno')) return [{ estado: 'RECHAZADO', activa: 1 }];
    return { affectedRows: 1 };
  });
  let res = mockRes();
  await svc.reabrir(mockReq({ params: { id: '5' }, body: { motivo: 'Aportó el documento' }, user: staff }), res);
  assert.equal(res.statusCode, 200);
  assert.match(calls('UPDATE dual_solicitudes_alumno')[0].sql, /motivo = NULL/);
  assert.deepEqual(events()[0].params.slice(0, 5), ['SOLICITUD_ALUMNO', 5, 'REABRIR', 'RECHAZADO', 'PENDIENTE']);

  reset((sql) => (sql.startsWith('SELECT ev.nombre AS estado') ? [{ estado: 'RECHAZADO', activa: 0 }] : []));
  res = mockRes();
  await svc.reabrir(mockReq({ params: { id: '5' }, body: {}, user: staff }), res);
  assert.equal(res.body.code, 'CONVOCATORIA_CERRADA');
  assert.equal(events().length, 0);
});

test('D7: a validated company cannot be rejected through the API; a pending one can', async () => {
  const svc = load('src/services/solicitudesEmpresaService');
  reset((sql) => (sql.startsWith('SELECT ev.nombre AS estado') ? [{ estado: 'VALIDADO', activa: 1 }] : []));
  let res = mockRes();
  await svc.rechazar(mockReq({ params: { id: '4' }, body: { motivo: 'x' }, user: staff }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(calls('CALL sp_rechazar_solicitud_empresa').length, 0);

  reset((sql) => (sql.startsWith('SELECT ev.nombre AS estado') ? [{ estado: 'PENDIENTE', activa: 1 }] : []));
  res = mockRes();
  await svc.rechazar(mockReq({ params: { id: '4' }, body: { motivo: 'Datos incompletos' }, user: staff }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls('CALL sp_rechazar_solicitud_empresa')[0].params, [4, 'Datos incompletos']);
});

test('WF-11: editing the coordinator freezes a copy for earlier applications first', async () => {
  const empresaDatos = load('src/services/empresaDatos');
  reset((sql) => {
    if (sql.startsWith('SELECT id_solicitud_empresa FROM dual_solicitudes_empresa WHERE id_coordinador_empresa')) {
      return [{ id_solicitud_empresa: 1 }, { id_solicitud_empresa: 2 }];
    }
    if (sql.startsWith('INSERT INTO ge_contactos')) return { insertId: 99 };
    return { affectedRows: 1 };
  });
  const conn = await pool.getConnection();
  const copy = await empresaDatos.freezeCoordinadorForOtherSolicitudes(conn, 50, 3);
  assert.equal(copy, 99);
  assert.deepEqual(pool.calls[0].params, [50, 3, 3]);
  assert.deepEqual(calls('UPDATE dual_solicitudes_empresa SET id_coordinador_empresa')[0].params, [99, [1, 2]]);

  reset(() => []);
  assert.equal(await empresaDatos.freezeCoordinadorForOtherSolicitudes(conn, 50, 3), null);
  assert.equal(calls('INSERT INTO ge_contactos').length, 0, 'no copy when nothing else shares the contact');
});

test('D4: transports are written per application and mark the data as known', async () => {
  const empresaDatos = load('src/services/empresaDatos');
  reset(() => ({ affectedRows: 1 }));
  const conn = await pool.getConnection();
  await empresaDatos.replaceTransportesSolicitud(conn, 8, [2, 3]);
  assert.deepEqual(calls('DELETE FROM dual_solicitud_empresa_transportes')[0].params, [8]);
  assert.equal(calls('INSERT IGNORE INTO dual_solicitud_empresa_transportes').length, 2);
  assert.ok(!pool.calls.some((c) => /dual_empresa_transportes/.test(c.sql)), 'company-wide table no longer written');
});

test('V-3 / V-6: DATE as strings; DNI looked up on the indexed column', () => {
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  assert.match(src('db/pool.js'), /dateStrings: \['DATE'\]/);
  for (const f of ['services/solicitudesAlumnoService.js', 'services/authService.js']) {
    assert.doesNotMatch(src(f), /UPPER\(TRIM\((a\.)?dni\)\)/, f);
  }
});
