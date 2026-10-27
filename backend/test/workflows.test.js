// Phase 1 · WF-1 (data for the contract-type control), WF-2, WF-3
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, fakeBcrypt, mockReq, mockRes } = require('./helpers/harness');

let handler = () => [];
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);
stub('bcrypt', fakeBcrypt);

// ── WF-3 ────────────────────────────────────────────────────────────────
function convocatoriaDb(rows) {
  const state = rows.map((r) => ({ ...r }));
  handler = (sql, params) => {
    if (sql.startsWith('SELECT id_convocatoria, activa, (fecha_inicio <= CURDATE()')) {
      return state.map((r) => ({ id_convocatoria: r.id, activa: r.activa, vigente: r.vigente ? 1 : 0 }));
    }
    if (sql.startsWith('UPDATE dual_convocatorias SET activa = 0 WHERE id_convocatoria IN')) {
      // Trigger emulation is not needed: the order (deactivate first) is asserted below
      for (const r of state) if (params[0].includes(r.id)) r.activa = 0;
      return { affectedRows: 1 };
    }
    if (sql.startsWith('UPDATE dual_convocatorias SET activa = 1 WHERE id_convocatoria = ?')) {
      assert.equal(state.filter((r) => r.activa).length, 0, 'one-active rule: activate only after deactivating');
      state.find((r) => r.id === params[0]).activa = 1;
      return { affectedRows: 1 };
    }
    return [];
  };
  return state;
}

test('WF-3: the convocatoria whose dates include today becomes the only active one', async () => {
  const svc = load('src/services/convocatoriasService');
  // rows come ordered by fecha_inicio DESC
  const state = convocatoriaDb([
    { id: 3, activa: 0, vigente: true },
    { id: 2, activa: 1, vigente: false },
  ]);
  const out = await svc.syncConvocatoriaActiva();
  assert.equal(out.activeId, 3);
  assert.deepEqual(state.map((r) => [r.id, r.activa]), [[3, 1], [2, 0]]);
  assert.ok(pool.calls.some((c) => c.sql === 'COMMIT'));
});

test('WF-3: after the end date nothing stays active; no-op when already correct', async () => {
  const svc = load('src/services/convocatoriasService');
  let state = convocatoriaDb([{ id: 2, activa: 1, vigente: false }]);
  let out = await svc.syncConvocatoriaActiva();
  assert.equal(out.activeId, null);
  assert.equal(state[0].activa, 0);

  state = convocatoriaDb([{ id: 4, activa: 1, vigente: true }]);
  pool.calls.length = 0;
  out = await svc.syncConvocatoriaActiva();
  assert.equal(out.changed, false);
  assert.equal(pool.calls.filter((c) => c.sql.startsWith('UPDATE')).length, 0);
});

test('WF-3: create rejects inverted and overlapping ranges', async () => {
  const svc = load('src/services/convocatoriasService');
  handler = (sql) => (sql.startsWith('SELECT nombre FROM dual_convocatorias') ? [{ nombre: '2025-2026' }] : []);
  let res = mockRes();
  await svc.create(mockReq({ body: { nombre: 'X', fecha_inicio: '2026-09-01', fecha_fin: '2026-01-01' } }), res);
  assert.equal(res.statusCode, 400);
  res = mockRes();
  await svc.create(mockReq({ body: { nombre: 'X', fecha_inicio: '2026-09-01', fecha_fin: '2027-06-30' } }), res);
  assert.equal(res.statusCode, 409);
  res = mockRes();
  await svc.create(mockReq({ body: { nombre: 'X', fecha_inicio: '01/09/2026', fecha_fin: '2027-06-30' } }), res);
  assert.equal(res.statusCode, 400);
});

// ── WF-2 ────────────────────────────────────────────────────────────────
function empresaDb({ latest, active }) {
  handler = (sql) => {
    if (sql.startsWith('SELECT d.idempresa FROM dual_usuarios')) return [{ idempresa: 7 }];
    if (sql.includes('FROM dual_solicitudes_empresa se JOIN ge_empresas emp')) {
      if (!latest) return [];
      if (sql.includes('AND c.activa = 1') && !latest.convocatoria_activa) return [];
      return [{ id_solicitud_empresa: latest.id, convocatoria: latest.conv, convocatoria_activa: latest.convocatoria_activa }];
    }
    if (sql.startsWith('SELECT id_convocatoria, nombre, fecha_inicio, fecha_fin FROM dual_convocatorias WHERE activa = 1')) {
      return active ? [active] : [];
    }
    return [];
  };
}

test('WF-2: without the flag, /mia keeps its contract (404 between convocatorias)', async () => {
  const svc = load('src/services/solicitudesEmpresaService');
  empresaDb({ latest: { id: 10, conv: '2025-2026', convocatoria_activa: 0 }, active: { id_convocatoria: 5, nombre: '2026-2027' } });
  const res = mockRes();
  await svc.getMia(mockReq({ user: { id: 1, rol: 'EMPRESA' } }), res);
  assert.equal(res.statusCode, 404);
});

test('WF-2: with incluir_anteriores=1 a returning company gets its last application and puede_reaplicar', async () => {
  const svc = load('src/services/solicitudesEmpresaService');
  empresaDb({ latest: { id: 10, conv: '2025-2026', convocatoria_activa: 0 }, active: { id_convocatoria: 5, nombre: '2026-2027' } });
  const res = mockRes();
  await svc.getMia(mockReq({ user: { id: 1, rol: 'EMPRESA' }, query: { incluir_anteriores: '1' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id_solicitud_empresa, 10);
  assert.equal(res.body.convocatoria_activa, false);
  assert.equal(res.body.puede_reaplicar, true);
  assert.equal(res.body.convocatoria_abierta.nombre, '2026-2027');
});

test('WF-2: no re-apply when already in the active convocatoria or when none is open', async () => {
  const svc = load('src/services/solicitudesEmpresaService');
  empresaDb({ latest: { id: 11, conv: '2026-2027', convocatoria_activa: 1 }, active: { id_convocatoria: 5, nombre: '2026-2027' } });
  let res = mockRes();
  await svc.getMia(mockReq({ user: { id: 1, rol: 'EMPRESA' }, query: { incluir_anteriores: '1' } }), res);
  assert.equal(res.body.puede_reaplicar, false);

  empresaDb({ latest: { id: 10, conv: '2025-2026', convocatoria_activa: 0 }, active: null });
  res = mockRes();
  await svc.getMia(mockReq({ user: { id: 1, rol: 'EMPRESA' }, query: { incluir_anteriores: '1' } }), res);
  assert.equal(res.body.puede_reaplicar, false);
});

// ── WF-1 ────────────────────────────────────────────────────────────────
test('WF-1: staff reservation list exposes id_tipo_contrato for the inline control', async () => {
  const svc = load('src/services/reservasService');
  let captured = '';
  handler = (sql) => { captured = sql; return []; };
  await svc.getAll(mockReq({ user: { id: 1, rol: 'ADMINISTRADOR' } }), mockRes());
  assert.match(captured, /r\.id_tipo_contrato/);
});
