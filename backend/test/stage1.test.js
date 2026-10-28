// Database improvement plan · Stage 1 (migration 017) — backend side, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, fakeBcrypt, mockReq, mockRes } = require('./helpers/harness');

let handler = () => [];
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);
stub('bcrypt', fakeBcrypt);
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-0123456789';

const pdf = { buffer: Buffer.from('%PDF-1.4') };

test('DB-01: a re-application stores the requested ciclo on the new application', async () => {
  const { loginRateLimiter } = require('../src/middleware/loginRateLimit');
  loginRateLimiter.reset();
  pool.calls.length = 0;
  handler = (sql) => {
    if (sql.startsWith('SELECT id_convocatoria, nombre, fecha_inicio, fecha_fin FROM dual_convocatorias WHERE activa = 1')) {
      return [{ id_convocatoria: 6, nombre: '2027-2028' }];
    }
    if (sql.startsWith('SELECT codigo FROM dual_especialidades')) return [{ codigo: 'DAW' }];
    if (sql.startsWith('SELECT idalumno FROM gf_alumnosfct')) return [{ idalumno: 42 }];
    if (sql.startsWith('SELECT id_usuario, password_hash, activo FROM dual_usuarios')) {
      return [{ id_usuario: 7, password_hash: 'h:propia123', activo: 1 }];
    }
    if (sql.startsWith('INSERT INTO dual_solicitudes_alumno')) return { insertId: 901 };
    if (sql.startsWith('SELECT id_tipo_documento FROM dual_tipos_documento')) return [{ id_tipo_documento: 1 }];
    if (sql.startsWith('SELECT id_rol FROM dual_roles')) return [{ id_rol: 4 }];
    if (sql.startsWith('SELECT id_usuario FROM dual_usuarios WHERE id_alumno')) return [{ id_usuario: 7 }];
    return [];
  };
  const svc = load('src/services/solicitudesAlumnoService');
  const req = mockReq({
    body: {
      nombre: 'Alumna', dni: '12345678z', domicilio: 'C/ Uno 1', cp: '50001', localidad: 'Zaragoza',
      telalumno: '600000000', email: 'alumna@example.com', id_especialidad_dual: 5, password: 'propia123',
    },
    files: { cv: [pdf], anexoDga: [pdf] },
  });
  await svc.create(req, mockRes());

  const insert = pool.calls.find((c) => c.sql.startsWith('INSERT INTO dual_solicitudes_alumno'));
  assert.ok(insert, 'the application is inserted');
  assert.match(insert.sql, /id_especialidad/);
  assert.deepEqual(insert.params, [42, 6, 5]);
  // The student record still receives the latest ciclo (legacy readers).
  const upd = pool.calls.find((c) => c.sql.startsWith('UPDATE gf_alumnosfct'));
  assert.ok(upd.params.includes(5));
});

test('DB-01: no service reads the ciclo of an application from gf_alumnosfct', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'src', 'services');
  for (const f of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(text, /\ba\.id_especialidad_dual\b/, `${f} reads a.id_especialidad_dual`);
  }
});

test('DB-08: CIF lookups use the column as stored (index usable)', async () => {
  pool.calls.length = 0;
  handler = () => [];
  const auth = load('src/services/authService');
  await auth.findUserByIdentifier('b12345678');
  const byCif = pool.calls.find((c) => c.sql.includes('emp.cif'));
  assert.ok(byCif);
  assert.match(byCif.sql, /emp\.cif = \?/);
  assert.doesNotMatch(byCif.sql, /UPPER\(TRIM\(/);
  assert.deepEqual(byCif.params, ['B12345678']);
});

test('mapSqlError: duplicate current document, deadlock and lock timeout become 409', () => {
  const { mapSqlError } = load('src/helpers/dbHelpers');
  const dup = mapSqlError({ code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry 'A2-1' for key 'dual_documentos.uq_dd_actual'" });
  assert.deepEqual([dup.status, dup.code], [409, 'DOCUMENTO_CONCURRENTE']);
  const other = mapSqlError({ code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry 'x' for key 'uq_ge_empresas_cif'" });
  assert.deepEqual([other.status, other.code], [409, 'DUPLICADO']);
  for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const m = mapSqlError({ code });
    assert.deepEqual([m.status, m.code], [409, 'CONCURRENCIA']);
  }
  const quota = mapSqlError({ sqlState: '45000', message: 'No se pueden reducir las plazas por debajo de las reservas activas.' });
  assert.equal(quota.status, 400);
});
