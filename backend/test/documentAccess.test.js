// Who may download which document (GET /documentos/:id/descargar).
// Staff: everything. Companies: their own convenio and reservation documents,
// and a student's document only when that student is visible to them and the
// catalogue lets companies see that type. Students: their own documents, never
// types hidden from them. No database: the queries are answered by a fake pool.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq } = require('./helpers/harness');

let db = {};
const pool = fakePool((sql, params) => responder(sql, params));
stub('src/db/pool', pool);

const PDF = Buffer.from('%PDF-1.4 documento');

// db: { docs: { id: row }, empresaDeUsuario, alumnoDeUsuario, empresaDeSolicitud,
//       empresaDeReserva, alumnoDeSolicitud, alumnoDeReserva, alumnoConReservaEn,
//       empresaVeAlumno }
function responder(sql, params) {
  if (sql.includes('FROM dual_documentos d') && sql.includes('WHERE d.id_documento = ?')) {
    return db.docs[params[0]] ? [db.docs[params[0]]] : [];
  }
  if (sql.includes('SELECT d.idempresa FROM dual_usuarios u')) {
    return db.empresaDeUsuario ? [{ idempresa: db.empresaDeUsuario }] : [];
  }
  if (sql.includes('SELECT u.id_alumno FROM dual_usuarios u')) {
    return db.alumnoDeUsuario ? [{ id_alumno: db.alumnoDeUsuario }] : [];
  }
  if (sql.startsWith('SELECT id_empresa FROM dual_solicitudes_empresa WHERE id_solicitud_empresa = ?')) {
    return [{ id_empresa: db.empresaDeSolicitud[params[0]] }];
  }
  if (sql.startsWith('SELECT se.id_empresa FROM dual_reservas r')) {
    return [{ id_empresa: db.empresaDeReserva[params[0]] }];
  }
  if (sql.startsWith('SELECT id_alumno FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ?')) {
    return [{ id_alumno: db.alumnoDeSolicitud[params[0]] }];
  }
  if (sql.startsWith('SELECT sa.id_alumno FROM dual_reservas r') && sql.includes('WHERE r.id_reserva = ?')) {
    return [{ id_alumno: db.alumnoDeReserva[params[0]] }];
  }
  if (sql.startsWith('SELECT sa.id_alumno FROM dual_reservas r') && sql.includes('se.id_solicitud_empresa = ?')) {
    return db.alumnoConReservaEn?.[params[0]] === params[1] ? [{ id_alumno: params[1] }] : [];
  }
  if (sql.startsWith('SELECT sa.id_solicitud_alumno FROM dual_solicitudes_alumno sa')) {
    return db.empresaVeAlumno?.(params[0], params[1]) ? [{ id_solicitud_alumno: params[0] }] : [];
  }
  return [];
}

function res() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    send(b) { this.body = b; return this; },
  };
}

const doc = (id, tipo, padres) => ({
  id_documento: id, archivo: PDF, tipo, estado_validacion: 'PENDIENTE',
  id_solicitud_alumno: null, id_solicitud_empresa: null, id_reserva: null, ...padres,
});

const BASE = {
  docs: {
    1: doc(1, 'CONVENIO', { id_solicitud_empresa: 10 }),     // company 100
    2: doc(2, 'CONVENIO', { id_solicitud_empresa: 20 }),     // company 200
    3: doc(3, 'ANEXO_II', { id_reserva: 30 }),               // company 100, student 7
    4: doc(4, 'CV', { id_solicitud_alumno: 40 }),            // student 7
    5: doc(5, 'ANEXO_DGA', { id_solicitud_alumno: 40 }),     // student 7, hidden from companies
    6: doc(6, 'CV', { id_solicitud_alumno: 50 }),            // student 8
    7: doc(7, 'ANEXO_XIV', { id_solicitud_empresa: 10 }),    // hidden from students
    8: { ...doc(8, 'CV', { id_solicitud_alumno: 40 }), archivo: null },
  },
  empresaDeSolicitud: { 10: 100, 20: 200 },
  empresaDeReserva: { 30: 100 },
  alumnoDeSolicitud: { 40: 7, 50: 8 },
  alumnoDeReserva: { 30: 7 },
  alumnoConReservaEn: { 10: 7 },
};

async function descargar(user, id, extra = {}) {
  db = { ...BASE, ...extra };
  const svc = load('src/services/documentosService');
  const r = res();
  await svc.descargar(mockReq({ params: { id: String(id) }, user }), r);
  return r;
}

const ADMIN = { id: 1, rol: 'ADMINISTRADOR' };
const COORD = { id: 2, rol: 'COORDINADOR' };
const EMPRESA = { id: 3, rol: 'EMPRESA' };
const ALUMNO = { id: 4, rol: 'ALUMNO' };

test('staff download any document, as an attachment with a fixed name', async () => {
  for (const user of [ADMIN, COORD]) {
    for (const id of [1, 2, 3, 4, 5, 6, 7]) {
      const r = await descargar(user, id);
      assert.equal(r.statusCode, 200, `${user.rol} ${id}`);
    }
  }
  const r = await descargar(ADMIN, 4);
  assert.equal(r.body, PDF);
  assert.equal(r.headers['content-type'], 'application/pdf');
  assert.equal(r.headers['content-disposition'], 'attachment; filename="documento_4.pdf"');
});

test('a missing document, or one without a file, is 404 for everyone', async () => {
  for (const user of [ADMIN, EMPRESA, ALUMNO]) {
    assert.equal((await descargar(user, 99, { empresaDeUsuario: 100, alumnoDeUsuario: 7 })).statusCode, 404);
    assert.equal((await descargar(user, 8, { empresaDeUsuario: 100, alumnoDeUsuario: 7 })).statusCode, 404);
  }
});

test('a company downloads its own convenio and reservation documents, never another company\'s', async () => {
  const como = (id, empresa = 100) => descargar(EMPRESA, id, { empresaDeUsuario: empresa });
  assert.equal((await como(1)).statusCode, 200);
  assert.equal((await como(3)).statusCode, 200);
  assert.equal((await como(2)).statusCode, 403);
  assert.equal((await como(1, 200)).statusCode, 403);
  assert.equal((await como(3, 200)).statusCode, 403);
  assert.equal((await como(2, 200)).statusCode, 200);
});

test('a company sees a student\'s CV only when that student is visible to it', async () => {
  const visible = (sol, emp) => sol === 40 && emp === 100;
  assert.equal((await descargar(EMPRESA, 4, { empresaDeUsuario: 100, empresaVeAlumno: visible })).statusCode, 200);
  assert.equal((await descargar(EMPRESA, 4, { empresaDeUsuario: 200, empresaVeAlumno: visible })).statusCode, 403);
  assert.equal((await descargar(EMPRESA, 6, { empresaDeUsuario: 100, empresaVeAlumno: visible })).statusCode, 403);
});

test('a company never gets a document type hidden from companies (Anexo DGA), even for a visible student', async () => {
  pool.calls.length = 0;
  const r = await descargar(EMPRESA, 5, { empresaDeUsuario: 100, empresaVeAlumno: () => true });
  assert.equal(r.statusCode, 403);
  assert.ok(!pool.calls.some((c) => c.sql.startsWith('SELECT sa.id_solicitud_alumno')), 'decided by the catalogue, without asking the database');
});

test('a user linked to no company gets nothing', async () => {
  assert.equal((await descargar(EMPRESA, 1, { empresaDeUsuario: null })).statusCode, 403);
});

test('a student downloads their own documents and nobody else\'s', async () => {
  const como = (id, alumno = 7) => descargar(ALUMNO, id, { alumnoDeUsuario: alumno });
  assert.equal((await como(4)).statusCode, 200);
  assert.equal((await como(5)).statusCode, 200);
  assert.equal((await como(3)).statusCode, 200, 'the Anexo of their own reservation');
  assert.equal((await como(6)).statusCode, 403);
  assert.equal((await como(4, 8)).statusCode, 403);
  assert.equal((await como(3, 8)).statusCode, 403);
});

test('a student never downloads a company convenio, even with a reservation in that company', async () => {
  assert.equal((await descargar(ALUMNO, 1, { alumnoDeUsuario: 7 })).statusCode, 403, 'the convenio is a company document');
  assert.equal((await descargar(ALUMNO, 2, { alumnoDeUsuario: 7 })).statusCode, 403);
  assert.equal((await descargar(ALUMNO, 1, { alumnoDeUsuario: 8 })).statusCode, 403);
  assert.equal((await descargar(ALUMNO, 7, { alumnoDeUsuario: 7 })).statusCode, 403, 'Anexo XIV is hidden from students');
});

test('an unknown role or no user gets nothing', async () => {
  assert.equal((await descargar({ id: 9, rol: 'OTRO' }, 1)).statusCode, 403);
  assert.equal((await descargar(null, 1)).statusCode, 403);
});
