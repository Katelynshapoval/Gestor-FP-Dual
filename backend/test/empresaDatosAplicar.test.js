// Saving company data (empresaDatos.applyEmpresaDatos and the loaders).
// Copy-on-write: an address, representative or coordinator shared with another
// year's application is copied first, so past applications and their convenios
// keep showing what was true then. Only the fields that change are written.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool } = require('./helpers/harness');

stub('src/db/pool', fakePool(() => []));
const ed = load('src/services/empresaDatos');

const LIVE = {
  id_solicitud_empresa: 10, id_empresa: 100, id_representante_legal: 21, id_coordinador_empresa: 41,
  id_domicilio_legal: 31, id_domicilio_trabajo: 32, convocatoria_activa: 1, transportes_conocidos: 1,
  empresa: 'ACME', cif: 'B12345674', web: '', observaciones: '', emailEmpresa: '', telefonoEmpresa: '',
  domicilioLegal: 'C/ Mayor 1', cpLegal: '50001', provinciaLegal: 'Zaragoza', localidadLegal: 'Zaragoza', municipioLegal: '', telefonoLegal: '', emailLegal: '',
  domicilioTrabajo: 'Pol. Norte 3', cpTrabajo: '50002', provinciaTrabajo: 'Zaragoza', localidadTrabajo: 'Zaragoza', municipioTrabajo: '', telefonoTrabajo: '', emailTrabajo: '',
  dniRepresentante: '12345678Z', nombreRepresentante: 'Ana', emailRepresentante: 'a@acme.test', telefonoRepresentante: '600000000', cargoRepresentante: 'Gerente',
  dniCoordinador: '87654321X', nombreCoordinador: 'Luis', emailCoordinador: 'l@acme.test', telefonoCoordinador: '600000001', cargoCoordinador: 'Tutor',
  descripcion_puesto: 'Taller',
};

// A connection whose answers depend on what is shared with other years.
function conexion({ live = LIVE, compartidos = {}, otrasSolicitudesCoord = [], cifDe = null, transportesValidos = null } = {}) {
  let id = 900;
  const calls = [];
  const conn = {
    calls,
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: s, params });
      let out = [];
      if (s.includes('FROM dual_solicitudes_empresa se JOIN ge_empresas emp')) out = live ? [{ ...live }] : [];
      else if (s.startsWith('SELECT dt.id_transporte, dt.nombre')) out = [{ id_transporte: 1, nombre: 'bus' }];
      else if (s.startsWith('SELECT COUNT(*) AS n FROM dual_solicitudes_empresa WHERE id_solicitud_empresa <> ? AND (id_domicilio_legal')) {
        out = [{ n: compartidos[params[1]] ? 1 : 0 }];
      } else if (s.startsWith('SELECT COUNT(*) AS n FROM dual_solicitudes_empresa WHERE id_solicitud_empresa <> ? AND id_representante_legal')) {
        out = [{ n: compartidos.representante ? 1 : 0 }];
      } else if (s.startsWith('SELECT id_solicitud_empresa FROM dual_solicitudes_empresa WHERE id_coordinador_empresa')) {
        out = otrasSolicitudesCoord.map((x) => ({ id_solicitud_empresa: x }));
      } else if (s.startsWith('SELECT idempresa FROM ge_empresas WHERE cif = ?')) out = cifDe ? [{ idempresa: cifDe }] : [];
      else if (s.startsWith('SELECT id_transporte FROM dual_transportes WHERE id_transporte IN')) {
        out = (transportesValidos || params[0]).map((t) => ({ id_transporte: t }));
      } else if (s.startsWith('INSERT')) out = { insertId: ++id };
      return [out, []];
    },
  };
  return conn;
}
const escrituras = (conn) => conn.calls.filter((c) => /^(INSERT|UPDATE|DELETE)/.test(c.sql));
const aplicar = (conn, proposed, opts) => ed.applyEmpresaDatos(conn, { id_solicitud_empresa: 10 }, proposed, opts);

test('loaders: missing application is null; flags and aliases for the screens', async () => {
  assert.equal(await ed.loadEmpresaDatos(conexion({ live: null }), 10), null);
  assert.equal(await ed.loadEmpresaDatosRead(conexion({ live: null }), 10), null);
  for (const load_ of [ed.loadEmpresaDatos, ed.loadEmpresaDatosRead]) {
    const d = await load_(conexion({ live: { ...LIVE, convocatoria_activa: 0, transportes_conocidos: 0 } }), 10);
    assert.equal(d.convocatoria_activa, false);
    assert.equal(d.transportes_conocidos, false);
    assert.deepEqual(d.transportes, [{ id_transporte: 1, nombre: 'bus' }]);
    assert.deepEqual([d.razonSocial, d.dniRl, d.coordinador_email, d.direccionLugarTrabajo], ['ACME', '12345678Z', 'l@acme.test', 'Pol. Norte 3']);
  }
  const conn = conexion();
  await ed.loadEmpresaDatos(conn, 10);
  assert.match(conn.calls[0].sql, /FOR UPDATE$/, 'the editing loader locks the row');
});

test('nothing to apply, a missing application or incomplete data are refused before writing', async () => {
  await assert.rejects(aplicar(conexion(), {}), (e) => e.status === 400);
  await assert.rejects(aplicar(conexion(), { hack: 1 }), (e) => e.status === 400);
  await assert.rejects(aplicar(conexion({ live: null }), { web: 'x' }), (e) => e.status === 404);
  const conn = conexion();
  await assert.rejects(aplicar(conn, { nombreCoordinador: ' ' }), (e) => e.status === 400 && /Nombre coordinador/.test(e.message));
  assert.equal(escrituras(conn).length, 0);
});

test('company fields: one UPDATE with only the changed columns; the CIF only for staff and never a duplicate', async () => {
  let conn = conexion();
  await aplicar(conn, { empresa: 'ACME 2', web: 'https://acme.test', cif: 'B12345675' });
  assert.deepEqual(escrituras(conn).map((c) => [c.sql, c.params]), [
    ['UPDATE ge_empresas SET empresa = ?, web = ? WHERE idempresa = ?', ['ACME 2', 'https://acme.test', 100]],
  ], 'the company cannot change the CIF');

  conn = conexion();
  await assert.rejects(aplicar(conn, { cif: 'B12345675' }, { allowCif: true }), (e) => e.status === 400 && /CIF/.test(e.message));
  conn = conexion({ cifDe: 200 });
  const otroValido = 'A58818501';
  await assert.rejects(aplicar(conn, { cif: otroValido }, { allowCif: true }), (e) => e.status === 409);
  assert.equal(escrituras(conn).length, 0);
  conn = conexion();
  await aplicar(conn, { cif: otroValido }, { allowCif: true });
  assert.deepEqual(escrituras(conn)[0].params, [otroValido, 100]);
});

test('an address used only by this application is edited in place', async () => {
  const conn = conexion();
  await aplicar(conn, { cpLegal: '50010', telefonoLegal: '976000000' });
  assert.deepEqual(escrituras(conn).map((c) => [c.sql, c.params]), [
    ['UPDATE ge_domicilios SET cp = ?, telefono = ? WHERE iddomicilio = ?', ['50010', '976000000', 31]],
  ]);
});

test('an address shared with another year is copied first, and only the copy changes', async () => {
  const conn = conexion({ compartidos: { 32: true } });
  await aplicar(conn, { domicilioTrabajo: 'Pol. Sur 9' });
  const w = escrituras(conn);
  assert.match(w[0].sql, /^INSERT INTO ge_domicilios .* SELECT .* WHERE iddomicilio = \?$/);
  assert.deepEqual(w[0].params, [32]);
  assert.deepEqual(w[1].params, [901, 10], 'the application points to the copy');
  assert.match(w[1].sql, /SET id_domicilio_trabajo = \?/);
  assert.deepEqual(w[2].params, ['Pol. Sur 9', 901], 'the old address is untouched');
});

test('legal and work sharing one row: edited together while they stay equal, split when they differ', async () => {
  const mismo = { ...LIVE, id_domicilio_trabajo: 31, domicilioTrabajo: LIVE.domicilioLegal, cpTrabajo: LIVE.cpLegal };
  let conn = conexion({ live: mismo });
  await aplicar(conn, { domicilioLegal: 'C/ Nueva 5', domicilioTrabajo: 'C/ Nueva 5' });
  let w = escrituras(conn);
  assert.ok(!w.some((c) => c.sql.startsWith('INSERT INTO ge_domicilios')), 'still one shared row');
  assert.deepEqual(w.filter((c) => c.sql.startsWith('UPDATE ge_domicilios')).map((c) => c.params.at(-1)), [31, 31]);

  conn = conexion({ live: mismo });
  await aplicar(conn, { domicilioTrabajo: 'Pol. Sur 9' });
  w = escrituras(conn);
  const copia = w.find((c) => c.sql.startsWith('INSERT INTO ge_domicilios'));
  assert.deepEqual(copia.params, [31], 'the work address gets its own row');
  const updTrabajo = w.filter((c) => c.sql.startsWith('UPDATE ge_domicilios')).at(-1);
  assert.deepEqual(updTrabajo.params, ['Pol. Sur 9', 901]);
  assert.ok(!w.some((c) => c.sql.startsWith('UPDATE ge_domicilios') && c.params.at(-1) === 31), 'the legal address keeps its value');
});

test('the representative: edited in place, or copied when another year uses it', async () => {
  let conn = conexion();
  await aplicar(conn, { nombreRepresentante: 'Eva', cargoRepresentante: 'CEO' });
  assert.deepEqual(escrituras(conn).map((c) => c.params), [['Eva', 'CEO', 21]]);

  conn = conexion({ compartidos: { representante: true } });
  await aplicar(conn, { emailRepresentante: 'eva@acme.test' });
  const w = escrituras(conn);
  assert.match(w[0].sql, /^INSERT INTO ge_contactos/);
  assert.deepEqual(w[0].params, [31, 21]);
  assert.deepEqual(w[1].params, [901, 10]);
  assert.deepEqual(w[2].params, ['eva@acme.test', 901]);
});

test('the coordinator: other years get a frozen copy; the login\'s display name follows', async () => {
  const conn = conexion({ otrasSolicitudesCoord: [5, 6] });
  await aplicar(conn, { nombreCoordinador: 'Marta', telefonoCoordinador: '611111111' });
  const w = escrituras(conn);
  assert.match(w[0].sql, /^INSERT INTO ge_contactos .* SELECT/);
  assert.deepEqual(w[1].params, [901, [5, 6]], 'past applications point to the copy');
  assert.deepEqual(w[2].params, ['Marta', '611111111', 41], 'the live contact keeps its id (login, tutor)');
  assert.deepEqual(w[3].params, ['Marta', 41]);
  const sinNombre = conexion();
  await aplicar(sinNombre, { emailCoordinador: 'm@acme.test' });
  assert.ok(!escrituras(sinNombre).some((c) => c.sql.startsWith('UPDATE dual_usuarios')));
  assert.ok(!escrituras(sinNombre).some((c) => c.sql.startsWith('INSERT')), 'nothing to freeze without other years');
});

test('job description and transports belong to this application only', async () => {
  let conn = conexion();
  await aplicar(conn, { descripcion_puesto: 'Joyería fina', transportes: [3, 1] });
  const w = escrituras(conn);
  assert.deepEqual(w[0].params, ['Joyería fina', 10]);
  assert.deepEqual(w.slice(1).map((c) => c.sql.split(' ').slice(0, 3).join(' ')), [
    'DELETE FROM dual_solicitud_empresa_transportes', 'INSERT IGNORE INTO', 'INSERT IGNORE INTO', 'UPDATE dual_solicitudes_empresa SET',
  ]);
  conn = conexion({ transportesValidos: [1] });
  await assert.rejects(aplicar(conn, { transportes: [1, 99] }), (e) => e.status === 400 && /transporte/.test(e.message));
  conn = conexion({ live: { ...LIVE, transportes: [] } });
  await aplicar(conn, { transportes: [] });
  assert.ok(!conn.calls.some((c) => c.sql.startsWith('SELECT id_transporte FROM dual_transportes')), 'an empty list needs no check');
});
