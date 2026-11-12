// One convenio per company (migration 026): a new application with the same
// ciclos inherits the validated convenio, other ciclos open a renewal; the
// centre can replace a convenio with a reason; the steps the administrators
// receive depend on what is already done.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

let st = {};
const pool = fakePool((sql, params) => {
  for (const [match, out] of st.respuestas || []) {
    if (sql.includes(match)) return typeof out === 'function' ? out(sql, params) : out;
  }
  if (sql.startsWith('INSERT')) return { insertId: 90 };
  return [];
});
stub('src/db/pool', pool);
stub('src/mail/config', { transporter: { mode: 'log', sendMail: async () => ({}) } });
const avisos = [];
stub('src/services/notificaciones', new Proxy({}, { get: (_t, n) => async (...a) => { avisos.push([n, ...a]); } }));

const conv = load('src/services/conveniosEmpresa');
const svc = load('src/services/solicitudesEmpresaService');

const ADMIN = { id: 1, rol: 'ADMINISTRADOR' };
const conn = () => ({ query: pool.query });
function preparar(respuestas = []) {
  st = { respuestas };
  pool.calls.length = 0;
  avisos.length = 0;
}
const escrituras = () => pool.calls.filter((c) => /^(INSERT|UPDATE|DELETE)/.test(c.sql));
const VIGENTE = ['AND NOT EXISTS (SELECT 1 FROM dual_convenio_renovaciones r', [{ id_documento: 40, id_documento_origen: null, id_solicitud_empresa: 7, convocatoria: '2025/2026' }]];
const ciclos = (porSolicitud) => ['FROM dual_solicitud_empresa_especialidades ee JOIN dual_especialidades esp', (_sql, params) => porSolicitud[params[0]] || []];

test('reason in words: added and removed ciclos', () => {
  const a = [{ id: 1, nombre: 'Electricidad' }, { id: 2, nombre: 'Joyería' }];
  assert.equal(conv.cambioDeCiclos(a, [...a, { id: 3, nombre: 'Web' }]), 'se añade el ciclo Web');
  assert.equal(conv.cambioDeCiclos(a, [{ id: 3, nombre: 'Web' }]), 'se añade el ciclo Web; ya no se piden los ciclos Electricidad, Joyería');
  assert.equal(conv.mismosCiclos(a, [...a].reverse()), true);
  assert.equal(conv.mismosCiclos(a, a.slice(1)), false);
});

test('steps for the administrators follow what is already done', () => {
  assert.match(conv.pasosRenovacion({ generado: true })[0], /ya se ha generado/);
  assert.equal(conv.pasosRenovacion({ generado: true }).length, 3);
  const sin = conv.pasosRenovacion({ generado: false, sinPlantilla: true });
  assert.match(sin[0], /Subir la plantilla/);
  assert.match(sin.at(-1), /validar/);
  assert.match(conv.pasosRenovacion({ generado: false })[0], /^Generar el convenio nuevo/);
});

test('re-applying with the same ciclos inherits the validated convenio, with its signatures', async () => {
  preparar([VIGENTE, ciclos({ 7: [{ id: 1, nombre: 'Electricidad' }], 20: [{ id: 1, nombre: 'Electricidad' }] })]);
  const out = await conv.alSolicitarDeNuevo(conn(), { idSolicitud: 20, idEmpresa: 100, user: ADMIN });
  assert.deepEqual(out, { vigente: true, renovacion: null });
  const copia = escrituras().find((c) => c.sql.startsWith('INSERT INTO dual_documentos'));
  assert.match(copia.sql, /'HEREDADO'/);
  assert.deepEqual(copia.params, [20, 1, 40, 40]);
  const firmas = escrituras().find((c) => c.sql.startsWith('INSERT INTO dual_documento_firmas'));
  assert.deepEqual(firmas.params, [90, 40]);
  const ev = escrituras().find((c) => c.sql.startsWith('INSERT INTO dual_eventos'));
  assert.deepEqual([ev.params[0], ev.params[2]], ['DOCUMENTO', 'HEREDAR']);
  assert.ok(!escrituras().some((c) => c.sql.includes('dual_convenio_renovaciones')));
});

test('a copy of a copy points to the original convenio', async () => {
  preparar([
    ['AND NOT EXISTS (SELECT 1 FROM dual_convenio_renovaciones r', [{ id_documento: 41, id_documento_origen: 40, id_solicitud_empresa: 8, convocatoria: '2026/2027' }]],
    ciclos({ 8: [{ id: 1, nombre: 'Electricidad' }], 20: [{ id: 1, nombre: 'Electricidad' }] }),
  ]);
  await conv.alSolicitarDeNuevo(conn(), { idSolicitud: 20, idEmpresa: 100 });
  assert.deepEqual(escrituras().find((c) => c.sql.startsWith('INSERT INTO dual_documentos')).params, [20, null, 40, 41]);
});

test('re-applying with other ciclos opens a renewal with the ciclos before and after', async () => {
  preparar([VIGENTE, ciclos({ 7: [{ id: 1, nombre: 'Electricidad' }], 20: [{ id: 1, nombre: 'Electricidad' }, { id: 3, nombre: 'Web' }] })]);
  const out = await conv.alSolicitarDeNuevo(conn(), { idSolicitud: 20, idEmpresa: 100, user: ADMIN });
  assert.equal(out.vigente, false);
  assert.deepEqual(out.renovacion, {
    motivoCentro: 'la empresa ha presentado una solicitud nueva con otros ciclos (se añade el ciclo Web)',
    ciclosAntes: 'Electricidad',
    ciclosAhora: 'Electricidad, Web',
  });
  const ren = escrituras().find((c) => c.sql.startsWith('INSERT INTO dual_convenio_renovaciones'));
  assert.deepEqual(ren.params, [20, 'CICLOS', 'Nueva solicitud con otros ciclos: se añade el ciclo Web', 'Electricidad', 'Electricidad, Web', null, 1]);
  assert.ok(!escrituras().some((c) => c.sql.startsWith('INSERT INTO dual_documentos')), 'nothing inherited');
});

test('without a validated convenio in force nothing happens (generated as before)', async () => {
  preparar([]);
  assert.deepEqual(await conv.alSolicitarDeNuevo(conn(), { idSolicitud: 20, idEmpresa: 100 }), { vigente: false, renovacion: null });
  assert.equal(escrituras().length, 0);
});

test('a second change before the first is settled joins the open renewal', async () => {
  preparar([
    ['WHERE abierta_solicitud = ? FOR UPDATE', [{ id_renovacion: 5, detalle: 'La empresa ha añadido el ciclo Web' }]],
    ["td.nombre = 'CONVENIO' AND d.es_actual = 1", [{ id_documento: 91, tiene_archivo: 1 }]],
  ]);
  await conv.abrirRenovacion(conn(), { idSolicitud: 20, motivo: 'CICLOS', detalle: 'El centro ha añadido el ciclo Joyería', ciclosAhora: 'Web, Joyería' });
  assert.deepEqual(escrituras().find((c) => c.sql.startsWith('UPDATE dual_documentos')).params, [91], 'the not yet signed new one goes to history too');
  const upd = escrituras().find((c) => c.sql.startsWith('UPDATE dual_convenio_renovaciones'));
  assert.deepEqual(upd.params, ['La empresa ha añadido el ciclo Web; El centro ha añadido el ciclo Joyería', 'Web, Joyería', 5]);
  assert.ok(!escrituras().some((c) => c.sql.startsWith('INSERT INTO dual_convenio_renovaciones')));
});

test('after opening: the new convenio is generated and recorded, the company and the administrators told', async () => {
  preparar([]);
  const out = await conv.despuesDeAbrir(20, {
    generar: async () => ({ ok: true, id_documento: 95, pdf: Buffer.from('pdf') }),
    motivoEmpresa: 'habéis añadido el ciclo Web',
    motivoCentro: 'la empresa ha añadido el ciclo Web',
    ciclosAntes: 'Electricidad',
    ciclosAhora: 'Electricidad, Web',
  });
  assert.ok(out.pdf);
  assert.deepEqual(escrituras()[0].params, [95, 20]);
  assert.deepEqual(avisos.map((a) => a[0]), ['convenioRenovarEmpresa', 'convenioRenovarCentro']);
  assert.match(avisos[1][2].pasos[0], /ya se ha generado/);

  preparar([]);
  const sin = await conv.despuesDeAbrir(20, { generar: async () => ({ ok: false, code: 'SIN_PLANTILLA' }), avisarEmpresa: false, motivoCentro: 'x' });
  assert.equal(sin.sinPlantilla, true);
  assert.deepEqual(avisos.map((a) => a[0]), ['convenioRenovarCentro'], 'the caller sends the company its own email');
});

// ── «Sustituir convenio» ─────────────────────────────────────────────────────

async function sustituir(body, respuestas) {
  preparar(respuestas);
  const res = mockRes();
  await svc.sustituirConvenio(mockReq({ params: { id: '20' }, body, user: ADMIN }), res);
  return res;
}
const SOL = ['FROM dual_solicitudes_empresa se JOIN dual_estados_validacion ev', [{ id_solicitud_empresa: 20, estado: 'VALIDADO', activa: 1 }]];
const CONVENIO = ["td.nombre = 'CONVENIO' AND d.es_actual = 1", [{ id_documento: 40, tiene_archivo: 1, estado_validacion: 'VALIDADO' }]];

test('replace: a reason is required; only a current convenio of an active application, without a renewal open', async () => {
  assert.equal((await sustituir({}, [SOL, CONVENIO])).statusCode, 400);
  assert.equal((await sustituir({ motivo: 'x'.repeat(301) }, [SOL, CONVENIO])).statusCode, 400);
  let res = await sustituir({ motivo: 'Nuevo representante' }, [[SOL[0], [{ ...SOL[1][0], activa: 0 }]], CONVENIO]);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /convocatoria activa/);
  res = await sustituir({ motivo: 'Nuevo representante' }, [SOL]);
  assert.match(res.body.error, /todavía no tiene convenio/);
  res = await sustituir({ motivo: 'Nuevo representante' }, [SOL, CONVENIO, ['WHERE abierta_solicitud = ?', [{ id_renovacion: 3 }]]]);
  assert.equal(res.statusCode, 409);
  assert.equal(escrituras().length, 0);
});

test('replace: the convenio goes to history, a MANUAL renewal with the reason, then generated and everyone told', async () => {
  const res = await sustituir({ motivo: '  Nuevo   representante legal ' }, [SOL, CONVENIO]);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.match(res.body.message, /No hay plantilla activa/, 'no template in this test');
  assert.deepEqual(escrituras().find((c) => c.sql.startsWith('UPDATE dual_documentos')).params, [40]);
  const ren = escrituras().find((c) => c.sql.startsWith('INSERT INTO dual_convenio_renovaciones'));
  assert.deepEqual(ren.params, [20, 'MANUAL', 'Nuevo representante legal', null, null, 40, 1]);
  const ev = escrituras().find((c) => c.sql.startsWith('INSERT INTO dual_eventos'));
  assert.equal(ev.params[2], 'RENOVAR_CONVENIO');
  assert.equal(ev.params[7], 'Nuevo representante legal');
  assert.deepEqual(avisos.map((a) => a[0]), ['convenioRenovarEmpresa', 'convenioRenovarCentro']);
  assert.equal(avisos[0][2].motivo, 'el centro lo ha sustituido (Nuevo representante legal)');
});
