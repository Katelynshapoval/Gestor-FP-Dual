// POST /solicitudes/empresa — the public company application form.
// Required data and formats are checked before touching the database; a
// duplicate CIF or bad ciclo data rolls everything back; a valid application
// creates company, addresses, contacts, application, ciclos, transports, the
// login (password hashed) and the first tutor in one transaction, then sends
// the confirmation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, fakeBcrypt, mockReq, mockRes } = require('./helpers/harness');

let db = {};
let ids = 0;
const pool = fakePool((sql) => {
  if (sql.startsWith('SELECT id_convocatoria, nombre, fecha_inicio, fecha_fin FROM dual_convocatorias WHERE activa = 1')) {
    return db.convocatoria ? [db.convocatoria] : [];
  }
  if (sql.startsWith('SELECT idempresa FROM ge_empresas WHERE cif = ?')) return db.cifExiste ? [{ idempresa: 1 }] : [];
  if (sql.startsWith('SELECT id_solicitud_empresa FROM dual_solicitudes_empresa')) return [];
  if (sql.startsWith('SELECT id_rol FROM dual_roles')) return [{ id_rol: 3 }];
  if (sql.startsWith('INSERT INTO ge_empresas') && db.carrera) {
    const err = new Error("Duplicate entry 'B12345674' for key 'ge_empresas.uq_ge_empresas_cif'");
    err.code = 'ER_DUP_ENTRY';
    throw err;
  }
  if (sql.startsWith('INSERT')) return { insertId: ++ids, affectedRows: 1 };
  return [];
});
stub('src/db/pool', pool);
stub('bcrypt', fakeBcrypt);
stub('src/mail/config', { transporter: { mode: 'log', sendMail: async () => ({}) } });
const generados = [];
stub('src/services/documentGenerationService', {
  generateDocument: async (args) => { generados.push(args); return { ok: false, code: 'SIN_PLANTILLA' }; },
});
const avisos = [];
stub('src/services/notificaciones', new Proxy({}, { get: (_t, n) => async (...a) => { avisos.push([n, ...a]); } }));

const svc = load('src/services/solicitudesEmpresaService');

const VALIDA = {
  cif: 'b12345674', empresa: 'ACME S.L.', domicilioLegal: 'C/ Mayor 1', cpLegal: '50001', provinciaLegal: 'Zaragoza',
  localidadLegal: 'Zaragoza', mismoLugarTrabajo: true,
  dniRepresentante: '12345678Z', nombreRepresentante: 'Ana', emailRepresentante: 'a@acme.test', telefonoRepresentante: '600000000',
  dniCoordinador: '87654321X', nombreCoordinador: 'Luis', emailCoordinador: 'l@acme.test', telefonoCoordinador: '600000001',
  descripcion_puesto: 'Taller de joyería', especialidades: [{ idEspecialidad: 2, cantidadAlumnos: 3 }],
  transportes: ['1', 'x', 4], passwordCoordinador: 'secreta123',
};

async function alta(body, e = {}) {
  db = { convocatoria: { id_convocatoria: 5, nombre: '2026/2027' }, ...e };
  ids = 0;
  pool.calls.length = 0;
  generados.length = 0;
  avisos.length = 0;
  const res = mockRes();
  await svc.create(mockReq({ body }), res);
  return res;
}

const escrituras = () => pool.calls.filter((c) => /^(INSERT|UPDATE|DELETE)/.test(c.sql));

test('missing required data is 400 before anything is written', async () => {
  const sin = (...campos) => Object.fromEntries(Object.entries(VALIDA).filter(([k]) => !campos.includes(k)));
  const casos = [
    [sin('cif'), /datos obligatorios de la empresa/],
    [sin('localidadLegal'), /datos obligatorios de la empresa/],
    [sin('emailRepresentante'), /representante legal/],
    [sin('telefonoCoordinador'), /coordinador de empresa/],
    [sin('descripcion_puesto'), /descripción del puesto/],
    [{ ...VALIDA, especialidades: [] }, /al menos una especialidad/],
    [{ ...VALIDA, especialidades: 'DAM' }, /al menos una especialidad/],
    [sin('passwordCoordinador'), /contraseña/],
  ];
  for (const [body, msg] of casos) {
    const res = await alta(body);
    assert.equal(res.statusCode, 400, msg.source);
    assert.match(res.body.error, msg);
    assert.equal(pool.calls.length, 0, 'not even a read');
  }
});

test('CIF, DNI/NIE and password length are checked like the form does', async () => {
  const casos = [
    [{ cif: 'B12345675' }, 'CIF_INVALIDO'],
    [{ dniRepresentante: '12345678A' }, 'DNI_INVALIDO'],
    [{ dniCoordinador: 'X0000000A' }, 'DNI_INVALIDO'],
    [{ passwordCoordinador: '1234567' }, 'PASSWORD_CORTA'],
  ];
  for (const [cambio, code] of casos) {
    const res = await alta({ ...VALIDA, ...cambio });
    assert.equal(res.statusCode, 400, code);
    assert.equal(res.body.code, code);
    assert.equal(escrituras().length, 0);
  }
});

test('outside an active convocatoria the form is closed (409)', async () => {
  const res = await alta(VALIDA, { convocatoria: null });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /convocatoria activa/);
  assert.equal(escrituras().length, 0);
});

test('an already registered CIF is 409 and nothing is created', async () => {
  let res = await alta(VALIDA, { cifExiste: true });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /ya está registrada/);
  assert.equal(escrituras().length, 0);
  assert.ok(pool.calls.some((c) => c.sql === 'ROLLBACK'));

  // Two submissions at once: the unique key catches the second one.
  res = await alta(VALIDA, { carrera: true });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /ya está registrada/);
  assert.ok(!pool.calls.some((c) => c.sql === 'COMMIT'));
});

test('bad ciclo data or a missing work address roll the whole application back', async () => {
  const casos = [
    [{ especialidades: [{ idEspecialidad: 2, cantidadAlumnos: 0 }] }, /cantidad > 0/],
    [{ especialidades: [{ idEspecialidad: 'x', cantidadAlumnos: 2 }] }, /id válido/],
    [{ especialidades: [{ idEspecialidad: 2, cantidadAlumnos: 21 }] }, /Como máximo/],
    [{ mismoLugarTrabajo: false }, /domicilio de trabajo/],
  ];
  for (const [cambio, msg] of casos) {
    const res = await alta({ ...VALIDA, ...cambio });
    assert.equal(res.statusCode, 400, msg.source);
    assert.match(res.body.error, msg);
    assert.ok(pool.calls.some((c) => c.sql === 'ROLLBACK'), msg.source);
    assert.ok(!pool.calls.some((c) => c.sql === 'COMMIT'), msg.source);
  }
});

test('a valid application creates everything in one transaction and confirms by email', async () => {
  const res = await alta({ ...VALIDA, menosdecincotrabajadores: true });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const w = escrituras();
  const tabla = (c) => c.sql.match(/^(?:INSERT(?: IGNORE)? INTO|DELETE FROM|UPDATE) (\w+)/)[1];
  assert.deepEqual(w.map(tabla), [
    'ge_empresas', 'ge_domicilios', 'ge_contactos', 'ge_contactos', 'dual_solicitudes_empresa',
    'dual_solicitud_empresa_especialidades',
    'dual_solicitud_empresa_transportes', 'dual_solicitud_empresa_transportes', 'dual_solicitud_empresa_transportes',
    'dual_solicitudes_empresa', 'dual_usuarios', 'dual_empresa_tutores',
  ]);
  const idSolicitud = res.body.id_solicitud_empresa;
  assert.equal(w[0].params[0], 'B12345674', 'CIF stored normalised');
  assert.equal(w[0].params.at(-1), 1, 'fewer than five workers');
  // Same address for work: the coordinator hangs from the legal address (id 2).
  assert.equal(w[3].params[0], 2);
  assert.deepEqual(w[5].params, [idSolicitud, 2, 3]);
  // Transports: the old ones cleared, then only the valid ids (1 and 4).
  assert.deepEqual(w.slice(7, 9).map((c) => c.params), [[idSolicitud, 1], [idSolicitud, 4]]);
  const usuario = w.find((c) => c.sql.startsWith('INSERT INTO dual_usuarios'));
  assert.equal(usuario.params[1], 'h:secreta123', 'the password is stored hashed');
  assert.ok(!JSON.stringify(pool.calls).includes('"secreta123"'), 'never in clear');
  assert.match(usuario.sql, /VALUES \(\?, NULL, \?, \?, \?, 1, 0\)/, 'login by CIF, no forced change');
  assert.deepEqual(w.at(-1).params, [1, 4], 'the coordinator (contact 4) is the first tutor of company 1');
  assert.ok(pool.calls.some((c) => c.sql === 'COMMIT'));
  assert.deepEqual(generados.map((g) => g.clave), ['CONVENIO']);
  assert.deepEqual(avisos, [['solicitudEmpresaRecibida', res.body.id_solicitud_empresa, null]]);
});
