// Editable email templates (migration 022): template language, the seeded
// texts, notifications reading from the database, and the admin endpoints.
// No database, no real email.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');
const { correoSeed, correoDb } = require('./helpers/correoSeed');

let handler = () => [];
const pool = fakePool((sql, params) => handler(sql, params));
stub('src/db/pool', pool);

const sent = [];
stub('src/mail/config', {
  transporter: {
    mode: 'smtp',
    async sendMail(m) {
      sent.push(m);
      return {};
    },
  },
});

// Records the roles each route asks for.
const roles = [];
stub('src/middleware/auth', {
  requireAuth: (_req, _res, next) => next(),
  requireRole: (...r) => {
    roles.push(r);
    return (_req, _res, next) => next();
  },
});

const pl = require('../src/mail/plantilla');

const VARS = [
  { variable: 'alumno', tipo: 'TEXTO', etiqueta: 'Alumno', obligatoria: 0 },
  { variable: 'motivo', tipo: 'TEXTO', etiqueta: 'Motivo', obligatoria: 0 },
  { variable: 'enlace', tipo: 'ENLACE', etiqueta: 'Enlace', obligatoria: 1 },
  { variable: 'lista', tipo: 'LISTA', etiqueta: 'Lista', obligatoria: 0 },
];

// ── Template language ───────────────────────────────────────────────────────

test('render: the template text and the values are HTML-escaped; values are never read as markup', () => {
  const html = pl.renderCuerpo('<script>x</script> Hola **{{alumno}}** [ir]({{enlace}})', {
    alumno: '<b>Ana</b> **{{motivo}}**',
    motivo: 'NO',
    enlace: 'https://a.test/?x=1&y=2',
  }, VARS);
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;'));
  assert.ok(html.includes('<strong>&lt;b&gt;Ana&lt;/b&gt; **{{motivo}}**</strong>'));
  assert.ok(!html.includes('NO'));
  assert.ok(html.includes('<a href="https://a.test/?x=1&amp;y=2"'));
});

test('render: optional blocks, inverse blocks, paragraphs and lists', () => {
  const t = 'Hola {{alumno}}:\n\n{{#motivo}}Motivo: {{motivo}}\n\n{{/motivo}}{{^motivo}}Sin motivo.\n\n{{/motivo}}{{lista}}\n\nFin\nlínea';
  const con = pl.renderCuerpo(t, { alumno: 'Ana', motivo: 'Falta firma', lista: ['uno', 'dos'] }, VARS);
  assert.match(con, /Motivo: Falta firma/);
  assert.ok(!con.includes('Sin motivo'));
  assert.match(con, /<ul[^>]*><li>uno<\/li><li>dos<\/li><\/ul>/);
  assert.match(con, /Fin<br>línea/);
  const sin = pl.renderCuerpo(t, { alumno: 'Ana', motivo: '  ', lista: [] }, VARS);
  assert.ok(!sin.includes('Motivo:'));
  assert.match(sin, /Sin motivo\./);
  assert.ok(!sin.includes('<ul'));
});

test('render: only http(s) links; anything else stays plain text', () => {
  const html = pl.renderCuerpo('[a](javascript:alert(1)) [b]({{enlace}}) {{enlace}}', { enlace: 'javascript:alert(1)' }, VARS);
  assert.ok(!html.includes('<a '));
  assert.ok(!/href=/.test(html));
});

test('subject: blocks and values, plain text on one line', () => {
  assert.equal(pl.renderAsunto('Hola  {{alumno}}{{#motivo}} ({{motivo}}){{/motivo}}', { alumno: 'Ana' }, VARS), 'Hola Ana');
});

test('validate: unknown variables, broken blocks, bad tags, required and subject rules', () => {
  const v = (asunto, cuerpo) => pl.validar({ asunto, cuerpo }, VARS);
  assert.deepEqual(v('Asunto', 'Hola {{alumno}} {{enlace}}'), []);
  assert.ok(v('Asunto', '{{enlace}} {{nombre}}').some((e) => e.includes('{{nombre}}')));
  assert.ok(v('Asunto', '{{enlace}} {{#motivo}}x').some((e) => e.includes('Falta cerrar')));
  assert.ok(v('Asunto', '{{enlace}} {{#motivo}}x{{/alumno}}').some((e) => e.includes('se cierra con')));
  assert.ok(v('Asunto', '{{enlace}} {{/motivo}}').some((e) => e.includes('Sobra')));
  assert.ok(v('Asunto', '{{enlace}} {{Alumno}}').some((e) => e.includes('no es válida')));
  assert.ok(v('Asunto', '{{enlace}} {{alumno}').some((e) => e.includes('llaves')));
  assert.ok(v('Asunto', 'Hola {{alumno}}').some((e) => e.includes('Falta «Enlace»')));
  assert.ok(v('{{lista}}', '{{enlace}}').some((e) => e.includes('asunto')));
  assert.ok(v('Dos\nlíneas', '{{enlace}}').some((e) => e.includes('una sola línea')));
  assert.ok(v('', '').length >= 2);
  assert.ok(v('A', '{{enlace}} [x](ftp://a)').some((e) => e.includes('no es válido')));
  assert.ok(v('A', '{{enlace}} [x]({{alumno}})').some((e) => e.includes('no es válido')));
});

// ── Seeded texts (migration 022) ────────────────────────────────────────────

test('migration 022: every email the code sends has a valid template with the variables the code supplies', () => {
  const { CONTRATO, problemas } = load('src/services/correoPlantillas');
  const seed = correoSeed();
  assert.deepEqual(seed.plantillas.map((p) => p.clave).sort(), Object.keys(CONTRATO).sort());
  for (const p of seed.plantillas) {
    const vars = seed.variables.filter((v) => v.clave_plantilla === p.clave);
    assert.deepEqual(problemas(p.clave, p, vars), [], p.clave);
    for (const n of CONTRATO[p.clave]) assert.ok(vars.some((v) => v.variable === n), `${p.clave}: falta ${n}`);
    const h = seed.historial.find((x) => x.clave_plantilla === p.clave);
    assert.equal(h.version, 1);
    assert.equal(h.cuerpo, p.cuerpo, `${p.clave}: la versión 1 es el texto inicial`);
  }
  // Password reset and the footer can never be switched off.
  for (const clave of ['restablecer_contrasena', 'pie']) {
    assert.equal(seed.plantillas.find((p) => p.clave === clave).desactivable, 0);
  }
});

test('migration 022: the seeded texts render with their own examples', () => {
  const seed = correoSeed();
  for (const p of seed.plantillas) {
    const vars = seed.variables.filter((v) => v.clave_plantilla === p.clave);
    const html = pl.renderCuerpo(p.cuerpo, pl.ejemplos(vars), vars);
    assert.ok(!html.includes('{{'), p.clave);
    assert.ok(pl.renderAsunto(p.asunto, pl.ejemplos(vars), vars).length > 0, p.clave);
  }
});

// ── Notifications read the database ─────────────────────────────────────────

function notifDb(seed) {
  return (sql, params) => {
    const t = correoDb(sql, params, seed);
    if (t) return t;
    if (sql.includes('FROM dual_solicitudes_alumno sa') && sql.includes('a.email')) {
      return [{ nombre: 'Ana', email: 'ana@example.test', convocatoria: '2026/2027', especialidad: null }];
    }
    return [];
  };
}

test('notifications: an edited template is what gets sent, with the footer', async () => {
  const seed = correoSeed();
  const p = seed.plantillas.find((x) => x.clave === 'solicitud_alumno_validada');
  p.asunto = '¡Validada, {{alumno}}!';
  p.cuerpo = 'Enhorabuena **{{alumno}}** ({{ciclo}}).';
  seed.plantillas.find((x) => x.clave === 'pie').cuerpo = 'Firma de prueba';
  handler = notifDb(seed);
  const n = load('src/services/notificaciones');
  sent.length = 0;
  assert.equal(await n.solicitudAlumno(3, 'VALIDADO'), true);
  assert.equal(sent[0].subject, '¡Validada, Ana!');
  assert.match(sent[0].html, /Enhorabuena <strong>Ana<\/strong> \(FP Dual\)\./);
  assert.match(sent[0].html, /Firma de prueba/);
});

test('notifications: a switched-off, missing or broken template sends nothing and never throws', async () => {
  const n = load('src/services/notificaciones');

  const off = correoSeed();
  off.plantillas.find((x) => x.clave === 'solicitud_alumno_validada').activa = 0;
  handler = notifDb(off);
  sent.length = 0;
  assert.equal(await n.solicitudAlumno(3, 'VALIDADO'), false);

  const missing = correoSeed();
  missing.plantillas = missing.plantillas.filter((x) => x.clave !== 'solicitud_alumno_validada');
  handler = notifDb(missing);
  assert.equal(await n.solicitudAlumno(3, 'VALIDADO'), false);

  const broken = correoSeed();
  broken.plantillas.find((x) => x.clave === 'solicitud_alumno_validada').cuerpo = 'Hola {{#alumno}}';
  handler = notifDb(broken);
  assert.equal(await n.solicitudAlumno(3, 'VALIDADO'), false);
  assert.equal(sent.length, 0);
});

test('notifications: the direct emails (application received, places reduced) use templates too', async () => {
  handler = notifDb(correoSeed());
  const n = load('src/services/notificaciones');
  sent.length = 0;
  await n.solicitudAlumnoRecibida('ana@example.test', 'Ana <i>', '2026/2027');
  assert.equal(sent[0].subject, 'Solicitud Dual recibida');
  assert.match(sent[0].html, /Ana &lt;i&gt;/);
  await n.cupoReducido({
    email: 'c@e.test', empresa: 'ACME', especialidad: 'Joyería', cantidadAnterior: 3, cantidadNueva: 1,
    canceladas: [{ id_reserva: 7, alumno: 'Luis', dni_alumno: '1Z' }],
  });
  assert.equal(sent[1].to, 'c@e.test');
  assert.match(sent[1].html, /<li>Reserva #7 — Luis \(1Z\) · Joyería<\/li>/);
  assert.match(sent[1].html, /de 3 a 1/);
});

// ── Admin endpoints ─────────────────────────────────────────────────────────

test('routes: every /correos endpoint is for ADMINISTRADOR only', () => {
  roles.length = 0;
  load('src/routes/correosRoute');
  assert.equal(roles.length, 1);
  assert.deepEqual(roles[0], ['ADMINISTRADOR']);
});

function adminDb(seed, { versionActual = 1 } = {}) {
  return (sql, params) => {
    const t = correoDb(sql, params, seed);
    if (t) return t;
    if (sql.includes('FROM dual_correo_plantillas WHERE clave = ? FOR UPDATE')) {
      const p = seed.plantillas.find((x) => x.clave === params[0]);
      return p ? [{ ...p, version: versionActual }] : [];
    }
    if (sql.startsWith('SELECT variable, tipo, etiqueta, obligatoria FROM dual_correo_variables WHERE clave_plantilla = ?')) {
      return seed.variables.filter((v) => v.clave_plantilla === params[0]);
    }
    if (sql.startsWith('SELECT asunto, cuerpo FROM dual_correo_plantillas_historial')) {
      return seed.historial.filter((h) => h.clave_plantilla === params[0] && h.version === params[1]);
    }
    if (sql.startsWith('SELECT activa FROM dual_correo_plantillas')) {
      return seed.plantillas.filter((p) => p.clave === params[0]);
    }
    if (sql.startsWith('INSERT INTO dual_correo_plantillas_historial')) return { insertId: 77 };
    if (sql.startsWith('SELECT email FROM dual_usuarios')) return [{ email: 'admin@centro.test' }];
    if (sql.startsWith('SELECT id_tipo_documento FROM dual_tipos_documento WHERE nombre = ?')) {
      return params[0] === 'CONVENIO' ? [{ id_tipo_documento: 3 }] : [];
    }
    if (sql.startsWith('SELECT id_adjunto FROM dual_correo_adjuntos WHERE clave_plantilla = ? AND id_tipo_documento = ?')) {
      return seed.adjuntos.filter((a) => a.clave_plantilla === params[0] && a.tipo === 'DOCUMENTO');
    }
    if (sql.startsWith('SELECT COALESCE(MAX(orden), 0) + 1 AS orden')) return [{ orden: 2 }];
    if (sql.includes("COUNT(*) AS n FROM dual_correo_adjuntos")) {
      return [{ n: seed.adjuntos.filter((a) => a.clave_plantilla === params[0] && a.tipo === 'ARCHIVO').length }];
    }
    if (sql.includes('WHERE a.id_adjunto = ? AND a.clave_plantilla = ?')) {
      return seed.adjuntos.filter((a) => a.id_adjunto === params[0] && a.clave_plantilla === params[1]);
    }
    if (sql.startsWith('SELECT nombre_archivo, archivo FROM dual_correo_adjuntos')) {
      return seed.adjuntos
        .filter((a) => a.id_adjunto === params[0] && a.clave_plantilla === params[1] && a.tipo === 'ARCHIVO')
        .map((a) => ({ ...a, archivo: Buffer.from(a.archivo) }));
    }
    if (sql.startsWith('INSERT INTO dual_correo_adjuntos')) return { insertId: 9 };
    if (sql.includes('FROM dual_correo_plantillas p') && sql.includes('WHERE p.clave = ?')) {
      return seed.plantillas.filter((p) => p.clave === params[0]);
    }
    return [];
  };
}

const ADMIN = { id: 1, rol: 'ADMINISTRADOR' };
const writes = () => pool.calls.filter((c) => /^(INSERT|UPDATE)/.test(c.sql));

test('save: new version in the history, template updated and a CORREO event, in one transaction', async () => {
  const seed = correoSeed();
  handler = adminDb(seed);
  pool.calls.length = 0;
  const svc = load('src/services/correosService');
  const res = mockRes();
  await svc.update(mockReq({
    params: { clave: 'reserva_confirmada_empresa' },
    body: { asunto: 'Plaza confirmada: {{alumno}}', cuerpo: 'Hola {{coordinador}}.\r\n\r\nConfirmada.  ', activa: true, version: 1 },
    user: ADMIN,
  }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const w = writes();
  assert.match(w[0].sql, /^INSERT INTO dual_correo_plantillas_historial/);
  assert.deepEqual(w[0].params, ['reserva_confirmada_empresa', 2, 'Plaza confirmada: {{alumno}}', 'Hola {{coordinador}}.\n\nConfirmada.', 1, 0, null, 1]);
  assert.match(w[1].sql, /^UPDATE dual_correo_plantillas SET/);
  assert.match(w[2].sql, /^INSERT INTO dual_eventos/);
  assert.equal(w[2].params[0], 'CORREO');
  assert.equal(w[2].params[1], 77);
  assert.equal(w[2].params[2], 'EDITAR');
  assert.ok(pool.calls.some((c) => c.sql === 'COMMIT'));
});

test('save: invalid text → 400 with the list of problems; stale version → 409; nothing written', async () => {
  const svc = load('src/services/correosService');

  handler = adminDb(correoSeed());
  pool.calls.length = 0;
  let res = mockRes();
  await svc.update(mockReq({
    params: { clave: 'restablecer_contrasena' },
    body: { asunto: 'Contraseña', cuerpo: 'Hola {{nombre}} {{dni}}', activa: true, version: 1 },
    user: ADMIN,
  }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'PLANTILLA_NO_VALIDA');
  assert.ok(res.body.errores.some((e) => e.includes('{{dni}}')));
  assert.ok(res.body.errores.some((e) => e.includes('{{enlace}}')));

  handler = adminDb(correoSeed(), { versionActual: 3 });
  res = mockRes();
  await svc.update(mockReq({
    params: { clave: 'reserva_confirmada_empresa' },
    body: { asunto: 'A', cuerpo: 'B', activa: true, version: 2 },
    user: ADMIN,
  }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'VERSION_CAMBIADA');
  assert.equal(writes().length, 0);
});

test('save: password reset and footer cannot be switched off', async () => {
  const seed = correoSeed();
  handler = adminDb(seed);
  pool.calls.length = 0;
  const svc = load('src/services/correosService');
  const p = seed.plantillas.find((x) => x.clave === 'restablecer_contrasena');
  const res = mockRes();
  await svc.update(mockReq({ params: { clave: p.clave }, body: { asunto: p.asunto, cuerpo: p.cuerpo, activa: false, version: 1 }, user: ADMIN }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(writes().length, 0);
});

test('restore: copies an earlier version as a new one (RESTAURAR)', async () => {
  const seed = correoSeed();
  const p = seed.plantillas.find((x) => x.clave === 'reserva_confirmada_empresa');
  const original = p.cuerpo;
  p.cuerpo = 'Texto editado {{alumno}}';
  handler = adminDb(seed, { versionActual: 2 });
  pool.calls.length = 0;
  const svc = load('src/services/correosService');
  const res = mockRes();
  await svc.restaurar(mockReq({ params: { clave: p.clave }, body: { desde: 1, version: 2 }, user: ADMIN }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const w = writes();
  assert.equal(w[0].params[1], 3);
  assert.equal(w[0].params[3], original);
  assert.equal(w[2].params[2], 'RESTAURAR');
});

test('preview and test email: draft rendered with the examples; test goes to the admin only', async () => {
  handler = adminDb(correoSeed());
  const svc = load('src/services/correosService');
  let res = mockRes();
  await svc.vistaPrevia(mockReq({
    params: { clave: 'reserva_confirmada_alumno' },
    body: { asunto: 'Hola {{alumno}}', cuerpo: '**{{empresa}}** te confirma.' },
    user: ADMIN,
  }), res);
  assert.equal(res.body.asunto, 'Hola Ana García López');
  assert.match(res.body.html, /<strong>Talleres Ebro S\.L\.<\/strong> te confirma\./);
  assert.match(res.body.html, /Departamento FP Dual/);

  res = mockRes();
  await svc.vistaPrevia(mockReq({ params: { clave: 'reserva_confirmada_alumno' }, body: { asunto: 'x', cuerpo: '{{nope}}' }, user: ADMIN }), res);
  assert.ok(res.body.errores.length);

  sent.length = 0;
  res = mockRes();
  await svc.prueba(mockReq({
    params: { clave: 'reserva_confirmada_alumno' },
    body: { asunto: 'Hola {{alumno}}', cuerpo: 'Texto' },
    user: ADMIN,
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'admin@centro.test');
  assert.equal(sent[0].subject, '[Prueba] Hola Ana García López');
});

test('unknown or malformed clave → 404', async () => {
  handler = adminDb(correoSeed());
  const svc = load('src/services/correosService');
  for (const clave of ['no_existe', '../x', 'A']) {
    const res = mockRes();
    await svc.get(mockReq({ params: { clave }, user: ADMIN }), res);
    assert.equal(res.statusCode, 404, clave);
  }
});

// ── Attachments (migration 023) ─────────────────────────────────────────────

const PDF = Buffer.from('%PDF-1.4 convenio');

function empresaDb(seed) {
  return (sql, params) => {
    const t = correoDb(sql, params, seed);
    if (t) return t;
    if (sql.includes('FROM dual_solicitudes_empresa se') && sql.includes('ct.email')) {
      return [{ empresa: 'Talleres Ebro', coordinador: 'Luis', email: 'luis@ebro.test', convocatoria: '2026/2027' }];
    }
    if (sql.includes('FROM dual_solicitudes_alumno sa') && sql.includes('a.email')) {
      return [{ nombre: 'Ana', email: 'ana@example.test', convocatoria: '2026/2027', especialidad: null }];
    }
    return [];
  };
}

test('migration 023: one email per event; the merged ones carry the convenio and switch attachments on', () => {
  const seed = correoSeed();
  const claves = seed.plantillas.map((p) => p.clave);
  assert.ok(!claves.includes('solicitud_empresa_recibida_convenio'));
  assert.ok(!claves.includes('convenio_disponible_adjunto'));
  const fusionados = ['solicitud_empresa_recibida', 'convenio_disponible'];
  for (const clave of fusionados) {
    const p = seed.plantillas.find((x) => x.clave === clave);
    assert.equal(p.lleva_adjuntos, 1, clave);
    assert.deepEqual(seed.adjuntos.filter((a) => a.clave_plantilla === clave).map((a) => a.documento), ['CONVENIO'], clave);
    assert.equal(seed.historial.find((h) => h.clave_plantilla === clave).adjuntos, 'Convenio');
  }
  for (const p of seed.plantillas.filter((x) => !fusionados.includes(x.clave))) assert.equal(p.lleva_adjuntos, 0, p.clave);
});

test('migration 024: every email that may carry a document has its «…_adjunto» variable', () => {
  const { DOCUMENTOS } = load('src/services/correoPlantillas');
  const seed = correoSeed();
  for (const [clave, docs] of Object.entries(DOCUMENTOS)) {
    for (const d of docs) {
      const v = seed.variables.find((x) => x.clave_plantilla === clave && x.variable === `${d.toLowerCase()}_adjunto`);
      assert.ok(v, `${clave}: falta ${d.toLowerCase()}_adjunto`);
      assert.equal(v.opcional, 1);
    }
  }
  // Only reservation emails offer the anexos; the convenio stays with the company emails.
  assert.deepEqual(DOCUMENTOS.reserva_confirmada_alumno, ['ANEXO_II', 'ANEXO_III']);
  assert.equal(DOCUMENTOS.reserva_cancelada_alumno, undefined);
  assert.equal(DOCUMENTOS.solicitud_alumno_validada, undefined);
});

test('migration 023: the merged texts say whether the convenio is attached, generated or still pending', () => {
  const seed = correoSeed();
  const p = seed.plantillas.find((x) => x.clave === 'solicitud_empresa_recibida');
  const vars = seed.variables.filter((v) => v.clave_plantilla === p.clave);
  const base = { coordinador: 'Luis', empresa: 'ACME', convocatoria: '2026/2027' };
  assert.match(pl.renderCuerpo(p.cuerpo, { ...base, convenio_adjunto: 'sí', convenio_generado: 'sí' }, vars), /Adjuntamos el convenio/);
  const enPortal = pl.renderCuerpo(p.cuerpo, { ...base, convenio_generado: 'sí' }, vars);
  assert.match(enPortal, /ya está disponible en el portal/);
  assert.ok(!enPortal.includes('Adjuntamos'));
  assert.match(pl.renderCuerpo(p.cuerpo, base, vars), /en cuanto el centro lo genere/);
});

test('notifications: the convenio goes attached only while the email has attachments switched on', async () => {
  const n = load('src/services/notificaciones');

  handler = empresaDb(correoSeed());
  sent.length = 0;
  assert.equal(await n.convenioDisponible(5, PDF), true);
  assert.equal(sent[0].attachments.length, 1);
  assert.match(sent[0].attachments[0].filename, /^CONVENIO_Talleres_Ebro_\d{4}\.pdf$/);
  assert.match(sent[0].html, /Lo adjuntamos a este correo/);

  const off = correoSeed();
  off.plantillas.find((x) => x.clave === 'convenio_disponible').lleva_adjuntos = 0;
  handler = empresaDb(off);
  sent.length = 0;
  assert.equal(await n.convenioDisponible(5, PDF), true);
  assert.equal(sent[0].attachments, undefined);
  assert.match(sent[0].html, /Descargadlo desde el portal/);

  const sinConvenio = correoSeed();
  sinConvenio.adjuntos = [];
  handler = empresaDb(sinConvenio);
  sent.length = 0;
  await n.convenioDisponible(5, PDF);
  assert.equal(sent[0].attachments, undefined, 'the convenio was removed from the attachments');
});

test('notifications: a generated document the request does not have is left out; the email still goes', async () => {
  handler = empresaDb(correoSeed());
  const n = load('src/services/notificaciones');
  sent.length = 0;
  assert.equal(await n.solicitudEmpresaRecibida(5, null), true);
  assert.equal(sent[0].attachments, undefined);
  assert.match(sent[0].html, /en cuanto el centro lo genere/);
});

test('notifications: an uploaded PDF goes on any email with attachments switched on', async () => {
  const seed = correoSeed();
  seed.plantillas.find((x) => x.clave === 'solicitud_alumno_validada').lleva_adjuntos = 1;
  seed.adjuntos.push({
    id_adjunto: 30, clave_plantilla: 'solicitud_alumno_validada', tipo: 'ARCHIVO', documento: null,
    nombre_archivo: 'Guía FP Dual.pdf', mime_type: 'application/pdf', tamano: 12, archivo: '%PDF-1.4 guía', orden: 1,
  });
  handler = empresaDb(seed);
  const n = load('src/services/notificaciones');
  sent.length = 0;
  await n.solicitudAlumno(3, 'VALIDADO');
  assert.equal(sent[0].attachments.length, 1);
  assert.equal(sent[0].attachments[0].filename, 'Guía FP Dual.pdf');
  assert.equal(sent[0].attachments[0].content.toString(), '%PDF-1.4 guía');

  seed.plantillas.find((x) => x.clave === 'solicitud_alumno_validada').lleva_adjuntos = 0;
  sent.length = 0;
  await n.solicitudAlumno(3, 'VALIDADO');
  assert.equal(sent[0].attachments, undefined);
});

test('save: «lleva adjuntos» is stored with the version and audited', async () => {
  const seed = correoSeed();
  handler = adminDb(seed);
  pool.calls.length = 0;
  const svc = load('src/services/correosService');
  const p = seed.plantillas.find((x) => x.clave === 'convenio_disponible');
  const res = mockRes();
  await svc.update(mockReq({
    params: { clave: p.clave },
    body: { asunto: p.asunto, cuerpo: p.cuerpo, activa: true, lleva_adjuntos: false, version: 1 },
    user: ADMIN,
  }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const w = writes();
  assert.equal(w[0].params[5], 0);
  assert.equal(w[0].params[6], 'Convenio');
  assert.match(w[1].sql, /lleva_adjuntos = \?/);
  assert.equal(w[1].params[3], 0);
  assert.deepEqual(JSON.parse(w[2].params.at(-1)), { clave: p.clave, version: 2, lleva_adjuntos: false });

  // Not a boolean → 400; the footer can never carry attachments.
  let r = mockRes();
  await svc.update(mockReq({ params: { clave: p.clave }, body: { asunto: p.asunto, cuerpo: p.cuerpo, activa: true, lleva_adjuntos: 'sí', version: 1 }, user: ADMIN }), r);
  assert.equal(r.statusCode, 400);
  const pie = seed.plantillas.find((x) => x.clave === 'pie');
  r = mockRes();
  await svc.update(mockReq({ params: { clave: 'pie' }, body: { asunto: pie.asunto, cuerpo: pie.cuerpo, activa: true, lleva_adjuntos: true, version: 1 }, user: ADMIN }), r);
  assert.equal(r.statusCode, 400);
});

test('attachments: only the documents the code generates for that email; a duplicate is refused', async () => {
  const svc = load('src/services/correosService');

  handler = adminDb(correoSeed());
  pool.calls.length = 0;
  let res = mockRes();
  await svc.agregarDocumento(mockReq({ params: { clave: 'reserva_confirmada_alumno' }, body: { documento: 'CONVENIO', version: 1 }, user: ADMIN }), res);
  assert.equal(res.statusCode, 400);

  res = mockRes();
  await svc.agregarDocumento(mockReq({ params: { clave: 'convenio_disponible' }, body: { documento: 'CONVENIO', version: 1 }, user: ADMIN }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(writes().length, 0);

  const sin = correoSeed();
  sin.adjuntos = sin.adjuntos.filter((a) => a.clave_plantilla !== 'convenio_disponible');
  sin.plantillas.find((x) => x.clave === 'convenio_disponible').lleva_adjuntos = 0;
  handler = adminDb(sin);
  res = mockRes();
  await svc.agregarDocumento(mockReq({ params: { clave: 'convenio_disponible' }, body: { documento: 'convenio', version: 1 }, user: ADMIN }), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const w = writes();
  assert.match(w[0].sql, /^INSERT INTO dual_correo_adjuntos/);
  assert.deepEqual(w[0].params, ['convenio_disponible', 3, 2, 1]);
  assert.match(w[1].sql, /^INSERT INTO dual_correo_plantillas_historial/);
  assert.equal(w[1].params[5], 1, 'adding an attachment switches «lleva adjuntos» on');
  assert.equal(w[3].params[2], 'ADJUNTO_ANADIR');
});

test('attachments: uploaded PDFs are checked, named safely and limited in number', async () => {
  const svc = load('src/services/correosService');
  const { nombreArchivo } = svc._internals;
  assert.equal(nombreArchivo('../../etc/"x"<y>.PDF'), '....etcxy.PDF');
  assert.equal(nombreArchivo('Guía\u0000 alumnos'), 'Guía alumnos.pdf');

  handler = adminDb(correoSeed());
  pool.calls.length = 0;
  let res = mockRes();
  await svc.subirArchivo(mockReq({
    params: { clave: 'solicitud_alumno_validada' },
    body: { version: '1' },
    file: { originalname: 'x.pdf', buffer: Buffer.from('MZ not a pdf') },
    user: ADMIN,
  }), res);
  assert.equal(res.statusCode, 400);

  res = mockRes();
  await svc.subirArchivo(mockReq({
    params: { clave: 'pie' }, body: { version: '1' }, file: { originalname: 'x.pdf', buffer: PDF }, user: ADMIN,
  }), res);
  assert.equal(res.statusCode, 400);

  const llena = correoSeed();
  for (let i = 0; i < 5; i += 1) {
    llena.adjuntos.push({ id_adjunto: 40 + i, clave_plantilla: 'solicitud_alumno_validada', tipo: 'ARCHIVO', nombre_archivo: `${i}.pdf`, archivo: '%PDF' });
  }
  handler = adminDb(llena);
  res = mockRes();
  await svc.subirArchivo(mockReq({
    params: { clave: 'solicitud_alumno_validada' }, body: { version: '1' }, file: { originalname: 'x.pdf', buffer: PDF }, user: ADMIN,
  }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /como máximo 5/);
  assert.equal(writes().length, 0);

  handler = adminDb(correoSeed());
  res = mockRes();
  await svc.subirArchivo(mockReq({
    params: { clave: 'solicitud_alumno_validada' }, body: { version: '1' }, file: { originalname: 'Guía.pdf', buffer: PDF }, user: ADMIN,
  }), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const ins = writes().find((c) => c.sql.startsWith('INSERT INTO dual_correo_adjuntos'));
  assert.deepEqual(ins.params.slice(0, 3), ['solicitud_alumno_validada', 'Guía.pdf', PDF.length]);
  assert.equal(ins.params[3], PDF);
});

test('attachments: removing one is a new version (ADJUNTO_QUITAR); a stale version is refused', async () => {
  const svc = load('src/services/correosService');

  handler = adminDb(correoSeed(), { versionActual: 4 });
  pool.calls.length = 0;
  let res = mockRes();
  await svc.quitarAdjunto(mockReq({ params: { clave: 'convenio_disponible', id: '2' }, query: { version: '3' }, user: ADMIN }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(writes().length, 0);

  handler = adminDb(correoSeed());
  res = mockRes();
  await svc.quitarAdjunto(mockReq({ params: { clave: 'convenio_disponible', id: '1' }, query: { version: '1' }, user: ADMIN }), res);
  assert.equal(res.statusCode, 404, 'the attachment belongs to another email');

  res = mockRes();
  await svc.quitarAdjunto(mockReq({ params: { clave: 'convenio_disponible', id: '2' }, query: { version: '1' }, user: ADMIN }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const del = pool.calls.find((c) => c.sql.startsWith('DELETE FROM dual_correo_adjuntos'));
  assert.deepEqual(del.params, [2, 'convenio_disponible']);
  const ev = writes().find((c) => c.sql.startsWith('INSERT INTO dual_eventos'));
  assert.equal(ev.params[2], 'ADJUNTO_QUITAR');
});

test('attachments: an uploaded PDF downloads as a PDF; generated documents have no file', async () => {
  const seed = correoSeed();
  seed.adjuntos.push({ id_adjunto: 30, clave_plantilla: 'solicitud_alumno_validada', tipo: 'ARCHIVO', nombre_archivo: 'Guía "x".pdf', archivo: '%PDF-1.4' });
  handler = adminDb(seed);
  const svc = load('src/services/correosService');
  let res = mockRes();
  await svc.descargarAdjunto(mockReq({ params: { clave: 'solicitud_alumno_validada', id: '30' }, user: ADMIN }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.match(res.headers['content-disposition'], /^attachment; filename="Gu_a_x_\.pdf"; filename\*=UTF-8''Gu%C3%ADa%20%22x%22\.pdf$/);
  res = mockRes();
  await svc.descargarAdjunto(mockReq({ params: { clave: 'convenio_disponible', id: '2' }, user: ADMIN }), res);
  assert.equal(res.statusCode, 404);
});

test('preview and detail: the draft switch decides the convenio text; the editor gets attachments and warnings', async () => {
  const seed = correoSeed();
  handler = adminDb(seed);
  const svc = load('src/services/correosService');
  const p = seed.plantillas.find((x) => x.clave === 'convenio_disponible');
  let res = mockRes();
  await svc.vistaPrevia(mockReq({ params: { clave: p.clave }, body: { asunto: p.asunto, cuerpo: p.cuerpo, lleva_adjuntos: true }, user: ADMIN }), res);
  assert.match(res.body.html, /Lo adjuntamos/);
  assert.deepEqual(res.body.adjuntos.map((a) => a.nombre), ['Convenio']);
  res = mockRes();
  await svc.vistaPrevia(mockReq({ params: { clave: p.clave }, body: { asunto: p.asunto, cuerpo: p.cuerpo, lleva_adjuntos: false }, user: ADMIN }), res);
  assert.match(res.body.html, /Descargadlo desde el portal/);
  assert.deepEqual(res.body.adjuntos, []);

  const d = await svc._internals.detalle(p.clave);
  assert.equal(d.lleva_adjuntos, true);
  assert.deepEqual(d.adjuntos.map((a) => [a.tipo, a.nombre]), [['DOCUMENTO', 'Convenio']]);
  assert.deepEqual(d.documentos_disponibles, [{ documento: 'CONVENIO', nombre: 'Convenio', adjunto: true, plantilla_activa: null }]);
  assert.deepEqual(d.avisos_adjuntos, []);

  const { avisosAdjuntos } = load('src/services/correoPlantillas');
  assert.equal(avisosAdjuntos('reserva_creada_alumno', true, []).length, 1);
  assert.equal(avisosAdjuntos('reserva_creada_alumno', false, [{ tipo: 'ARCHIVO', nombre_archivo: 'a.pdf' }]).length, 1);
  assert.match(avisosAdjuntos('reserva_creada_alumno', true, [{ tipo: 'DOCUMENTO', documento: 'CONVENIO' }])[0], /no se puede adjuntar/);
});

test('notifications: a reservation email attaches that reservation\'s own Anexo, read from its documents', async () => {
  const seed = correoSeed();
  seed.plantillas.find((x) => x.clave === 'reserva_confirmada_alumno').lleva_adjuntos = 1;
  seed.plantillas.find((x) => x.clave === 'reserva_confirmada_alumno').cuerpo = 'Hola {{alumno}}.{{#anexo_ii_adjunto}} Adjuntamos el Anexo II.{{/anexo_ii_adjunto}}';
  seed.adjuntos.push(
    { id_adjunto: 50, clave_plantilla: 'reserva_confirmada_alumno', tipo: 'DOCUMENTO', documento: 'ANEXO_II', orden: 1 },
    { id_adjunto: 51, clave_plantilla: 'reserva_confirmada_alumno', tipo: 'DOCUMENTO', documento: 'ANEXO_III', orden: 2 },
  );
  const leidos = [];
  handler = (sql, params) => {
    const t = correoDb(sql, params, seed);
    if (t) return t;
    if (sql.includes('FROM dual_reservas r')) {
      return [{ id_reserva: 8, alumno: 'Ana Ruiz', email_alumno: 'ana@example.test', empresa: 'ACME', coordinador: 'Luis', email_empresa: 'l@acme.test', especialidad: 'Joyería', convocatoria: '2026/2027' }];
    }
    if (sql.startsWith('SELECT d.archivo FROM dual_documentos d')) {
      leidos.push(params);
      // Only the Anexo II exists: the contract of this reservation needs that one.
      return params[0] === 8 && params[1] === 'ANEXO_II' ? [{ archivo: Buffer.from('%PDF anexo') }] : [];
    }
    return [];
  };
  const n = load('src/services/notificaciones');
  sent.length = 0;
  await n.reservaConfirmada(8);
  const alumno = sent.find((m) => m.to === 'ana@example.test');
  assert.deepEqual(alumno.attachments.map((a) => a.filename), [`ANEXO_II_Ana_Ruiz_${new Date().getFullYear()}.pdf`]);
  assert.match(alumno.html, /Adjuntamos el Anexo II/);
  assert.deepEqual(leidos, [[8, 'ANEXO_II'], [8, 'ANEXO_III']]);
  const empresa = sent.find((m) => m.to === 'l@acme.test');
  assert.equal(empresa.attachments, undefined, 'the company email has no attachments configured');
});

test('notifications: a reapplication attaches the convenio already stored when none was generated now', async () => {
  const seed = correoSeed();
  handler = (sql, params) => {
    const t = empresaDb(seed)(sql, params);
    if (sql.startsWith('SELECT d.archivo FROM dual_documentos d')) {
      return params[0] === 5 && params[1] === 'CONVENIO' ? [{ archivo: Buffer.from('%PDF guardado') }] : [];
    }
    return t;
  };
  const n = load('src/services/notificaciones');
  sent.length = 0;
  await n.solicitudEmpresaRecibida(5, null);
  assert.equal(sent[0].attachments[0].content.toString(), '%PDF guardado');
  assert.match(sent[0].html, /Adjuntamos el convenio/);
});

test('detail: each document shows the active template it is generated with', async () => {
  const seed = correoSeed();
  const base = adminDb(seed);
  handler = (sql, params) => {
    if (sql.includes('FROM dual_documento_plantillas p') && sql.includes('p.es_activa = 1')) {
      assert.deepEqual(params, [['ANEXO_II', 'ANEXO_III']]);
      return [{ documento: 'ANEXO_III', version: 2, nombre_archivo: 'anexo3.docx' }];
    }
    return base(sql, params);
  };
  const svc = load('src/services/correosService');
  const d = await svc._internals.detalle('reserva_creada_empresa');
  assert.deepEqual(d.documentos_disponibles.map((x) => [x.documento, x.plantilla_activa]), [
    ['ANEXO_II', null],
    ['ANEXO_III', { version: 2, nombre_archivo: 'anexo3.docx' }],
  ]);
});

test('test email: uploaded PDFs go with it; generated documents are named as missing', async () => {
  const seed = correoSeed();
  seed.adjuntos.push({ id_adjunto: 30, clave_plantilla: 'convenio_disponible', tipo: 'ARCHIVO', nombre_archivo: 'Guía.pdf', archivo: '%PDF-1.4', orden: 2 });
  handler = adminDb(seed);
  const svc = load('src/services/correosService');
  const p = seed.plantillas.find((x) => x.clave === 'convenio_disponible');
  sent.length = 0;
  const res = mockRes();
  await svc.prueba(mockReq({ params: { clave: p.clave }, body: { asunto: p.asunto, cuerpo: p.cuerpo, lleva_adjuntos: true }, user: ADMIN }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(sent[0].attachments.map((a) => a.filename), ['Guía.pdf']);
  assert.match(res.body.message, /Convenio no va en la prueba/);
});
