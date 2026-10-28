// Student data corrections (Administración). Shared by the direct edit and, later,
// by approving a student's change request.
//
// Rules:
// - The DNI/NIE is the student's login and identity: it is never editable here.
// - Personal fields live on gf_alumnosfct (one row per person).
// - The ciclo belongs to the application (dual_solicitudes_alumno.id_especialidad,
//   DB-01). gf_alumnosfct keeps a copy of the latest one, so the copy is only
//   updated when the edited application is the student's latest.
// - The ciclo cannot change while the application has a PENDIENTE or CONFIRMADA
//   reservation: those were checked against it (trg_dr_bi_reglas, and
//   trg_dsa_bu_reglas enforces it too). Staff cancel them first.
// - Preferences belong to a ciclo, so they are replaced with the ciclo.
// - Only the active convocatoria, and never an application de baja.
//
// Lock order: the application row, then its reservations. sp_reservar_alumno
// takes the same two in the same order, so a concurrent reservation either
// commits first (and blocks the ciclo change) or waits and then sees the new
// ciclo, which trg_dr_bi_reglas rejects.
const { dniNieValido } = require('../helpers/dbHelpers');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Column → rules. `required` columns are NOT NULL in gf_alumnosfct.
const CAMPOS = {
  nombre: { max: 100, required: true },
  domicilio: { max: 255, required: true },
  cp: { max: 10, required: true, re: /^[0-9]{5}$/, msg: 'El código postal debe tener 5 cifras.' },
  localidad: { max: 100, required: true },
  telalumno: { max: 20, required: true, re: /^[0-9]{9}$/, msg: 'El teléfono debe tener 9 cifras.' },
  telfamilia: { max: 20, empty: '' },
  email: { max: 100, required: true, re: EMAIL_RE, msg: 'El email no es válido.' },
  emailColegio: { max: 100, re: EMAIL_RE, msg: 'El email del centro no es válido.' },
  nacionalidad: { max: 50 },
  fechaNacimiento: { tipo: 'fecha' },
  sexo: { max: 15 },
  carnetDeConducir: { tipo: 'bool' },
  tieneCoche: { tipo: 'bool' },
  numeroSS: { max: 30 },
  situacionLaboral: { max: 30 },
  idiomasConocidos: { max: 255 },
  tutorLegal: { max: 100 },
  dniTutorLegal: { max: 15, dni: true },
};

const ETIQUETAS = {
  nombre: 'Nombre',
  domicilio: 'Domicilio',
  cp: 'Código postal',
  localidad: 'Localidad',
  telalumno: 'Teléfono',
  telfamilia: 'Teléfono familiar',
  email: 'Email',
  emailColegio: 'Email del centro',
  nacionalidad: 'Nacionalidad',
  fechaNacimiento: 'Fecha de nacimiento',
  sexo: 'Sexo',
  carnetDeConducir: 'Carnet de conducir',
  tieneCoche: 'Vehículo',
  numeroSS: 'Nº Seguridad Social',
  situacionLaboral: 'Situación laboral',
  idiomasConocidos: 'Idiomas',
  tutorLegal: 'Tutor legal',
  dniTutorLegal: 'DNI del tutor legal',
  id_especialidad: 'Ciclo',
  preferencias: 'Preferencias',
};

function httpError(status, code, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function fechaIso(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function boolValue(value) {
  if (value == null || value === '') return null;
  if (value === true || value === 1 || value === '1' || value === 'true') return 1;
  if (value === false || value === 0 || value === '0' || value === 'false') return 0;
  return undefined;
}

function normalizeCampo(key, value) {
  const regla = CAMPOS[key];
  if (regla.tipo === 'bool') return boolValue(value);
  if (regla.tipo === 'fecha') return fechaIso(value);
  if (value == null) return regla.empty ?? null;
  let text = String(value).trim();
  if (regla.dni) text = text.toUpperCase();
  if (key === 'numeroSS') text = text.replace(/\s/g, '');
  if (!text) return regla.empty ?? null;
  return text;
}

function normalizePreferencias(value) {
  if (!Array.isArray(value)) return [];
  const ids = value.map((v) => parseInt(v, 10)).filter((v) => Number.isInteger(v) && v > 0);
  return [...new Set(ids)];
}

function sameList(a = [], b = []) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// Current values in the same shape the edit form sends.
function pickSnapshot(row) {
  const snap = {};
  for (const key of Object.keys(CAMPOS)) snap[key] = normalizeCampo(key, row[key]);
  snap.id_especialidad = row.id_especialidad ?? null;
  snap.preferencias = row.preferencias || [];
  return snap;
}

// Only the known fields; the DNI is refused outright, unknown keys ignored.
function sanitizeProposed(body = {}) {
  if (Object.prototype.hasOwnProperty.call(body, 'dni')) {
    throw httpError(400, 'DNI_NO_EDITABLE', 'El DNI/NIE no se puede modificar.');
  }
  const out = {};
  for (const key of Object.keys(CAMPOS)) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = normalizeCampo(key, body[key]);
  }
  if (body.id_especialidad != null && body.id_especialidad !== '') {
    out.id_especialidad = parseInt(body.id_especialidad, 10) || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'preferencias')) {
    out.preferencias = normalizePreferencias(body.preferencias);
  }
  return out;
}

// Proposed values that differ from the snapshot. A new ciclo always brings its
// preferences along (empty when none were chosen): the old ones no longer apply.
function diffProposed(snapshot, proposed) {
  const out = {};
  for (const [key, value] of Object.entries(proposed)) {
    if (key === 'preferencias') {
      if (!sameList(snapshot.preferencias, value)) out.preferencias = value;
    } else if (snapshot[key] !== value) {
      out[key] = value;
    }
  }
  if (out.id_especialidad != null && !out.preferencias) out.preferencias = proposed.preferencias || [];
  return out;
}

// Validates only what changes, so legacy values the form never touched do not
// block an unrelated correction.
function validateChanges(changes) {
  const errores = {};
  for (const [key, value] of Object.entries(changes)) {
    const regla = CAMPOS[key];
    if (!regla) continue;
    if (regla.tipo === 'bool') {
      if (value === undefined) errores[key] = 'Valor no válido.';
      continue;
    }
    if (regla.tipo === 'fecha') {
      if (value && (!FECHA_RE.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`)))) {
        errores[key] = 'La fecha no es válida.';
      }
      continue;
    }
    if (regla.required && !value) {
      errores[key] = 'Este campo es obligatorio.';
      continue;
    }
    if (value && value.length > regla.max) errores[key] = `Máximo ${regla.max} caracteres.`;
    else if (value && regla.re && !regla.re.test(value)) errores[key] = regla.msg;
    else if (value && regla.dni && !dniNieValido(value)) errores[key] = 'No es un DNI/NIE válido.';
  }
  if (changes.preferencias && changes.preferencias.length > 3) {
    errores.preferencias = 'Como máximo 3 preferencias.';
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'id_especialidad') && !changes.id_especialidad) {
    errores.id_especialidad = 'Elige un ciclo.';
  }
  return errores;
}

// ── Database ────────────────────────────────────────────────────────────────

const ACTIVAS = "('PENDIENTE', 'CONFIRMADA')";

// Locks the application row first (see the lock order above) when `lock` is set.
async function loadDatos(conn, idSolicitud, { lock = false } = {}) {
  if (lock) {
    const [locked] = await conn.query(
      'SELECT id_solicitud_alumno FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ? FOR UPDATE',
      [idSolicitud],
    );
    if (!locked[0]) return null;
  }
  const [rows] = await conn.query(
    `SELECT sa.id_solicitud_alumno, sa.id_alumno, sa.id_convocatoria, sa.id_especialidad,
            ev.nombre AS estado_validacion, c.activa AS convocatoria_activa,
            a.dni, a.nombre, a.domicilio, a.cp, a.localidad, a.telalumno, a.telfamilia,
            a.email, a.emailColegio, a.nacionalidad, a.fechaNacimiento, a.sexo,
            a.carnetDeConducir, a.tieneCoche, a.numeroSS, a.situacionLaboral,
            a.idiomasConocidos, a.tutorLegal, a.dniTutorLegal,
            (sa.id_solicitud_alumno = (SELECT MAX(s2.id_solicitud_alumno)
                                         FROM dual_solicitudes_alumno s2
                                        WHERE s2.id_alumno = sa.id_alumno)) AS es_ultima
       FROM dual_solicitudes_alumno sa
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = sa.id_estado_validacion
       JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
      WHERE sa.id_solicitud_alumno = ?`,
    [idSolicitud],
  );
  const row = rows[0];
  if (!row) return null;
  const [prefs] = await conn.query(
    `SELECT id_preferencia FROM dual_solicitud_preferencias
      WHERE id_solicitud_alumno = ? ORDER BY orden`,
    [idSolicitud],
  );
  row.preferencias = prefs.map((p) => p.id_preferencia);
  return row;
}

// PENDIENTE / CONFIRMADA reservations of the application. With `lock`, a
// locking read: it waits for, and sees, a reservation committed meanwhile.
async function reservasActivas(conn, idSolicitud, { lock = false } = {}) {
  const [rows] = await conn.query(
    `SELECT r.id_reserva, er.nombre AS estado_reserva, emp.empresa, esp.nombre AS especialidad
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
      WHERE r.id_solicitud_alumno = ?
        AND er.nombre IN ${ACTIVAS}
      ORDER BY r.id_reserva${lock ? ' FOR UPDATE OF r' : ''}`,
    [idSolicitud],
  );
  return rows;
}

// Refuses with an httpError when the application cannot be edited at all.
function assertEditable(row) {
  if (!row) throw httpError(404, 'NO_ENCONTRADA', 'Solicitud no encontrada.');
  if (!Number(row.convocatoria_activa)) {
    throw httpError(400, 'CONVOCATORIA_CERRADA', 'Solo se pueden editar los datos de la convocatoria activa.');
  }
  if (row.estado_validacion === 'BAJA') {
    throw httpError(400, 'SOLICITUD_BAJA', 'La solicitud está dada de baja. Reactívala antes de editar sus datos.');
  }
}

// Checks the ciclo change against the database: an active ciclo, no active
// reservations, and preferences of that ciclo.
async function assertEspecialidad(conn, row, changes) {
  const idSolicitud = row.id_solicitud_alumno;
  if (changes.id_especialidad != null) {
    const [esp] = await conn.query(
      'SELECT id_especialidad, codigo FROM dual_especialidades WHERE id_especialidad = ? AND activa = 1',
      [changes.id_especialidad],
    );
    if (!esp[0]) throw httpError(400, 'ESPECIALIDAD_INVALIDA', 'El ciclo elegido no existe o no está activo.');
    const activas = await reservasActivas(conn, idSolicitud, { lock: true });
    if (activas.length) {
      throw httpError(409, 'RESERVAS_ACTIVAS',
        'No se puede cambiar el ciclo mientras el alumno tenga reservas pendientes o confirmadas. Cancélalas primero.',
        { reservas: activas });
    }
    changes.codigo_especialidad = esp[0].codigo;
  }
  if (changes.preferencias && changes.preferencias.length) {
    const ciclo = changes.id_especialidad ?? row.id_especialidad;
    const [prefs] = await conn.query(
      'SELECT id_preferencia FROM dual_preferencias WHERE id_preferencia IN (?) AND id_especialidad = ?',
      [changes.preferencias, ciclo],
    );
    if (prefs.length !== changes.preferencias.length) {
      throw httpError(400, 'PREFERENCIA_INVALIDA', 'Alguna preferencia no corresponde al ciclo elegido.');
    }
  }
}

// Writes the changes inside the caller's transaction. Returns the changed keys.
async function applyChanges(conn, row, changes) {
  const campos = Object.keys(changes).filter((k) => CAMPOS[k]);
  const sets = campos.map((k) => `${k} = ?`);
  const params = campos.map((k) => changes[k]);
  if (changes.id_especialidad != null && Number(row.es_ultima)) {
    sets.push('especialidad = ?', 'id_especialidad_dual = ?');
    params.push(changes.codigo_especialidad, changes.id_especialidad);
  }
  if (sets.length) {
    await conn.query(`UPDATE gf_alumnosfct SET ${sets.join(', ')} WHERE idalumno = ?`, [...params, row.id_alumno]);
  }
  if (changes.nombre) {
    await conn.query('UPDATE dual_usuarios SET nombre_mostrar = ? WHERE id_alumno = ?', [changes.nombre, row.id_alumno]);
  }
  if (changes.id_especialidad != null) {
    await conn.query(
      'UPDATE dual_solicitudes_alumno SET id_especialidad = ? WHERE id_solicitud_alumno = ?',
      [changes.id_especialidad, row.id_solicitud_alumno],
    );
  }
  if (changes.preferencias) {
    await conn.query('DELETE FROM dual_solicitud_preferencias WHERE id_solicitud_alumno = ?', [row.id_solicitud_alumno]);
    for (let i = 0; i < changes.preferencias.length; i++) {
      await conn.query(
        'INSERT INTO dual_solicitud_preferencias (id_solicitud_alumno, orden, id_preferencia) VALUES (?, ?, ?)',
        [row.id_solicitud_alumno, i + 1, changes.preferencias[i]],
      );
    }
  }
  return Object.keys(changes).filter((k) => k !== 'codigo_especialidad');
}

// Validates, checks the ciclo rules and writes `proposed` over `row` (the
// application, loaded with its lock). Throws an httpError when nothing changes
// or a rule fails. Shared by the direct edit and by approving a request.
async function corregir(conn, row, proposed) {
  const changes = diffProposed(pickSnapshot(row), proposed);
  if (!Object.keys(changes).length) {
    throw httpError(400, 'SIN_CAMBIOS', 'No hay cambios que guardar.');
  }
  const errores = validateChanges(changes);
  if (Object.keys(errores).length) {
    throw httpError(400, 'DATOS_INVALIDOS', 'Revisa los campos marcados.', { errores });
  }
  await assertEspecialidad(conn, row, changes);
  const campos = await applyChanges(conn, row, changes);
  return { changes, campos };
}

// ── Change requests (dual_alumno_cambios, migration 020) ────────────────────

function parseJson(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sameValue(key, a, b) {
  if (key === 'preferencias') return sameList(a || [], b || []);
  return (a ?? null) === (b ?? null);
}

// Fields the request touches whose live value is no longer the one the
// student saw (staff corrected it meanwhile).
function detectConflicts(snapshot, live, proposed) {
  return Object.keys(proposed)
    .filter((key) => !sameValue(key, snapshot[key], live[key]))
    .map((key) => ({ field: key, original: snapshot[key], actual: live[key], solicitado: proposed[key] }));
}

// Display names for ciclos and preferences, for diffs and conflict lists.
async function nombres(conn, snaps) {
  const ciclos = new Set();
  const prefs = new Set();
  for (const s of snaps) {
    if (s?.id_especialidad) ciclos.add(s.id_especialidad);
    for (const p of s?.preferencias || []) prefs.add(p);
  }
  const out = { ciclos: {}, prefs: {} };
  if (ciclos.size) {
    const [rows] = await conn.query('SELECT id_especialidad, nombre FROM dual_especialidades WHERE id_especialidad IN (?)', [[...ciclos]]);
    rows.forEach((r) => { out.ciclos[r.id_especialidad] = r.nombre; });
  }
  if (prefs.size) {
    const [rows] = await conn.query('SELECT id_preferencia, descripcion FROM dual_preferencias WHERE id_preferencia IN (?)', [[...prefs]]);
    rows.forEach((r) => { out.prefs[r.id_preferencia] = r.descripcion; });
  }
  return out;
}

function formatDisplay(key, value, names) {
  if (key === 'id_especialidad') return names.ciclos[value] || (value ? `#${value}` : '—');
  if (key === 'preferencias') return (value || []).map((id) => names.prefs[id] || `#${id}`).join('\n') || '—';
  if (CAMPOS[key]?.tipo === 'bool') return value == null ? '—' : value ? 'Sí' : 'No';
  return value == null || value === '' ? '—' : String(value);
}

function buildDiff(actual, proposed, names) {
  return Object.keys(proposed).map((key) => ({
    field: key,
    label: ETIQUETAS[key] || key,
    actual: formatDisplay(key, actual[key], names),
    solicitado: formatDisplay(key, proposed[key], names),
  }));
}

function labelConflicts(conflictos, names) {
  return conflictos.map((c) => ({
    field: c.field,
    label: ETIQUETAS[c.field] || c.field,
    original: formatDisplay(c.field, c.original, names),
    actual: formatDisplay(c.field, c.actual, names),
    solicitado: formatDisplay(c.field, c.solicitado, names),
  }));
}

module.exports = {
  CAMPOS,
  corregir,
  parseJson,
  detectConflicts,
  nombres,
  buildDiff,
  labelConflicts,
  ETIQUETAS,
  httpError,
  pickSnapshot,
  sanitizeProposed,
  diffProposed,
  validateChanges,
  loadDatos,
  reservasActivas,
  assertEditable,
  assertEspecialidad,
  applyChanges,
};
