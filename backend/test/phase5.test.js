// Phase 5 · «Dar de baja» / «Reactivar» (bajaService) and the read-only
// documents of a cancelled reservation. No database: the pool is a fake.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let handler = () => [];
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);

const avisos = [];
stub('src/services/notificaciones', {
  reservaCancelada: (id, opts) => avisos.push({ id, ...opts }),
});

const { bajaTransicion } = load('src/services/estadoReglas');

test('baja rules: needs a reason, not twice; reactivar only from BAJA', () => {
  assert.equal(bajaTransicion('VALIDADO', 'BAJA', { motivo: 'Abandona el ciclo' }), null);
  assert.equal(bajaTransicion('PENDIENTE', 'BAJA', { motivo: 'x' }), null);
  assert.equal(bajaTransicion('RECHAZADO', 'BAJA', { motivo: 'x' }), null);
  assert.equal(bajaTransicion('VALIDADO', 'BAJA', { motivo: '  ' }).code, 'MOTIVO_OBLIGATORIO');
  assert.equal(bajaTransicion('BAJA', 'BAJA', { motivo: 'x' }).code, 'YA_DE_BAJA');
  assert.equal(bajaTransicion(null, 'BAJA', { motivo: 'x' }).status, 404);
  assert.equal(bajaTransicion('BAJA', 'REACTIVAR'), null);
  assert.equal(bajaTransicion('VALIDADO', 'REACTIVAR').code, 'ESTADO_NO_PERMITE');
});

function bajaDb({ estado = 'VALIDADO', reservas = [], falla = [], sinMigracion = false } = {}) {
  return (sql, params) => {
    if (sql.includes('FOR UPDATE')) return estado ? [{ estado, owner_id: 77 }] : [];
    if (sql.startsWith('SELECT id_estado_validacion FROM dual_estados_validacion')) return sinMigracion ? [] : [{ id_estado_validacion: 4 }];
    if (sql.startsWith('UPDATE dual_usuarios')) return { affectedRows: 1 };
    if (sql.startsWith('UPDATE dual_solicitudes')) return { affectedRows: 1 };
    if (sql.includes('FROM dual_reservas r')) return reservas;
    if (sql.startsWith('INSERT INTO dual_eventos')) return { insertId: 1 };
    if (sql.startsWith('CALL sp_cancelar_reserva_admin')) {
      if (falla.includes(params[0])) throw Object.assign(new Error('fallo'), { sqlState: '45000' });
      return [];
    }
    return [];
  };
}

test('student baja: state, account off, every active reservation cancelled, companies told', async () => {
  const { darDeBaja } = load('src/services/bajaService');
  pool.calls.length = 0;
  avisos.length = 0;
  handler = bajaDb({
    reservas: [
      { id_reserva: 5, estado_reserva: 'CONFIRMADA' },
      { id_reserva: 6, estado_reserva: 'PENDIENTE' },
    ],
  });
  const out = await darDeBaja('SOLICITUD_ALUMNO', 10, { user: { id: 1, rol: 'ADMINISTRADOR' }, motivo: 'Abandona el ciclo' });
  assert.deepEqual(out, { ok: true, canceladas: [5, 6], pendientes: [] });

  const sqls = pool.calls.map((c) => c.sql);
  const commit = sqls.indexOf('COMMIT');
  assert.ok(sqls.findIndex((s) => s.includes("WHERE nombre = 'BAJA'")) < commit, 'state change inside the transaction');
  assert.ok(sqls.findIndex((s) => s.startsWith('UPDATE dual_usuarios SET activo')) < commit, 'account off inside the transaction');
  const cancels = pool.calls.filter((c) => c.sql.startsWith('CALL sp_cancelar_reserva_admin'));
  assert.deepEqual(cancels.map((c) => c.params[0]), [5, 6]);
  assert.ok(sqls.indexOf(cancels[0].sql) > commit, 'reservations cancelled after the baja commits');
  assert.match(cancels[0].params[1], /^Baja del alumno en el programa: Abandona el ciclo$/);
  // The row keeps motivo NULL (triggers); the reason is in the event.
  const update = pool.calls.find((c) => c.sql.startsWith('UPDATE dual_solicitudes_alumno'));
  assert.match(update.sql, /motivo = NULL/);
  const ev = pool.calls.find((c) => c.sql.startsWith('INSERT INTO dual_eventos') && c.params[2] === 'BAJA');
  assert.deepEqual(ev.params.slice(0, 5), ['SOLICITUD_ALUMNO', 10, 'BAJA', 'VALIDADO', 'BAJA']);
  assert.equal(ev.params[7], 'Abandona el ciclo');
  assert.deepEqual(avisos.map((a) => [a.id, a.avisarAlumno, a.avisarEmpresa]), [[5, false, true], [6, false, true]]);
});

test('company baja: students are told, a failed cancellation is reported, not fatal', async () => {
  const { darDeBaja } = load('src/services/bajaService');
  avisos.length = 0;
  handler = bajaDb({ reservas: [{ id_reserva: 8, estado_reserva: 'PENDIENTE' }, { id_reserva: 9, estado_reserva: 'PENDIENTE' }], falla: [9] });
  const out = await darDeBaja('SOLICITUD_EMPRESA', 3, { user: { id: 1 }, motivo: 'Cierra el centro de trabajo' });
  assert.deepEqual(out, { ok: true, canceladas: [8], pendientes: [9] });
  assert.deepEqual(avisos, [{ id: 8, avisarAlumno: true, avisarEmpresa: false }]);
  const cuentas = pool.calls.find((c) => c.sql.startsWith('UPDATE dual_usuarios u'));
  assert.match(cuentas.sql, /ro\.nombre = 'EMPRESA' AND d\.idempresa = \?/);
  assert.deepEqual(cuentas.params, [0, 77]);
});

test('baja refused: rolls back and touches nothing', async () => {
  const { darDeBaja } = load('src/services/bajaService');
  pool.calls.length = 0;
  handler = bajaDb({ estado: 'BAJA' });
  const out = await darDeBaja('SOLICITUD_ALUMNO', 10, { user: {}, motivo: 'x' });
  assert.equal(out.code, 'YA_DE_BAJA');
  assert.ok(pool.calls.some((c) => c.sql === 'ROLLBACK'));
  assert.ok(!pool.calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('CALL')));
});

test('reactivar restores the previous state (and the rejection reason) and the account', async () => {
  const { reactivar } = load('src/services/bajaService');
  for (const [anterior, motivoEsperado] of [['VALIDADO', null], ['RECHAZADO', 'CV ilegible']]) {
    pool.calls.length = 0;
    handler = (sql) => {
      if (sql.includes('FOR UPDATE')) return [{ estado: 'BAJA', owner_id: 77 }];
      if (sql.includes("accion = 'BAJA'")) return [{ estado_anterior: anterior }];
      if (sql.includes("accion = 'RECHAZAR'")) return [{ motivo: 'CV ilegible' }];
      if (sql.startsWith('UPDATE')) return { affectedRows: 1 };
      return [];
    };
    const out = await reactivar('SOLICITUD_ALUMNO', 10, { user: { id: 1 } });
    assert.deepEqual(out, { ok: true, estado: anterior });
    const upd = pool.calls.find((c) => c.sql.startsWith('UPDATE dual_solicitudes_alumno'));
    assert.deepEqual(upd.params, [anterior, motivoEsperado, 10]);
    const cuenta = pool.calls.find((c) => c.sql.startsWith('UPDATE dual_usuarios'));
    assert.deepEqual(cuenta.params, [1, 77]);
    assert.ok(!pool.calls.some((c) => c.sql.startsWith('CALL')), 'reservations are not restored');
  }
});

test('baja handler: message counts the cancelled reservations', async () => {
  const { handlers } = load('src/services/bajaService');
  handler = bajaDb({ reservas: [{ id_reserva: 5, estado_reserva: 'PENDIENTE' }] });
  const res = mockRes();
  await handlers('SOLICITUD_ALUMNO').baja(mockReq({ params: { id: '10' }, body: { motivo: 'x' }, user: { id: 1 } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Baja registrada. Se ha cancelado 1 reserva.');
  const bad = mockRes();
  await handlers('SOLICITUD_ALUMNO').baja(mockReq({ params: { id: 'x' } }), bad);
  assert.equal(bad.statusCode, 400);
});

test("baja without migration 016: clear error, nothing changed", async () => {
  const { darDeBaja } = load("src/services/bajaService");
  pool.calls.length = 0;
  handler = bajaDb({ sinMigracion: true });
  const out = await darDeBaja("SOLICITUD_ALUMNO", 10, { user: {}, motivo: "x" });
  assert.equal(out.code, "MIGRACION_PENDIENTE");
  assert.ok(!pool.calls.some((c) => c.sql.startsWith("UPDATE")));
});
