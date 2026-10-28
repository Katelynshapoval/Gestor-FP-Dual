// Database improvement plan · Stage 2 — backend transaction helper and the
// reservation endpoints' transaction boundaries. MOCKED: no database (the
// real-MySQL tests are in test/db/stage2.db.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let handler = () => [];
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);

const avisos = [];
stub('src/services/notificaciones', {
  reservaCreada: (id) => avisos.push(['creada', id]),
  reservaCancelada: (id) => avisos.push(['cancelada', id]),
  reservaConfirmada: (id) => avisos.push(['confirmada', id]),
});

// Pool whose connections record their own calls and lifecycle.
function trackingPool(onQuery) {
  const log = [];
  let n = 0;
  return {
    log,
    async getConnection() {
      n += 1;
      const id = n;
      return {
        async query(sql) {
          log.push([id, sql]);
          const out = await onQuery(sql, id);
          return [out ?? [], []];
        },
        release: () => log.push([id, 'RELEASE']),
        destroy: () => log.push([id, 'DESTROY']),
      };
    },
  };
}

test('inTransaction: one connection, autocommit off, READ COMMITTED, one COMMIT, autocommit back on, released', async () => {
  const { inTransaction } = load('src/db/transaction');
  const p = trackingPool(() => []);
  const out = await inTransaction(async (conn) => {
    await conn.query('SELECT 1');
    return 42;
  }, { poolImpl: p });
  assert.equal(out, 42);
  assert.deepEqual(p.log, [
    [1, 'SET autocommit = 0'],
    [1, 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED'],
    [1, 'SELECT 1'],
    [1, 'COMMIT'],
    [1, 'SET autocommit = 1'],
    [1, 'RELEASE'],
  ]);
});

test('inTransaction: an error rolls back, is rethrown and the connection is still restored', async () => {
  const { inTransaction } = load('src/db/transaction');
  const p = trackingPool(() => []);
  await assert.rejects(inTransaction(async () => { throw Object.assign(new Error('regla'), { sqlState: '45000' }); }, { poolImpl: p }), /regla/);
  assert.deepEqual(p.log.map((x) => x[1]), [
    'SET autocommit = 0', 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED', 'ROLLBACK', 'SET autocommit = 1', 'RELEASE',
  ]);
});

test('inTransaction: a deadlock restarts the WHOLE function on a new connection, at most twice', async () => {
  const { inTransaction } = load('src/db/transaction');
  const p = trackingPool(() => []);
  let calls = 0;
  const out = await inTransaction(async (conn) => {
    calls += 1;
    await conn.query(`PASO ${calls}`);
    if (calls < 3) throw Object.assign(new Error('Deadlock'), { code: 'ER_LOCK_DEADLOCK' });
    return 'ok';
  }, { poolImpl: p });
  assert.equal(out, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual([...new Set(p.log.map((x) => x[0]))], [1, 2, 3], 'each attempt uses a fresh connection');
  assert.deepEqual(p.log.filter((x) => x[1] === 'COMMIT'), [[3, 'COMMIT']]);

  let n = 0;
  await assert.rejects(inTransaction(async () => {
    n += 1;
    throw Object.assign(new Error('Deadlock'), { code: 'ER_LOCK_DEADLOCK' });
  }, { poolImpl: trackingPool(() => []) }), /Deadlock/);
  assert.equal(n, 3, 'bounded: 1 try + 2 retries, then the error surfaces');
});

test('inTransaction: lock-wait timeouts are not retried', async () => {
  const { inTransaction } = load('src/db/transaction');
  let n = 0;
  await assert.rejects(inTransaction(async () => {
    n += 1;
    throw Object.assign(new Error('Lock wait timeout'), { code: 'ER_LOCK_WAIT_TIMEOUT' });
  }, { poolImpl: trackingPool(() => []) }), /Lock wait/);
  assert.equal(n, 1);
});

test('inTransaction: a connection whose state cannot be restored is destroyed, not returned to the pool', async () => {
  const { inTransaction } = load('src/db/transaction');
  const p = trackingPool((sql) => {
    if (sql === 'ROLLBACK') throw new Error('conexión perdida');
  });
  await assert.rejects(inTransaction(async () => { throw new Error('fallo'); }, { poolImpl: p }), /fallo/);
  assert.equal(p.log.at(-1)[1], 'DESTROY');
  assert.ok(!p.log.some((x) => x[1] === 'RELEASE'));
});

test('reservation endpoint: the event is written on the same connection before COMMIT; the email only after', async () => {
  const svc = load('src/services/reservasService');
  pool.calls.length = 0;
  avisos.length = 0;
  handler = (sql) => {
    if (sql.includes('FROM dual_solicitudes_alumno sa') && sql.includes('fn_cupos_disponibles')) {
      return [{ estado_alumno: 'VALIDADO', estado_empresa: 'VALIDADO', conv_alumno: 1, conv_empresa: 1, esp_oferta: 2, id_especialidad_solicitud: 2, activa: 1 }];
    }
    if (sql.startsWith('CALL sp_reservar_alumno')) return [[{ id_reserva: 55 }], {}];
    if (sql.startsWith('INSERT INTO dual_eventos')) return { insertId: 1 };
    return [];
  };
  const res = mockRes();
  await svc.reservarAdmin(mockReq({ body: { id_solicitud_alumno: 3, id_solicitud_empresa_especialidad: 9 }, user: { id: 1, rol: 'ADMINISTRADOR' } }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id_reserva, 55);
  const sqls = pool.calls.map((c) => c.sql);
  const call = sqls.findIndex((x) => x.startsWith('CALL sp_reservar_alumno'));
  const ev = sqls.findIndex((x) => x.startsWith('INSERT INTO dual_eventos'));
  const commit = sqls.indexOf('COMMIT');
  assert.ok(sqls.indexOf('SET autocommit = 0') < call && call < ev && ev < commit, sqls.join('\n'));
  assert.deepEqual(avisos, [['creada', 55]]);
});

test('reservation endpoint: a refused transition rolls back and sends nothing', async () => {
  const svc = load('src/services/reservasService');
  pool.calls.length = 0;
  avisos.length = 0;
  handler = (sql) => {
    if (sql.startsWith('CALL sp_cancelar_reserva_admin')) throw Object.assign(new Error('La reserva ya esta cancelada.'), { sqlState: '45000' });
    if (sql.includes('FROM dual_reservas r') && sql.includes('FOR UPDATE')) return [{ id_reserva: 7, estado: 'CANCELADA' }];
    return [];
  };
  const res = mockRes();
  await svc.cancelarAdmin(mockReq({ params: { id: '7' }, body: { motivo: 'x' }, user: { id: 1, rol: 'ADMINISTRADOR' } }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /ya esta cancelada/);
  const sqls = pool.calls.map((c) => c.sql);
  assert.ok(sqls.includes('ROLLBACK'));
  assert.ok(!sqls.includes('COMMIT'));
  assert.ok(!sqls.some((x) => x.startsWith('INSERT INTO dual_eventos')));
  assert.deepEqual(avisos, []);
});
