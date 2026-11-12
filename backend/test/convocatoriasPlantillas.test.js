// Convocatorias (date-driven activation, create/edit rules, public state) and
// document templates (DOCX only, versioned, one active per type).
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let st = {};
const pool = fakePool((sql, params) => {
  for (const [match, out] of st.respuestas || []) {
    if (sql.includes(match)) return typeof out === 'function' ? out(sql, params) : out;
  }
  if (sql.startsWith('INSERT')) return { insertId: 77 };
  return [];
});
stub('src/db/pool', pool);
const conv = load('src/services/convocatoriasService');
const plant = load('src/services/plantillasService');

async function llamar(svc, fn, { user = { id: 1, rol: 'ADMINISTRADOR' }, params = {}, body = {}, file, respuestas = [] } = {}) {
  st = { respuestas };
  pool.calls.length = 0;
  const res = mockRes();
  res.setHeader = function setHeader(k, v) { this.headers[k.toLowerCase()] = v; };
  await svc[fn](mockReq({ params, body, user, file }), res);
  return res;
}
const escrituras = () => pool.calls.filter((c) => /^(INSERT|UPDATE|DELETE)/.test(c.sql));
const hubo = (sql) => pool.calls.some((c) => c.sql === sql);

// ── Active convocatoria follows the dates ───────────────────────────────────

const sync = (filas) => { st = { respuestas: [['AS vigente FROM dual_convocatorias', filas]] }; pool.calls.length = 0; return conv.syncConvocatoriaActiva(); };

test('sync: the convocatoria whose dates include today becomes the only active one', async () => {
  const out = await sync([
    { id_convocatoria: 6, activa: 0, vigente: 1 },
    { id_convocatoria: 5, activa: 1, vigente: 0 },
  ]);
  assert.deepEqual(out, { activeId: 6, changed: true });
  const w = escrituras();
  assert.deepEqual(w.map((c) => [c.sql.split(' WHERE')[0], c.params]), [
    ['UPDATE dual_convocatorias SET activa = 0', [[5]]],
    ['UPDATE dual_convocatorias SET activa = 1', [6]],
  ], 'deactivate first, so the one-active rule never breaks');
  assert.ok(hubo('COMMIT'));
});

test('sync: nothing in range closes everything; already right means no writes', async () => {
  let out = await sync([{ id_convocatoria: 5, activa: 1, vigente: 0 }]);
  assert.deepEqual(out, { activeId: null, changed: true });
  assert.deepEqual(escrituras().map((c) => c.params), [[[5]]]);
  out = await sync([{ id_convocatoria: 6, activa: 1, vigente: 1 }, { id_convocatoria: 5, activa: 0, vigente: 0 }]);
  assert.deepEqual(out, { activeId: 6, changed: false });
  assert.equal(escrituras().length, 0);
  out = await sync([]);
  assert.deepEqual(out, { activeId: null, changed: false });
});

test('sync: overlapping legacy ranges, the most recent start wins (first row)', async () => {
  const out = await sync([{ id_convocatoria: 7, activa: 0, vigente: 1 }, { id_convocatoria: 6, activa: 1, vigente: 1 }]);
  assert.equal(out.activeId, 7);
  assert.deepEqual(escrituras()[0].params, [[6]]);
});

test('sync: a database error rolls back and is rethrown; read endpoints carry on', async () => {
  st = { respuestas: [['AS vigente FROM dual_convocatorias', () => { throw new Error('caída'); }]] };
  await assert.rejects(conv.syncConvocatoriaActiva(), /caída/);
  assert.ok(hubo('ROLLBACK'));
  const res = await llamar(conv, 'getAll', { respuestas: [['AS vigente', () => { throw new Error('caída'); }], ['ORDER BY fecha_inicio DESC', [{ id_convocatoria: 5 }]]] });
  assert.deepEqual(res.body, [{ id_convocatoria: 5 }]);
});

test('the scheduler syncs at start and on an interval that never keeps the process alive', () => {
  const timer = conv.startConvocatoriaScheduler(60_000);
  assert.equal(typeof timer.hasRef === 'function' ? timer.hasRef() : false, false);
  clearInterval(timer);
});

test('public state: open or closed, with the current and the next convocatoria', async () => {
  let res = await llamar(conv, 'getEstado', { respuestas: [['WHERE fecha_inicio > CURDATE()', [{ id_convocatoria: 7, nombre: '2027/2028' }]]] });
  assert.deepEqual(res.body, { abierta: false, activa: null, proxima: { id_convocatoria: 7, nombre: '2027/2028' } });
  res = await llamar(conv, 'getEstado', { respuestas: [['WHERE activa = 1 LIMIT 1', [{ id_convocatoria: 6 }]]] });
  assert.deepEqual(res.body, { abierta: true, activa: { id_convocatoria: 6 }, proxima: null });
  assert.equal((await llamar(conv, 'getActiva')).statusCode, 404);
  res = await llamar(conv, 'getActiva', { respuestas: [['WHERE activa = 1 LIMIT 1', [{ id_convocatoria: 6 }]]] });
  assert.equal(res.body.id_convocatoria, 6);
});

test('create: name and ISO dates required, start before end, no overlap; opens at once if today is in range', async () => {
  const casos = [
    [{ fecha_inicio: '2027-01-01', fecha_fin: '2027-06-30' }, 400],
    [{ nombre: 'X', fecha_inicio: '01/01/2027', fecha_fin: '2027-06-30' }, 400],
    [{ nombre: 'X', fecha_inicio: '2027-07-01', fecha_fin: '2027-06-30' }, 400],
  ];
  for (const [body, status] of casos) assert.equal((await llamar(conv, 'create', { body })).statusCode, status, JSON.stringify(body));
  let res = await llamar(conv, 'create', {
    body: { nombre: 'X', fecha_inicio: '2027-01-01', fecha_fin: '2027-06-30' },
    respuestas: [['SELECT nombre FROM dual_convocatorias', [{ nombre: '2026/2027' }]]],
  });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /2026\/2027/);
  assert.equal(escrituras().length, 0);

  res = await llamar(conv, 'create', {
    body: { nombre: '2027/2028', fecha_inicio: '2027-09-01', fecha_fin: '2028-06-30' },
    respuestas: [
      ['WHERE id_convocatoria = ?', [{ id_convocatoria: 77, activa: 0 }]],
      ['AS vigente', [{ id_convocatoria: 77, activa: 0, vigente: 1 }]],
    ],
  });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(escrituras()[0].params, ['2027/2028', '2027-09-01', '2028-06-30']);
  assert.match(escrituras()[0].sql, /VALUES \(\?, \?, \?, 0\)/, 'created inactive');
  assert.equal(res.body.activa, 1, 'activated because today is in its range');
});

test('edit: a future one freely, the active one only while it stays open today, never a closed one', async () => {
  assert.equal((await llamar(conv, 'update', { params: { id: 'x' } })).statusCode, 400);
  assert.equal((await llamar(conv, 'update', { params: { id: '7' } })).statusCode, 404);
  const fila = (activa, futura) => ['AS futura', [{ activa, futura, hoy: '2026-11-12' }]];

  let res = await llamar(conv, 'update', { params: { id: '5' }, body: {}, respuestas: [fila(0, 0)] });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /cerrada/);

  const activaBody = (inicio, fin) => ({ nombre: ' 2026/2027 ', fecha_inicio: inicio, fecha_fin: fin });
  for (const [inicio, fin] of [['2026-12-01', '2027-06-30'], ['2026-09-01', '2026-11-01']]) {
    res = await llamar(conv, 'update', { params: { id: '6' }, body: activaBody(inicio, fin), respuestas: [fila(1, 0)] });
    assert.equal(res.statusCode, 400, `${inicio}–${fin} would close the active one`);
    assert.match(res.body.error, /seguir abierta hoy/);
  }
  res = await llamar(conv, 'update', {
    params: { id: '6' }, body: activaBody('2026-09-01', '2027-07-31'),
    respuestas: [fila(1, 0), ['WHERE id_convocatoria = ?', [{ id_convocatoria: 6 }]]],
  });
  assert.equal(res.statusCode, 200, 'a typo in the end date of the active one can be fixed');
  assert.deepEqual(escrituras().at(-1).params, ['2026/2027', '2026-09-01', '2027-07-31', 6], 'name trimmed');

  const body = { nombre: '2027/2028', fecha_inicio: '2027-09-01', fecha_fin: '2028-06-30' };
  res = await llamar(conv, 'update', {
    params: { id: '7' }, body,
    respuestas: [fila(0, 1), ['WHERE id_convocatoria = ?', [{ id_convocatoria: 7 }]]],
  });
  assert.equal(res.statusCode, 200);
  const overlap = pool.calls.filter((c) => c.sql.startsWith('SELECT nombre FROM dual_convocatorias')).at(-1);
  assert.deepEqual(overlap.params, ['2028-06-30', '2027-09-01', 7, 7]);
  assert.deepEqual(escrituras().at(-1).params, ['2027/2028', '2027-09-01', '2028-06-30', 7]);
});

test('create: a name made only of spaces is refused; the name is stored trimmed', async () => {
  let res = await llamar(conv, 'create', { body: { nombre: '   ', fecha_inicio: '2027-01-01', fecha_fin: '2027-06-30' } });
  assert.equal(res.statusCode, 400);
  res = await llamar(conv, 'create', {
    body: { nombre: '  2027/2028 ', fecha_inicio: '2027-09-01', fecha_fin: '2028-06-30' },
    respuestas: [['WHERE id_convocatoria = ?', [{ id_convocatoria: 78, activa: 0 }]]],
  });
  assert.equal(res.statusCode, 201);
  assert.equal(escrituras().at(-1).params[0], '2027/2028');
});

// ── Document templates ──────────────────────────────────────────────────────

const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const docx = (extra = {}) => ({
  originalname: 'convenio.docx',
  mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  buffer: ZIP, size: ZIP.length, ...extra,
});

test('template upload: only generated types, only real DOCX files, at most 10 MB', async () => {
  const casos = [
    [{ clave: 'CV' }, docx(), /no admite plantilla/],
    [{ clave: 'CONVENIO' }, undefined, /ninguna plantilla/],
    [{ clave: 'CONVENIO' }, docx({ originalname: 'x.pdf' }), /DOCX/],
    [{ clave: 'CONVENIO' }, docx({ mimetype: 'text/html' }), /DOCX/],
    [{ clave: 'CONVENIO' }, docx({ buffer: Buffer.from('MZ fake') }), /DOCX/],
    [{ clave: 'CONVENIO' }, docx({ size: 11 * 1024 * 1024 }), /10 MB/],
  ];
  for (const [body, file, msg] of casos) {
    const res = await llamar(plant, 'upload', { body, file });
    assert.equal(res.statusCode, 400, msg.source);
    assert.match(res.body.error, msg);
  }
  assert.equal(escrituras().length, 0);
});

test('template upload: next version, the previous one deactivated, a safe file name', async () => {
  const res = await llamar(plant, 'upload', {
    body: { clave: 'convenio' }, file: docx({ originalname: '../"Convenio"\u0007.docx' }),
    respuestas: [['FROM dual_tipos_documento WHERE nombre = ?', [{ id_tipo_documento: 3 }]], ['COALESCE(MAX(version), 0)', [{ version: 2 }]]],
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.deepEqual([res.body.version, res.body.nombre_archivo], [3, '..Convenio.docx']);
  const w = escrituras();
  assert.match(w[0].sql, /SET es_activa = 0 WHERE id_tipo_documento = \? AND es_activa = 1/);
  assert.deepEqual(w[1].params.slice(2), ['..Convenio.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 3, 1]);
  assert.ok(hubo('COMMIT'));
});

test('template upload: an unconfigured type is refused; a database error rolls back', async () => {
  let res = await llamar(plant, 'upload', { body: { clave: 'CONVENIO' }, file: docx() });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /no configurado/);
  st = { respuestas: [['FROM dual_tipos_documento WHERE nombre = ?', [{ id_tipo_documento: 3 }]], ['INSERT INTO dual_documento_plantillas', () => { throw new Error('caída'); }]] };
  pool.calls.length = 0;
  await assert.rejects(plant.upload(mockReq({ body: { clave: 'CONVENIO' }, file: docx(), user: { id: 1 } }), mockRes()), /caída/);
  assert.ok(hubo('ROLLBACK'));
});

test('template list: every generated type with its active version and history', async () => {
  const res = await llamar(plant, 'list', {
    respuestas: [['FROM dual_documento_plantillas p', [
      { id_plantilla: 2, clave: 'CONVENIO', version: 2, es_activa: 1, nombre_archivo: 'c2.docx', subida_por: 'Admin', rol: 'ADMINISTRADOR' },
      { id_plantilla: 1, clave: 'CONVENIO', version: 1, es_activa: 0, nombre_archivo: 'c1.docx' },
    ]]],
  });
  const tipos = Object.fromEntries(res.body.tipos.map((t) => [t.clave, t]));
  assert.deepEqual(Object.keys(tipos).sort(), ['ANEXO_II', 'ANEXO_III', 'CONVENIO']);
  assert.equal(tipos.CONVENIO.activa.version, 2);
  assert.deepEqual(tipos.CONVENIO.versiones.map((v) => [v.version, v.es_activa]), [[2, true], [1, false]]);
  assert.equal(tipos.ANEXO_II.activa, null);
  assert.ok('convenio' in res.body);
});

test('template download: fixed type and name, never the uploaded name', async () => {
  let res = await llamar(plant, 'descargar', { params: { id: '2' } });
  assert.equal(res.statusCode, 404);
  res = await llamar(plant, 'descargar', { params: { id: '2' }, respuestas: [['WHERE p.id_plantilla = ?', [{ archivo: ZIP, version: 2, clave: 'CONVENIO' }]]] });
  assert.equal(res.headers['content-disposition'], 'attachment; filename="plantilla-convenio-v2.docx"');
  assert.match(res.headers['content-type'], /wordprocessingml/);
  assert.equal(res.body, ZIP);
});
