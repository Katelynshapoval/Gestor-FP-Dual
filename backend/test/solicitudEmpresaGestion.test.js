// Company applications after the form: staff lists and decisions, the company's
// own application, re-applying in a new convocatoria, staff editing the data,
// and the company's change requests (send, approve with conflict check, reject).
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let st = {};
const pool = fakePool((sql, params) => {
  for (const [match, out] of st.respuestas || []) {
    if (sql.includes(match)) return typeof out === 'function' ? out(sql, params) : out;
  }
  if (sql.includes('SELECT d.idempresa FROM dual_usuarios u')) return st.empresa ? [{ idempresa: st.empresa }] : [];
  if (sql.startsWith('SELECT id_convocatoria, nombre, fecha_inicio, fecha_fin FROM dual_convocatorias WHERE activa = 1')) {
    return st.convocatoria ? [st.convocatoria] : [];
  }
  if (sql.startsWith('INSERT')) return { insertId: 500, affectedRows: 1 };
  return [];
});
stub('src/db/pool', pool);
stub('src/mail/config', { transporter: { mode: 'log', sendMail: async () => ({}) } });
const real = require('../src/services/empresaDatos');
const aplicados = [];
const congelados = [];
stub('src/services/empresaDatos', {
  ...real,
  loadEmpresaDatosRead: async (_c, id) => (st.datos && id === st.datos.id_solicitud_empresa ? { ...st.datos } : null),
  loadEmpresaDatos: async () => ({ ...(st.vivo || st.datos) }),
  applyEmpresaDatos: async (_c, _ctx, proposed, opts) => {
    if (st.falloAplicar) throw st.falloAplicar;
    aplicados.push([proposed, opts]);
  },
  freezeCoordinadorForOtherSolicitudes: async (_c, id, keep) => { congelados.push([id, keep]); return 900; },
});
const transiciones = [];
stub('src/services/solicitudTransiciones', {
  aplicarTransicion: async (...a) => { transiciones.push(a); return st.transicion || { ok: true }; },
});
const generados = [];
stub('src/services/documentGenerationService', {
  generateDocument: async (a) => { generados.push(a); return { ok: false }; },
});
const avisos = [];
stub('src/services/notificaciones', new Proxy({}, { get: (_t, n) => async (...a) => { avisos.push([n, ...a]); } }));

const svc = load('src/services/solicitudesEmpresaService');

const ADMIN = { id: 1, rol: 'ADMINISTRADOR' };
const EMPRESA = { id: 3, rol: 'EMPRESA' };

const DATOS = {
  id_solicitud_empresa: 10, id_empresa: 100, convocatoria_activa: true, estado_validacion: 'PENDIENTE',
  empresa: 'ACME', domicilioLegal: 'C/ Mayor 1', cpLegal: '50001', provinciaLegal: 'Zaragoza', localidadLegal: 'Zaragoza',
  dniRepresentante: '12345678Z', nombreRepresentante: 'Ana', emailRepresentante: 'a@acme.test', telefonoRepresentante: '600000000',
  dniCoordinador: '87654321X', nombreCoordinador: 'Luis', emailCoordinador: 'l@acme.test', telefonoCoordinador: '600000001',
  descripcion_puesto: 'Taller', web: '', cif: 'B12345674', transportes: [],
};

async function llamar(fn, { user = ADMIN, params = {}, body = {}, query = {}, ...estado } = {}) {
  st = { empresa: 100, convocatoria: { id_convocatoria: 6, nombre: '2027/2028' }, datos: { ...DATOS }, ...estado };
  for (const l of [aplicados, congelados, transiciones, generados, avisos, pool.calls]) l.length = 0;
  const res = mockRes();
  await svc[fn](mockReq({ params: { id: '10', ...params }, body, query, user }), res);
  return res;
}
const escrituras = () => pool.calls.filter((c) => /^(INSERT|UPDATE|DELETE)/.test(c.sql));
const hubo = (sql) => pool.calls.some((c) => c.sql === sql);

// ── Staff lists and decisions ───────────────────────────────────────────────

test('staff list: optional state (any case) and convocatoria filters', async () => {
  await llamar('getAll', { query: { estado: 'validado', convocatoria: '5' } });
  const q = pool.calls[0];
  assert.match(q.sql, /AND ev\.nombre = \? AND se\.id_convocatoria = \? ORDER BY/);
  assert.deepEqual(q.params, ['VALIDADO', '5']);
  await llamar('getAll');
  assert.deepEqual(pool.calls[0].params, []);
});

test('validate, reject and reopen go through the common transition; rejecting needs a reason', async () => {
  for (const fn of ['validar', 'rechazar', 'reabrir']) {
    assert.equal((await llamar(fn, { params: { id: 'x' }, body: { motivo: 'm' } })).statusCode, 400, fn);
  }
  assert.equal((await llamar('rechazar', { body: { motivo: '  ' } })).statusCode, 400);
  assert.equal(transiciones.length, 0);

  let res = await llamar('validar');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(transiciones[0], ['SOLICITUD_EMPRESA', 10, 'VALIDAR', { user: ADMIN }]);
  res = await llamar('rechazar', { body: { motivo: ' Falta convenio ' } });
  assert.deepEqual(transiciones[0], ['SOLICITUD_EMPRESA', 10, 'RECHAZAR', { user: ADMIN, motivo: 'Falta convenio' }]);
  res = await llamar('reabrir', { body: {} });
  assert.deepEqual(transiciones[0], ['SOLICITUD_EMPRESA', 10, 'REABRIR', { user: ADMIN, motivo: null }]);

  res = await llamar('validar', { transicion: { ok: false, status: 409, error: 'Convenio sin validar', code: 'CONVENIO' } });
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: 'Convenio sin validar', code: 'CONVENIO' });
});

test('full staff list joins ciclos, transports, convenio and pending change per application', async () => {
  let res = await llamar('getTodas');
  assert.deepEqual(res.body, []);
  assert.equal(pool.calls.length, 1, 'nothing else is read when there are no applications');

  res = await llamar('getTodas', {
    respuestas: [
      ['AS motivo_baja', [
        { id_solicitud_empresa: 10, razonSocial: 'ACME', convocatoria_activa: 1, transportes_conocidos: 1, fecha_solicitud: 'f10' },
        { id_solicitud_empresa: 11, razonSocial: 'Beta', convocatoria_activa: 0, transportes_conocidos: 0, fecha_solicitud: 'f11' },
      ]],
      ['WHERE see.id_solicitud_empresa IN (?)', [{ id_solicitud_empresa: 10, id_solicitud_empresa_especialidad: 5, id_especialidad: 2, nombre: 'Joyería', codigo: 'JOY', turno: 'DIURNO', cantidad_alumnos: 3 }]],
      ['FROM dual_solicitud_empresa_transportes det', [{ id_solicitud_empresa: 11, id_transporte: 1, nombre: 'bus', nombre_mostrar: 'Autobús' }]],
      ["td.nombre = 'CONVENIO'", [
        { id_solicitud_empresa: 10, id_documento: 70, estado_validacion: 'VALIDADO', motivo: null },
        { id_solicitud_empresa: 10, id_documento: 60, estado_validacion: 'RECHAZADO', motivo: 'viejo' },
      ]],
      ['FROM dual_empresa_cambios', [{ id_solicitud_empresa: 11, id_cambio: 3, fecha_solicitud: 'c3' }]],
    ],
  });
  const [a, b] = res.body;
  assert.equal(a.empresa, 'ACME');
  assert.equal(a.idAuxEmpresa, 10);
  assert.equal(a.convocatoria_activa, true);
  assert.equal(b.convocatoria_activa, false);
  assert.equal(b.transportes_conocidos, false);
  assert.deepEqual(a.especialidades.map((e) => e.nombre), ['Joyería']);
  assert.deepEqual(b.especialidades, []);
  assert.deepEqual(b.transportes, [{ id_transporte: 1, nombre: 'Autobús' }]);
  assert.deepEqual([a.tieneConvenio, a.convenio_validado, a.convenio_estado, a.id_documento_convenio], [1, 1, 'VALIDADO', 70], 'the newest convenio counts');
  assert.deepEqual([b.tieneConvenio, b.convenio_estado], [0, null]);
  assert.deepEqual([a.cambio_pendiente, b.cambio_pendiente, b.id_cambio_pendiente], [0, 1, 3]);
});

test('full staff list still works without the change-requests table, but other errors surface', async () => {
  const sinTabla = Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' });
  const res = await llamar('getTodas', {
    respuestas: [['AS motivo_baja', [{ id_solicitud_empresa: 10 }]], ['FROM dual_empresa_cambios', () => { throw sinTabla; }]],
  });
  assert.equal(res.body[0].cambio_pendiente, 0);
  await assert.rejects(llamar('getTodas', {
    respuestas: [['AS motivo_baja', [{ id_solicitud_empresa: 10 }]], ['FROM dual_empresa_cambios', () => { throw new Error('boom'); }]],
  }), /boom/);
});

// ── The company's own application ───────────────────────────────────────────

test('own application: active convocatoria by default; with history it says whether it may re-apply', async () => {
  assert.equal((await llamar('getMia', { user: EMPRESA, empresa: null })).statusCode, 404);
  let res = await llamar('getMia', { user: EMPRESA });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'SIN_SOLICITUD');
  assert.match(pool.calls.at(-1).sql, /AND c\.activa = 1/);

  const antigua = { id_solicitud_empresa: 9, convocatoria_activa: 0 };
  res = await llamar('getMia', { user: EMPRESA, query: { incluir_anteriores: '1' }, respuestas: [['WHERE se.id_empresa = ?', [antigua]]] });
  assert.ok(!pool.calls.find((c) => c.sql.includes('WHERE se.id_empresa = ?')).sql.includes('AND c.activa = 1'));
  assert.deepEqual([res.body.convocatoria_activa, res.body.puede_reaplicar], [false, true]);
  assert.deepEqual(res.body.convocatoria_abierta, { id_convocatoria: 6, nombre: '2027/2028' });

  res = await llamar('getMia', { user: EMPRESA, query: { incluir_anteriores: '1' }, convocatoria: null, respuestas: [['WHERE se.id_empresa = ?', [antigua]]] });
  assert.deepEqual([res.body.puede_reaplicar, res.body.convocatoria_abierta], [false, null]);

  res = await llamar('getMia', { user: EMPRESA, query: { incluir_anteriores: '1' }, respuestas: [['WHERE se.id_empresa = ?', [{ ...antigua, convocatoria_activa: 1 }]]] });
  assert.equal(res.body.puede_reaplicar, false, 'already applied this year');
});

// ── Re-applying ─────────────────────────────────────────────────────────────

const PREVIA = { id_representante_legal: 21, id_domicilio_legal: 31, id_domicilio_trabajo: 32, id_coordinador_actual: 41, id_domicilio_coord: 32 };
const REAPPLY = { especialidades: [{ idEspecialidad: 2, cantidadAlumnos: 2 }], transportes: [3], descripcion_puesto: 'Taller 2' };
const reaplicar = (body, extra = {}) => llamar('reapply', {
  user: EMPRESA, body,
  respuestas: [
    ['FROM dual_solicitudes_empresa WHERE id_empresa = ? AND id_convocatoria = ?', extra.yaExiste ? [{ id_solicitud_empresa: 1 }] : []],
    ['ORDER BY se.fecha_solicitud DESC LIMIT 1', extra.sinPrevia ? [] : [PREVIA]],
    ['SELECT nombre, email, telefono FROM ge_contactos', [{ nombre: 'Luis', email: 'l@acme.test', telefono: '600000001' }]],
  ],
  ...extra,
});

test('re-apply: needs a company, an open convocatoria and at least one ciclo', async () => {
  assert.equal((await reaplicar(REAPPLY, { empresa: null })).statusCode, 404);
  const sin = await reaplicar(REAPPLY, { convocatoria: null });
  assert.equal(sin.statusCode, 409);
  assert.equal(sin.body.code, 'SIN_CONVOCATORIA');
  assert.equal((await reaplicar({ especialidades: [] })).statusCode, 400);
  assert.equal(escrituras().length, 0);
});

test('re-apply: refused when it already applied this year or never applied before', async () => {
  let res = await reaplicar(REAPPLY, { yaExiste: true });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'SOLICITUD_EXISTENTE');
  assert.ok(hubo('ROLLBACK'));
  res = await reaplicar(REAPPLY, { sinPrevia: true });
  assert.equal(res.statusCode, 404);
  assert.equal(escrituras().length, 0);
});

test('re-apply: reuses the previous data, keeps the coordinator, adds ciclos and transports, then confirms', async () => {
  const res = await reaplicar(REAPPLY);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const ins = escrituras().find((c) => c.sql.startsWith('INSERT INTO dual_solicitudes_empresa'));
  assert.deepEqual(ins.params, [100, 6, 21, 41, 31, 32, 'Taller 2']);
  assert.deepEqual(congelados, [], 'same coordinator: nothing to freeze');
  assert.ok(!escrituras().some((c) => c.sql.startsWith('UPDATE ge_contactos')));
  assert.ok(escrituras().some((c) => c.sql.startsWith('INSERT IGNORE INTO dual_empresa_tutores') && c.params[1] === 41));
  assert.deepEqual(escrituras().find((c) => c.sql.startsWith('INSERT INTO dual_solicitud_empresa_especialidades')).params, [500, 2, 2]);
  assert.ok(escrituras().some((c) => c.sql.startsWith('INSERT IGNORE INTO dual_solicitud_empresa_transportes') && c.params[1] === 3));
  assert.ok(hubo('COMMIT'));
  assert.deepEqual(generados.map((g) => [g.clave, g.parents.id_solicitud_empresa, g.userId]), [['CONVENIO', 500, 3]]);
  assert.deepEqual(avisos, [['solicitudEmpresaRecibida', 500, null]]);
});

test('re-apply: a new coordinator name freezes the old one for past years and renames the login', async () => {
  const res = await reaplicar({ ...REAPPLY, nombreCoordinador: 'Marta', emailCoordinador: 'm@acme.test' });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(congelados, [[41, null]]);
  const upd = escrituras().find((c) => c.sql.startsWith('UPDATE ge_contactos'));
  assert.deepEqual(upd.params, ['Marta', 'm@acme.test', undefined, 41]);
  assert.deepEqual(escrituras().find((c) => c.sql.startsWith('UPDATE dual_usuarios')).params, ['Marta', 41]);
});

test('re-apply: a bad ciclo rolls everything back', async () => {
  for (const especialidades of [[{ idEspecialidad: 2, cantidadAlumnos: 0 }], [{ idEspecialidad: 2, cantidadAlumnos: 99 }]]) {
    const res = await reaplicar({ especialidades });
    assert.equal(res.statusCode, 400);
    assert.ok(hubo('ROLLBACK') && !hubo('COMMIT'));
    assert.equal(generados.length, 0);
  }
});

// ── Staff editing company data ──────────────────────────────────────────────

test('staff edit: active convocatoria only, something must change, the CIF is allowed', async () => {
  let res = await llamar('putDatos', { body: { web: 'x' }, datos: { ...DATOS, convocatoria_activa: false } });
  assert.equal(res.statusCode, 400);
  res = await llamar('putDatos', { body: { empresa: ' ACME ' } });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /No hay cambios/);
  assert.equal(aplicados.length, 0);

  res = await llamar('putDatos', { body: { cif: 'b12345675', web: 'https://acme.test', hack: 1 } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(aplicados, [[{ cif: 'B12345675', web: 'https://acme.test' }, { allowCif: true }]]);
  assert.ok(hubo('COMMIT'));
});

test('staff edit: a validation error from applying is returned and rolled back', async () => {
  const res = await llamar('putDatos', {
    body: { cif: 'B00000001' },
    falloAplicar: Object.assign(new Error('El CIF indicado no es válido.'), { status: 400 }),
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /CIF/);
  assert.ok(hubo('ROLLBACK') && !hubo('COMMIT'));
});

// ── Company change requests ─────────────────────────────────────────────────

test('change request: must change something and leave the data complete', async () => {
  let res = await llamar('upsertCambio', { user: EMPRESA, body: { empresa: 'ACME' } });
  assert.equal(res.statusCode, 400);
  res = await llamar('upsertCambio', { user: EMPRESA, body: { emailCoordinador: '  ' } });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Email coordinador/);
  assert.equal(escrituras().length, 0);
});

test('change request: a new one is created (201); a pending one is replaced (200)', async () => {
  const fila = (id) => [{ id_cambio: id, id_solicitud_empresa: 10, estado: 'PENDIENTE', payload: JSON.stringify({ proposed: { web: 'https://n.test' }, snapshot: {} }) }];
  let res = await llamar('upsertCambio', { user: EMPRESA, body: { web: 'https://n.test' }, respuestas: [['SELECT * FROM dual_empresa_cambios WHERE id_cambio = ?', fila(500)]] });
  assert.equal(res.statusCode, 201);
  const ins = escrituras()[0];
  assert.match(ins.sql, /^INSERT INTO dual_empresa_cambios/);
  assert.deepEqual(ins.params.slice(0, 3), [10, 100, 3]);
  assert.deepEqual(JSON.parse(ins.params[3]).proposed, { web: 'https://n.test' });
  assert.deepEqual(res.body.cambio.diff, [{ field: 'web', label: 'Web', actual: '—', solicitado: 'https://n.test' }]);

  res = await llamar('upsertCambio', {
    user: EMPRESA, body: { web: 'https://n.test' },
    respuestas: [['FOR UPDATE', [{ id_cambio: 7 }]], ['SELECT * FROM dual_empresa_cambios WHERE id_cambio = ?', fila(7)]],
  });
  assert.equal(res.statusCode, 200);
  assert.match(escrituras()[0].sql, /^UPDATE dual_empresa_cambios SET payload = \?/);
  assert.equal(escrituras()[0].params[1], 7);
});

test('change request view: the pending one and the last resolved one, with their differences', async () => {
  const res = await llamar('getCambio', {
    user: EMPRESA,
    respuestas: [
      ['AND estado = ? ORDER BY id_cambio DESC', [{ id_cambio: 8, estado: 'PENDIENTE', payload: JSON.stringify({ proposed: { web: 'https://n.test' } }) }]],
      ['AND estado <> ?', [{ id_cambio: 6, estado: 'RECHAZADO', motivo: 'No', payload: '{roto' }]],
      ['FROM dual_transportes', [{ id_transporte: 1, nombre: 'bus' }]],
    ],
  });
  assert.equal(res.body.pending.id_cambio, 8);
  assert.equal(res.body.pending.diff[0].solicitado, 'https://n.test');
  assert.deepEqual([res.body.ultimo.estado, res.body.ultimo.motivo, res.body.ultimo.proposed], ['RECHAZADO', 'No', {}]);
});

const CAMBIO = (extra = {}) => [{
  id_cambio: 7, id_solicitud_empresa: 10, estado: 'PENDIENTE',
  payload: JSON.stringify({ proposed: { web: 'https://n.test' }, snapshot: real.pickSnapshot(DATOS) }), ...extra,
}];

test('approve: unknown or already resolved requests are refused', async () => {
  let res = await llamar('aprobarCambio', { params: { idCambio: '7' } });
  assert.equal(res.statusCode, 404);
  res = await llamar('aprobarCambio', { params: { idCambio: '7' }, respuestas: [['FOR UPDATE', CAMBIO({ estado: 'APROBADO' })]] });
  assert.equal(res.statusCode, 400);
  assert.equal(aplicados.length, 0);
});

test('approve: applied without the CIF, request marked APROBADO in the same transaction', async () => {
  const res = await llamar('aprobarCambio', { params: { idCambio: '7' }, respuestas: [['FOR UPDATE', CAMBIO()]] });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(aplicados, [[{ web: 'https://n.test' }, { allowCif: false }]]);
  const upd = escrituras().find((c) => c.sql.startsWith('UPDATE dual_empresa_cambios'));
  assert.deepEqual(upd.params, ['APROBADO', 1, 7]);
  assert.ok(hubo('COMMIT'));
});

test('approve: if someone changed the same field meanwhile, ask first (409), apply only when confirmed', async () => {
  const vivo = { ...DATOS, web: 'https://otro.test' };
  let res = await llamar('aprobarCambio', { params: { idCambio: '7' }, vivo, respuestas: [['FOR UPDATE', CAMBIO()]] });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.requires_confirm, true);
  assert.deepEqual(res.body.conflictos.map((c) => [c.field, c.actual, c.solicitado]), [['web', 'https://otro.test', 'https://n.test']]);
  assert.equal(aplicados.length, 0);
  assert.ok(hubo('ROLLBACK'));

  res = await llamar('aprobarCambio', { params: { idCambio: '7' }, body: { confirmar_conflicto: true }, vivo, respuestas: [['FOR UPDATE', CAMBIO()]] });
  assert.equal(res.statusCode, 200);
  assert.equal(aplicados.length, 1);
});

test('reject: needs a reason; only pending requests; the reason is stored', async () => {
  assert.equal((await llamar('rechazarCambio', { params: { idCambio: '7' }, body: {} })).statusCode, 400);
  assert.equal((await llamar('rechazarCambio', { params: { idCambio: '7' }, body: { motivo: 'No' } })).statusCode, 404);
  assert.equal((await llamar('rechazarCambio', { params: { idCambio: '7' }, body: { motivo: 'No' }, respuestas: [['SELECT id_cambio, estado', [{ id_cambio: 7, estado: 'RECHAZADO' }]]] })).statusCode, 400);
  const res = await llamar('rechazarCambio', { params: { idCambio: '7' }, body: { motivo: ' Datos falsos ' }, respuestas: [['SELECT id_cambio, estado', [{ id_cambio: 7, estado: 'PENDIENTE' }]]] });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(escrituras()[0].params, ['RECHAZADO', 1, 'Datos falsos', 7]);
});
