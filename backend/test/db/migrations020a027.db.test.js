// Migrations 020–027 on the ISOLATED verification database <DBNAME>_verify
// (decision D8), never on DBNAME. Only SYNTHETIC rows.
//
//   DB_INTEGRATION=1 node --test test/db/migrations020a027.db.test.js
//   (KEEP_VERIFY=1 keeps the verification database afterwards)
//
// 1. Round trip: the schema after each rollback 027 → 020 is exactly the
//    schema a fresh database has at the previous version, and migrating up
//    again gives the 027 schema back.
// 2. The rules each migration adds, enforced by MySQL itself:
//    020 one pending change request per application, a rejection needs a
//        reason, resolved ⇔ has a resolution date;
//    022 emails that cannot be switched off, variable names;
//    023 the two shapes of an attachment, one row per document and email;
//    027 one active signature per holder, CENTRO has no owner and the others
//        do, an active signature has an image, phone sessions, FIRMA_IMAGEN.
// 3. Every rollback guard refuses while its data exists, changing nothing.
// Tests run in order and depend on each other.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const BASE = process.env.DBNAME;
const VERIFY = `${BASE}_verify`;
const enabled = process.env.DB_INTEGRATION === '1' && process.env.NODE_ENV !== 'production'
  && Boolean(BASE) && !/_verify$/.test(BASE);
const opts = { skip: enabled ? false : 'DB_INTEGRATION=1 no definido' };
const BACKEND = path.join(__dirname, '..', '..');

let conn;
let schemaDump;
const esquemas = {};
const fx = {};

function verifyDb(...args) {
  const r = spawnSync(process.execPath, [path.join(BACKEND, 'scripts', 'verifyDb.js'), ...args], {
    env: { ...process.env, DBNAME: BASE }, encoding: 'utf8',
  });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
}

async function dump() {
  const { connect } = require('../../scripts/lib/connect');
  const c = await connect(null);
  try {
    return await schemaDump.dumpSchema(c, VERIFY, { exclude: ['schema_migrations'] });
  } finally {
    await c.end();
  }
}

async function sqlError(promise) {
  try {
    await promise;
  } catch (err) {
    return err.sqlMessage || err.message;
  }
  return null;
}

const one = async (sql, params = []) => (await conn.query(sql, params))[0][0] || null;

async function reconectar() {
  if (conn) await conn.end();
  const { connect } = require('../../scripts/lib/connect');
  conn = await connect(VERIFY);
}

test.before(() => {
  if (!enabled) return;
  schemaDump = require('../../scripts/lib/schemaDump');
});

test.after(async () => {
  if (conn) await conn.end();
  if (enabled && process.env.KEEP_VERIFY !== '1') verifyDb('drop');
});

// ── 1. Round trip ───────────────────────────────────────────────────────

const VERSIONES = ['019', '020', '021', '022', '023', '024', '025', '026', '027'];

test('a fresh database at each version 019 … 027 (reference schemas)', { ...opts, timeout: 15 * 60 * 1000 }, async () => {
  for (const v of VERSIONES) {
    const r = verifyDb('create', '--to', v);
    assert.ok(r.ok, `create --to ${v}\n${r.out}`);
    esquemas[v] = await dump();
  }
  // 024 only adds rows (email variables); every other one changes the schema.
  for (const v of ['020', '021', '022', '023', '025', '026', '027']) {
    const i = VERSIONES.indexOf(v);
    assert.notDeepEqual(esquemas[v], esquemas[VERSIONES[i - 1]], `${v} changes the schema`);
  }
});

test('rolling back 027 → 020 one by one gives exactly the previous schema each time', { ...opts, timeout: 10 * 60 * 1000 }, async () => {
  for (let i = VERSIONES.length - 1; i >= 1; i -= 1) {
    const v = VERSIONES[i];
    const r = verifyDb('rollback', v);
    assert.ok(r.ok, `rollback ${v}\n${r.out}`);
    assert.deepEqual(await dump(), esquemas[VERSIONES[i - 1]], `after rolling back ${v}`);
  }
});

test('migrating up again from 019 gives the 027 schema back', { ...opts, timeout: 10 * 60 * 1000 }, async () => {
  const r = verifyDb('migrate', '--to', '027');
  assert.ok(r.ok, r.out);
  assert.deepEqual(await dump(), esquemas['027']);
  await reconectar();
});

test('re-running the migrations is a no-op (every migration is recorded once)', opts, async () => {
  const r = verifyDb('migrate', '--to', '027');
  assert.ok(r.ok, r.out);
  assert.deepEqual(await dump(), esquemas['027']);
  const { n } = await one("SELECT COUNT(*) AS n FROM schema_migrations WHERE version BETWEEN '020' AND '027'");
  assert.equal(Number(n), 8);
});

// ── 2. Rules ────────────────────────────────────────────────────────────

test('fixtures (synthetic): convocatoria, ciclo, student application, accounts', opts, async () => {
  const [conv] = await conn.query("INSERT INTO dual_convocatorias (nombre, fecha_inicio, fecha_fin, activa) VALUES ('2095/2096', '2095-09-01', '2096-08-31', 1)");
  fx.conv = conv.insertId;
  const [esp] = await conn.query("INSERT INTO dual_especialidades (codigo, nombre, turno) VALUES ('SINT_M', 'Ciclo sintético M', 0)");
  fx.esp = esp.insertId;
  const [a] = await conn.query(
    `INSERT INTO gf_alumnosfct (nombre, dni, domicilio, cp, localidad, telalumno, email, id_especialidad_dual, observaciones)
     VALUES ('ALUMNO SINTÉTICO M', '00000001R', 'Calle Ficticia 3', '50000', 'Zaragoza', '600000003', 'm@example.test', ?, '')`, [fx.esp]);
  const [s] = await conn.query('INSERT INTO dual_solicitudes_alumno (id_alumno, id_convocatoria, id_especialidad) VALUES (?, ?, ?)', [a.insertId, fx.conv, fx.esp]);
  fx.sol = s.insertId;
  const usuario = async (rol, extra = {}) => (await conn.query(
    `INSERT INTO dual_usuarios (nombre_mostrar, email, password_hash, id_rol, id_alumno, activo, must_change_password)
     VALUES (?, ?, 'x', (SELECT id_rol FROM dual_roles WHERE nombre = ?), ?, 1, 0)`,
    [`${rol} sintético`, extra.email || null, rol, extra.id_alumno || null]))[0].insertId;
  fx.alumnoUser = await usuario('ALUMNO', { id_alumno: a.insertId });
  fx.admin = await usuario('ADMINISTRADOR', { email: 'admin-m@example.test' });
});

test('020: one pending change request per application; resolving it allows a new one', opts, async () => {
  const pedir = () => conn.query(
    'INSERT INTO dual_alumno_cambios (id_solicitud_alumno, id_usuario_solicitante, payload, snapshot) VALUES (?, ?, ?, ?)',
    [fx.sol, fx.alumnoUser, JSON.stringify({ email: 'nuevo@example.test' }), JSON.stringify({ email: 'm@example.test' })]);
  const [c1] = await pedir();
  fx.cambio = c1.insertId;
  assert.match(await sqlError(pedir()), /Duplicate entry .*uq_dac_solicitud_pendiente/);
  await conn.query("UPDATE dual_alumno_cambios SET estado = 'APROBADO', fecha_resolucion = NOW(), id_usuario_resolutor = ? WHERE id_cambio = ?", [fx.admin, fx.cambio]);
  const [c2] = await pedir();
  assert.ok(c2.insertId > fx.cambio, 'a new pending request once the first is resolved');
  fx.cambio2 = c2.insertId;
});

test('020: a rejection needs a reason; resolved and resolution date go together; unknown states refused', opts, async () => {
  const id = fx.cambio2;
  assert.match(await sqlError(conn.query("UPDATE dual_alumno_cambios SET estado = 'RECHAZADO', fecha_resolucion = NOW() WHERE id_cambio = ?", [id])), /chk_dac_motivo/);
  assert.match(await sqlError(conn.query("UPDATE dual_alumno_cambios SET estado = 'RECHAZADO', motivo = '   ', fecha_resolucion = NOW() WHERE id_cambio = ?", [id])), /chk_dac_motivo/);
  assert.match(await sqlError(conn.query("UPDATE dual_alumno_cambios SET estado = 'APROBADO' WHERE id_cambio = ?", [id])), /chk_dac_resolucion/);
  assert.match(await sqlError(conn.query("UPDATE dual_alumno_cambios SET fecha_resolucion = NOW() WHERE id_cambio = ?", [id])), /chk_dac_resolucion/);
  assert.match(await sqlError(conn.query("UPDATE dual_alumno_cambios SET estado = 'OTRO' WHERE id_cambio = ?", [id])), /chk_dac_estado/);
  await conn.query("UPDATE dual_alumno_cambios SET estado = 'RECHAZADO', motivo = 'Dato no acreditado', fecha_resolucion = NOW() WHERE id_cambio = ?", [id]);
  assert.match(await sqlError(conn.query('DELETE FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ?', [fx.sol])), /foreign key constraint fails/);
});

test('022: an email that cannot be switched off stays on; variable names are lower-case identifiers', opts, async () => {
  const fija = await one('SELECT clave FROM dual_correo_plantillas WHERE desactivable = 0 LIMIT 1');
  assert.ok(fija, 'the seed has emails that cannot be switched off (password reset, footer)');
  assert.match(await sqlError(conn.query('UPDATE dual_correo_plantillas SET activa = 0 WHERE clave = ?', [fija.clave])), /chk_dcp_siempre_activa/);
  const libre = await one('SELECT clave FROM dual_correo_plantillas WHERE desactivable = 1 LIMIT 1');
  await conn.query('UPDATE dual_correo_plantillas SET activa = 0 WHERE clave = ?', [libre.clave]);
  await conn.query('UPDATE dual_correo_plantillas SET activa = 1 WHERE clave = ?', [libre.clave]);
  for (const mala of ['Alumno', '1alumno', 'alumno-x', 'alúmno']) {
    assert.match(
      await sqlError(conn.query("INSERT INTO dual_correo_variables (clave_plantilla, variable, tipo, etiqueta, descripcion, ejemplo) VALUES (?, ?, 'TEXTO', 'x', 'x', 'x')", [libre.clave, mala])),
      /chk_dcv_nombre/, mala,
    );
  }
  assert.match(
    await sqlError(conn.query("INSERT INTO dual_correo_variables (clave_plantilla, variable, tipo, etiqueta, descripcion, ejemplo) VALUES (?, 'ok_var', 'HTML', 'x', 'x', 'x')", [libre.clave])),
    /chk_dcv_tipo/,
  );
});

test('023: DOCUMENTO and ARCHIVO attachments have their own shape; one row per document and email', opts, async () => {
  const clave = (await one("SELECT clave FROM dual_correo_plantillas WHERE clave = 'solicitud_empresa_validada'")).clave;
  const convenio = (await one("SELECT id_tipo_documento AS id FROM dual_tipos_documento WHERE nombre = 'CONVENIO'")).id;
  const ins = (cols) => conn.query(`INSERT INTO dual_correo_adjuntos (${Object.keys(cols).join(', ')}) VALUES (?)`, [Object.values(cols)]);
  const pdf = Buffer.from('%PDF-1.4 sintético');
  assert.match(await sqlError(ins({ clave_plantilla: clave, tipo: 'DOCUMENTO' })), /chk_dca_forma/);
  assert.match(await sqlError(ins({ clave_plantilla: clave, tipo: 'DOCUMENTO', id_tipo_documento: convenio, archivo: pdf, nombre_archivo: 'x.pdf' })), /chk_dca_forma/);
  assert.match(await sqlError(ins({ clave_plantilla: clave, tipo: 'ARCHIVO', archivo: pdf, nombre_archivo: 'x.pdf', mime_type: 'application/pdf' })), /chk_dca_forma/);
  assert.match(await sqlError(ins({ clave_plantilla: clave, tipo: 'OTRO' })), /chk_dca_tipo|chk_dca_forma/);
  await ins({ clave_plantilla: clave, tipo: 'DOCUMENTO', id_tipo_documento: convenio });
  assert.match(await sqlError(ins({ clave_plantilla: clave, tipo: 'DOCUMENTO', id_tipo_documento: convenio })), /uq_dca_documento/);
  await ins({ clave_plantilla: clave, tipo: 'ARCHIVO', archivo: pdf, nombre_archivo: 'folleto.pdf', mime_type: 'application/pdf', tamano: pdf.length, id_usuario_subida: fx.admin });
  await ins({ clave_plantilla: clave, tipo: 'ARCHIVO', archivo: pdf, nombre_archivo: 'otro.pdf', mime_type: 'application/pdf', tamano: pdf.length });
  assert.match(await sqlError(conn.query("UPDATE dual_correo_plantillas SET lleva_adjuntos = 2 WHERE clave = ?", [clave])), /chk_dcp_lleva_adjuntos/);
});

test('027: one active signature per holder; CENTRO has no owner, the others do; active needs an image', opts, async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const firma = (cols) => {
    const fila = { ancho: 300, alto: 100, origen: 'PANTALLA', imagen: png, ...cols };
    return conn.query(`INSERT INTO dual_firmas (${Object.keys(fila).join(', ')}) VALUES (?)`, [Object.values(fila)])
      .then(([r]) => r.insertId);
  };
  const f1 = await firma({ titular: 'USUARIO', id_usuario: fx.alumnoUser });
  assert.match(await sqlError(firma({ titular: 'USUARIO', id_usuario: fx.alumnoUser })), /uq_firmas_activa/);
  fx.firmaTutor = await firma({ titular: 'TUTOR', id_usuario: fx.alumnoUser });
  await conn.query('UPDATE dual_firmas SET activa = 0 WHERE id_firma = ?', [f1]);
  fx.firmaAlumno = await firma({ titular: 'USUARIO', id_usuario: fx.alumnoUser, origen: 'MOVIL' });
  await firma({ titular: 'CENTRO', id_usuario: null, origen: 'FICHERO' });
  assert.match(await sqlError(firma({ titular: 'CENTRO', id_usuario: null })), /uq_firmas_activa/);
  assert.match(await sqlError(firma({ titular: 'CENTRO', id_usuario: fx.admin })), /chk_firmas_propietario/);
  assert.match(await sqlError(firma({ titular: 'USUARIO', id_usuario: null })), /chk_firmas_propietario/);
  assert.match(await sqlError(firma({ titular: 'OTRO', id_usuario: fx.admin })), /chk_firmas_titular/);
  assert.match(await sqlError(firma({ titular: 'USUARIO', id_usuario: fx.admin, origen: 'FAX' })), /chk_firmas_origen/);
  assert.match(await sqlError(firma({ titular: 'USUARIO', id_usuario: fx.admin, imagen: null })), /chk_firmas_imagen_activa/);
  // A withdrawn signature keeps its row without the image.
  await conn.query('UPDATE dual_firmas SET imagen = NULL, retirada_en = NOW() WHERE id_firma = ?', [f1]);
});

test('027: phone sessions have unique tokens and known states', opts, async () => {
  const sesion = (token, estado = 'ABIERTA') => conn.query(
    "INSERT INTO dual_firma_sesiones (token_hash, lectura_hash, estado, expira_en) VALUES (?, ?, ?, NOW() + INTERVAL 10 MINUTE)",
    [token.padEnd(64, '0'), 'l'.padEnd(64, '0'), estado]);
  await sesion('a');
  assert.match(await sqlError(sesion('a')), /uq_firma_sesiones_token/);
  assert.match(await sqlError(sesion('b', 'PERDIDA')), /chk_firma_sesiones_estado/);
});

test('027: a document signature can record FIRMA_IMAGEN and which images were stamped', opts, async () => {
  const cv = (await one("SELECT id_tipo_documento AS id FROM dual_tipos_documento WHERE nombre = 'CV'")).id;
  const [d] = await conn.query(
    'INSERT INTO dual_documentos (id_solicitud_alumno, id_tipo_documento, archivo, es_actual, firma_posiciones) VALUES (?, ?, ?, 1, ?)',
    [fx.sol, cv, Buffer.from('%PDF-1.4 x'), JSON.stringify({ ALUMNO: { pagina: 1, x: 10, y: 10, w: 100, h: 40 } })]);
  fx.doc = d.insertId;
  const firmar = (metodo, extra = {}) => conn.query(
    `INSERT INTO dual_documento_firmas (id_documento, rol, estado, firmado_en, metodo, id_firma_imagen, id_firma_tutor)
     VALUES (?, 'ALUMNO', 'FIRMADO', NOW(), ?, ?, ?)`,
    [fx.doc, metodo, extra.imagen ?? null, extra.tutor ?? null]);
  assert.match(await sqlError(firmar('A_MANO')), /chk_ddf_metodo/);
  assert.match(await sqlError(firmar('FIRMA_IMAGEN', { imagen: 999999 })), /foreign key constraint fails/);
  await firmar('FIRMA_IMAGEN', { imagen: fx.firmaAlumno, tutor: fx.firmaTutor });
  assert.match(await sqlError(conn.query('DELETE FROM dual_firmas WHERE id_firma = ?', [fx.firmaAlumno])), /foreign key constraint fails/);
});

// ── 3. Rollback guards ──────────────────────────────────────────────────

// A refused rollback stops inside its guard procedure, so the procedure stays
// behind. Harmless: every rollback script drops it before creating it again.
const sinGuardas = (esquema) => esquema.filter((o) => !(o.kind === 'PROCEDURE' && /^sp_0\d\d_down/.test(o.name)));

async function rechaza(version, mensaje) {
  const antes = sinGuardas(await dump());
  const r = verifyDb('rollback', version);
  assert.equal(r.ok, false, `rollback ${version} should refuse\n${r.out}`);
  assert.match(r.out, mensaje);
  assert.deepEqual(sinGuardas(await dump()), antes, `rollback ${version} changed nothing`);
  const { n } = await one('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = ?', [version]);
  assert.equal(Number(n), 1, `${version} is still recorded`);
}

test('027 rollback refuses once a document is signed with an image', opts, async () => {
  await rechaza('027', /firmados con imagen/);
});

test('024 rollback refuses while an email carries an annex attachment', opts, async () => {
  const anexo = (await one("SELECT id_tipo_documento AS id FROM dual_tipos_documento WHERE nombre = 'ANEXO_II'")).id;
  await conn.query("INSERT INTO dual_correo_adjuntos (clave_plantilla, tipo, id_tipo_documento) VALUES ('reserva_creada_empresa', 'DOCUMENTO', ?)", [anexo]);
  await rechaza('024', /solo admite la 024/);
});

test('023 rollback refuses while an uploaded PDF attachment exists', opts, async () => {
  await rechaza('023', /PDF subidos como adjuntos/);
});

test('022 rollback refuses once an email edit was audited', opts, async () => {
  await conn.query("INSERT INTO dual_eventos (entidad, id_entidad, accion) VALUES ('CORREO', 1, 'EDITAR')");
  await rechaza('022', /ediciones de correos auditadas/);
});

test('020 rollback refuses while change requests exist', opts, async () => {
  await rechaza('020', /dual_alumno_cambios tiene filas/);
});
