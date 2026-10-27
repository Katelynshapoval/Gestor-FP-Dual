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
