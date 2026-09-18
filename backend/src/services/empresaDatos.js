const { normalizeCif, normalizeDni, cifValido } = require('../helpers/dbHelpers');

const ESTADOS_CAMBIO = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  APROBADO: 'APROBADO',
  RECHAZADO: 'RECHAZADO',
});

const FIELD_DEFS = {
  empresa: { label: 'Razón social', group: 'empresa' },
  telefonoEmpresa: { label: 'Teléfono empresa', group: 'empresa' },
  emailEmpresa: { label: 'Email empresa', group: 'empresa' },
  web: { label: 'Web', group: 'empresa' },
  observaciones: { label: 'Observaciones', group: 'empresa' },
  cif: { label: 'CIF', group: 'empresa', adminOnly: true },

  domicilioLegal: { label: 'Domicilio fiscal', group: 'dir_legal' },
  cpLegal: { label: 'Código postal fiscal', group: 'dir_legal' },
  provinciaLegal: { label: 'Provincia fiscal', group: 'dir_legal' },
  localidadLegal: { label: 'Localidad fiscal', group: 'dir_legal' },
  municipioLegal: { label: 'Municipio fiscal', group: 'dir_legal' },
  telefonoLegal: { label: 'Teléfono fiscal', group: 'dir_legal' },
  emailLegal: { label: 'Email fiscal', group: 'dir_legal' },

  domicilioTrabajo: { label: 'Domicilio de trabajo', group: 'dir_trabajo' },
  cpTrabajo: { label: 'Código postal de trabajo', group: 'dir_trabajo' },
  provinciaTrabajo: { label: 'Provincia de trabajo', group: 'dir_trabajo' },
  localidadTrabajo: { label: 'Localidad de trabajo', group: 'dir_trabajo' },
  municipioTrabajo: { label: 'Municipio de trabajo', group: 'dir_trabajo' },
  telefonoTrabajo: { label: 'Teléfono de trabajo', group: 'dir_trabajo' },
  emailTrabajo: { label: 'Email de trabajo', group: 'dir_trabajo' },

  dniRepresentante: { label: 'DNI responsable legal', group: 'rep' },
  nombreRepresentante: { label: 'Nombre responsable legal', group: 'rep' },
  emailRepresentante: { label: 'Email responsable legal', group: 'rep' },
  telefonoRepresentante: { label: 'Teléfono responsable legal', group: 'rep' },
  cargoRepresentante: { label: 'Cargo responsable legal', group: 'rep' },

  dniCoordinador: { label: 'DNI coordinador', group: 'coord' },
  nombreCoordinador: { label: 'Nombre coordinador', group: 'coord' },
  emailCoordinador: { label: 'Email coordinador', group: 'coord' },
  telefonoCoordinador: { label: 'Teléfono coordinador', group: 'coord' },
  cargoCoordinador: { label: 'Cargo coordinador', group: 'coord' },

  descripcion_puesto: { label: 'Descripción del puesto', group: 'puesto' },
  transportes: { label: 'Métodos de transporte', group: 'transportes', type: 'ids' },
};

const REQUIRED_MERGED = [
  'empresa',
  'domicilioLegal', 'cpLegal', 'provinciaLegal', 'localidadLegal',
  'dniRepresentante', 'nombreRepresentante', 'emailRepresentante', 'telefonoRepresentante',
  'dniCoordinador', 'nombreCoordinador', 'emailCoordinador', 'telefonoCoordinador',
  'descripcion_puesto',
];

function parsePayload(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

function normalizeTransportes(value) {
  if (!Array.isArray(value)) return [];
  const ids = [...new Set(value.map((v) => parseInt(v, 10)).filter((n) => Number.isInteger(n) && n > 0))];
  ids.sort((a, b) => a - b);
  return ids;
}

function normalizeValue(key, value) {
  if (key === 'transportes') return normalizeTransportes(value);
  if (key === 'cif') return normalizeCif(value);
  if (key.startsWith('dni')) return normalizeDni(value);
  if (value == null) return '';
  return String(value).trim();
}

function valuesEqual(key, a, b) {
  if (key === 'transportes') {
    const left = normalizeTransportes(a);
    const right = normalizeTransportes(b);
    return left.length === right.length && left.every((v, i) => v === right[i]);
  }
  return normalizeValue(key, a) === normalizeValue(key, b);
}

function sanitizeProposed(input, { allowCif = false } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const key of Object.keys(FIELD_DEFS)) {
    if (!(key in src)) continue;
    if (FIELD_DEFS[key].adminOnly && !allowCif) continue;
    out[key] = normalizeValue(key, src[key]);
  }
  return out;
}

function pickSnapshot(datos) {
  const snap = {};
  for (const key of Object.keys(FIELD_DEFS)) {
    snap[key] = key === 'transportes'
      ? normalizeTransportes((datos.transportes || []).map((t) => t.id_transporte))
      : normalizeValue(key, datos[key]);
  }
  return snap;
}

function diffProposed(snapshot, proposed) {
  const changed = {};
  for (const key of Object.keys(proposed)) {
    if (!valuesEqual(key, snapshot[key], proposed[key])) {
      changed[key] = proposed[key];
    }
  }
  return changed;
}

function formatDisplay(key, value) {
  if (key === 'transportes') {
    if (Array.isArray(value) && value.length && typeof value[0] === 'object') {
      return value.map((t) => t.nombre_mostrar || t.nombre || t.id_transporte).join(', ') || '—';
    }
    const ids = normalizeTransportes(value);
    return ids.length ? ids.join(', ') : '—';
  }
  const text = value == null || value === '' ? '' : String(value);
  return text || '—';
}

async function loadEmpresaDatos(conn, idSolicitud) {
  const [rows] = await conn.query(
    `SELECT
        se.id_solicitud_empresa,
        se.id_empresa,
        se.id_convocatoria,
        se.id_representante_legal,
        se.id_coordinador_empresa,
        se.id_domicilio_legal,
        se.id_domicilio_trabajo,
        se.descripcion_puesto,
        se.fecha_solicitud,
        ev.nombre AS estado_validacion,
        c.nombre AS convocatoria,
        c.activa AS convocatoria_activa,
        emp.cif,
        emp.empresa,
        emp.web,
        emp.observaciones,
        emp.emailEmpresa,
        emp.telefonoEmpresa,
        dl.domicilio AS domicilioLegal,
        dl.cp AS cpLegal,
        dl.provincia AS provinciaLegal,
        dl.localidad AS localidadLegal,
        dl.municipio AS municipioLegal,
        dl.telefono AS telefonoLegal,
        dl.email AS emailLegal,
        dt.domicilio AS domicilioTrabajo,
        dt.cp AS cpTrabajo,
        dt.provincia AS provinciaTrabajo,
        dt.localidad AS localidadTrabajo,
        dt.municipio AS municipioTrabajo,
        dt.telefono AS telefonoTrabajo,
        dt.email AS emailTrabajo,
        rep.dni AS dniRepresentante,
        rep.nombre AS nombreRepresentante,
        rep.email AS emailRepresentante,
        rep.telefono AS telefonoRepresentante,
        rep.cargo AS cargoRepresentante,
        coord.dni AS dniCoordinador,
        coord.nombre AS nombreCoordinador,
        coord.email AS emailCoordinador,
        coord.telefono AS telefonoCoordinador,
        coord.cargo AS cargoCoordinador
       FROM dual_solicitudes_empresa se
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = se.id_estado_validacion
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
       JOIN ge_domicilios dl ON dl.iddomicilio = se.id_domicilio_legal
       JOIN ge_domicilios dt ON dt.iddomicilio = se.id_domicilio_trabajo
       JOIN ge_contactos rep ON rep.idcontacto = se.id_representante_legal
       JOIN ge_contactos coord ON coord.idcontacto = se.id_coordinador_empresa
      WHERE se.id_solicitud_empresa = ?
      FOR UPDATE`,
    [idSolicitud]
  );

  // FOR UPDATE on a multi-join SELECT is valid in InnoDB. Callers that only read
  // should pass a pool connection without needing a transaction; mysql2 will
  // still run the query. When called outside a transaction, FOR UPDATE does not
  // hold locks after the statement. That's acceptable for GET.
  if (!rows[0]) return null;

  const [transp] = await conn.query(
    `SELECT dt.id_transporte, dt.nombre, dt.nombre_mostrar
       FROM dual_empresa_transportes det
       JOIN dual_transportes dt ON dt.id_transporte = det.id_transporte
      WHERE det.id_empresa = ?
      ORDER BY dt.id_transporte`,
    [rows[0].id_empresa]
  );

  const row = rows[0];
  return {
    ...row,
    convocatoria_activa: Number(row.convocatoria_activa) === 1,
    transportes: transp,
    razonSocial: row.empresa,
    telEmpresa: row.telefonoEmpresa,
    dirRazSocial: row.domicilioLegal,
    municipio: row.municipioLegal,
    provincia: row.provinciaLegal,
    cpRazSoc: row.cpLegal,
    responsableLegal: row.nombreRepresentante,
    dniRl: row.dniRepresentante,
    cargo: row.cargoRepresentante,
    coordinador_nombre: row.nombreCoordinador,
    coordinador_email: row.emailCoordinador,
    coordinador_telefono: row.telefonoCoordinador,
    representante_nombre: row.nombreRepresentante,
    representante_email: row.emailRepresentante,
    representante_telefono: row.telefonoRepresentante,
    representante_dni: row.dniRepresentante,
    representante_cargo: row.cargoRepresentante,
    domicilio_legal: row.domicilioLegal,
    cp_legal: row.cpLegal,
    provincia_legal: row.provinciaLegal,
    localidad_legal: row.localidadLegal,
    domicilio_trabajo: row.domicilioTrabajo,
    direccionLugarTrabajo: row.domicilioTrabajo,
    descripcionPuesto: row.descripcion_puesto,
  };
}

async function loadEmpresaDatosRead(conn, idSolicitud) {
  // Same as loadEmpresaDatos but without FOR UPDATE for plain GETs.
  const [rows] = await conn.query(
    `SELECT
        se.id_solicitud_empresa,
        se.id_empresa,
        se.id_convocatoria,
        se.id_representante_legal,
        se.id_coordinador_empresa,
        se.id_domicilio_legal,
        se.id_domicilio_trabajo,
        se.descripcion_puesto,
        se.fecha_solicitud,
        ev.nombre AS estado_validacion,
        c.nombre AS convocatoria,
        c.activa AS convocatoria_activa,
        emp.cif,
        emp.empresa,
        emp.web,
        emp.observaciones,
        emp.emailEmpresa,
        emp.telefonoEmpresa,
        dl.domicilio AS domicilioLegal,
        dl.cp AS cpLegal,
        dl.provincia AS provinciaLegal,
        dl.localidad AS localidadLegal,
        dl.municipio AS municipioLegal,
        dl.telefono AS telefonoLegal,
        dl.email AS emailLegal,
        dt.domicilio AS domicilioTrabajo,
        dt.cp AS cpTrabajo,
        dt.provincia AS provinciaTrabajo,
        dt.localidad AS localidadTrabajo,
        dt.municipio AS municipioTrabajo,
        dt.telefono AS telefonoTrabajo,
        dt.email AS emailTrabajo,
        rep.dni AS dniRepresentante,
        rep.nombre AS nombreRepresentante,
        rep.email AS emailRepresentante,
        rep.telefono AS telefonoRepresentante,
        rep.cargo AS cargoRepresentante,
        coord.dni AS dniCoordinador,
        coord.nombre AS nombreCoordinador,
        coord.email AS emailCoordinador,
        coord.telefono AS telefonoCoordinador,
        coord.cargo AS cargoCoordinador
       FROM dual_solicitudes_empresa se
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = se.id_estado_validacion
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
       JOIN ge_domicilios dl ON dl.iddomicilio = se.id_domicilio_legal
       JOIN ge_domicilios dt ON dt.iddomicilio = se.id_domicilio_trabajo
       JOIN ge_contactos rep ON rep.idcontacto = se.id_representante_legal
       JOIN ge_contactos coord ON coord.idcontacto = se.id_coordinador_empresa
      WHERE se.id_solicitud_empresa = ?`,
    [idSolicitud]
  );
  if (!rows[0]) return null;
  const [transp] = await conn.query(
    `SELECT dt.id_transporte, dt.nombre, dt.nombre_mostrar
       FROM dual_empresa_transportes det
       JOIN dual_transportes dt ON dt.id_transporte = det.id_transporte
      WHERE det.id_empresa = ?
      ORDER BY dt.id_transporte`,
    [rows[0].id_empresa]
  );
  const row = rows[0];
  return {
    ...row,
    convocatoria_activa: Number(row.convocatoria_activa) === 1,
    transportes: transp,
    razonSocial: row.empresa,
    telEmpresa: row.telefonoEmpresa,
    dirRazSocial: row.domicilioLegal,
    municipio: row.municipioLegal,
    provincia: row.provinciaLegal,
    cpRazSoc: row.cpLegal,
    responsableLegal: row.nombreRepresentante,
    dniRl: row.dniRepresentante,
    cargo: row.cargoRepresentante,
    coordinador_nombre: row.nombreCoordinador,
    coordinador_email: row.emailCoordinador,
    coordinador_telefono: row.telefonoCoordinador,
    representante_nombre: row.nombreRepresentante,
    representante_email: row.emailRepresentante,
    representante_telefono: row.telefonoRepresentante,
    representante_dni: row.dniRepresentante,
    representante_cargo: row.cargoRepresentante,
    domicilio_legal: row.domicilioLegal,
    cp_legal: row.cpLegal,
    provincia_legal: row.provinciaLegal,
    localidad_legal: row.localidadLegal,
    domicilio_trabajo: row.domicilioTrabajo,
    direccionLugarTrabajo: row.domicilioTrabajo,
    descripcionPuesto: row.descripcion_puesto,
  };
}

function validateMerged(merged, { allowCif = false, cifChanging = false } = {}) {
  for (const key of REQUIRED_MERGED) {
    if (!String(merged[key] || '').trim()) {
      return `El campo "${FIELD_DEFS[key].label}" es obligatorio.`;
    }
  }
  if (allowCif && cifChanging) {
    if (!String(merged.cif || '').trim() || !cifValido(merged.cif)) {
      return 'El CIF indicado no es válido.';
    }
  }
  return null;
}

async function cloneDomicilio(conn, idDomicilio) {
  const [ins] = await conn.query(
    `INSERT INTO ge_domicilios
       (idempresa, domicilio, cp, provincia, localidad, telefono, email, especialidad, municipio)
     SELECT idempresa, domicilio, cp, provincia, localidad, telefono, email, especialidad, municipio
       FROM ge_domicilios
      WHERE iddomicilio = ?`,
    [idDomicilio]
  );
  return ins.insertId;
}

async function domicilioShared(conn, idDomicilio, idSolicitud) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n
       FROM dual_solicitudes_empresa
      WHERE id_solicitud_empresa <> ?
        AND (id_domicilio_legal = ? OR id_domicilio_trabajo = ?)`,
    [idSolicitud, idDomicilio, idDomicilio]
  );
  return Number(rows[0].n) > 0;
}

async function ensureExclusiveDomicilio(conn, ctx, which) {
  const currentId = which === 'legal' ? ctx.id_domicilio_legal : ctx.id_domicilio_trabajo;
  if (!await domicilioShared(conn, currentId, ctx.id_solicitud_empresa)) {
    return currentId;
  }
  const newId = await cloneDomicilio(conn, currentId);
  if (which === 'legal') {
    await conn.query(
      'UPDATE dual_solicitudes_empresa SET id_domicilio_legal = ? WHERE id_solicitud_empresa = ?',
      [newId, ctx.id_solicitud_empresa]
    );
    ctx.id_domicilio_legal = newId;
  } else {
    await conn.query(
      'UPDATE dual_solicitudes_empresa SET id_domicilio_trabajo = ? WHERE id_solicitud_empresa = ?',
      [newId, ctx.id_solicitud_empresa]
    );
    ctx.id_domicilio_trabajo = newId;
  }
  return newId;
}

async function applyEmpresaDatos(conn, ctx, proposed, { allowCif = false } = {}) {
  const fields = sanitizeProposed(proposed, { allowCif });
  if (!Object.keys(fields).length) {
    const err = new Error('No hay cambios que aplicar.');
    err.status = 400;
    throw err;
  }

  const live = await loadEmpresaDatos(conn, ctx.id_solicitud_empresa);
  if (!live) {
    const err = new Error('Solicitud no encontrada.');
    err.status = 404;
    throw err;
  }

  const merged = { ...pickSnapshot(live), ...fields };
  const invalid = validateMerged(merged, { allowCif, cifChanging: allowCif && Object.prototype.hasOwnProperty.call(fields, 'cif') });
  if (invalid) {
    const err = new Error(invalid);
    err.status = 400;
    throw err;
  }

  if (allowCif && 'cif' in fields) {
    const [dup] = await conn.query(
      'SELECT idempresa FROM ge_empresas WHERE UPPER(TRIM(cif)) = ? AND idempresa <> ? LIMIT 1',
      [fields.cif, live.id_empresa]
    );
    if (dup[0]) {
      const err = new Error('El CIF ya pertenece a otra empresa.');
      err.status = 409;
      throw err;
    }
  }

  const empCols = [];
  const empParams = [];
  const empMap = {
    empresa: 'empresa',
    telefonoEmpresa: 'telefonoEmpresa',
    emailEmpresa: 'emailEmpresa',
    web: 'web',
    observaciones: 'observaciones',
    cif: 'cif',
  };
  for (const key of Object.keys(empMap)) {
    if (key in fields) {
      empCols.push(`${empMap[key]} = ?`);
      empParams.push(fields[key]);
    }
  }
  if (empCols.length) {
    empParams.push(live.id_empresa);
    await conn.query(`UPDATE ge_empresas SET ${empCols.join(', ')} WHERE idempresa = ?`, empParams);
  }

  const legalKeys = ['domicilioLegal', 'cpLegal', 'provinciaLegal', 'localidadLegal', 'municipioLegal', 'telefonoLegal', 'emailLegal'];
  const workKeys = ['domicilioTrabajo', 'cpTrabajo', 'provinciaTrabajo', 'localidadTrabajo', 'municipioTrabajo', 'telefonoTrabajo', 'emailTrabajo'];
  const legalChanged = legalKeys.some((k) => k in fields);
  const workChanged = workKeys.some((k) => k in fields);

  let idLegal = live.id_domicilio_legal;
  let idWork = live.id_domicilio_trabajo;
  let sharedSameRow = idLegal === idWork;

  const workWouldDiverge = sharedSameRow && workKeys.some((k) => {
    const legalTwin = k.replace('Trabajo', 'Legal');
    const workVal = k in fields ? fields[k] : merged[k];
    const legalVal = legalTwin in fields ? fields[legalTwin] : merged[legalTwin];
    return !valuesEqual(k, workVal, legalVal);
  });

  if ((legalChanged || workChanged) && sharedSameRow) {
    const ctxBoth = {
      id_solicitud_empresa: live.id_solicitud_empresa,
      id_domicilio_legal: idLegal,
      id_domicilio_trabajo: idWork,
    };
    idLegal = await ensureExclusiveDomicilio(conn, ctxBoth, 'legal');
    await conn.query(
      'UPDATE dual_solicitudes_empresa SET id_domicilio_trabajo = ? WHERE id_solicitud_empresa = ?',
      [idLegal, live.id_solicitud_empresa]
    );
    idWork = idLegal;
    if (workWouldDiverge) {
      idWork = await cloneDomicilio(conn, idLegal);
      await conn.query(
        'UPDATE dual_solicitudes_empresa SET id_domicilio_trabajo = ? WHERE id_solicitud_empresa = ?',
        [idWork, live.id_solicitud_empresa]
      );
      sharedSameRow = false;
    }
  } else {
    if (legalChanged) {
      idLegal = await ensureExclusiveDomicilio(conn, {
        id_solicitud_empresa: live.id_solicitud_empresa,
        id_domicilio_legal: idLegal,
        id_domicilio_trabajo: idWork,
      }, 'legal');
    }
    if (workChanged) {
      idWork = await ensureExclusiveDomicilio(conn, {
        id_solicitud_empresa: live.id_solicitud_empresa,
        id_domicilio_legal: idLegal,
        id_domicilio_trabajo: idWork,
      }, 'trabajo');
    }
  }

  if (legalChanged) {
    const colMap = {
      domicilioLegal: 'domicilio',
      cpLegal: 'cp',
      provinciaLegal: 'provincia',
      localidadLegal: 'localidad',
      municipioLegal: 'municipio',
      telefonoLegal: 'telefono',
      emailLegal: 'email',
    };
    const sets = [];
    const params = [];
    for (const key of legalKeys) {
      if (key in fields) {
        sets.push(`${colMap[key]} = ?`);
        params.push(fields[key]);
      }
    }
    if (sets.length) {
      params.push(idLegal);
      await conn.query(`UPDATE ge_domicilios SET ${sets.join(', ')} WHERE iddomicilio = ?`, params);
    }
  }

  if (workChanged && idWork) {
    const colMap = {
      domicilioTrabajo: 'domicilio',
      cpTrabajo: 'cp',
      provinciaTrabajo: 'provincia',
      localidadTrabajo: 'localidad',
      municipioTrabajo: 'municipio',
      telefonoTrabajo: 'telefono',
      emailTrabajo: 'email',
    };
    const sets = [];
    const params = [];
    for (const key of workKeys) {
      if (key in fields) {
        sets.push(`${colMap[key]} = ?`);
        params.push(fields[key]);
      }
    }
    if (sets.length) {
      params.push(idWork);
      await conn.query(`UPDATE ge_domicilios SET ${sets.join(', ')} WHERE iddomicilio = ?`, params);
    }
  }

  const repKeys = ['dniRepresentante', 'nombreRepresentante', 'emailRepresentante', 'telefonoRepresentante', 'cargoRepresentante'];
  if (repKeys.some((k) => k in fields)) {
    const [shared] = await conn.query(
      `SELECT COUNT(*) AS n FROM dual_solicitudes_empresa
        WHERE id_solicitud_empresa <> ? AND id_representante_legal = ?`,
      [live.id_solicitud_empresa, live.id_representante_legal]
    );
    let idRep = live.id_representante_legal;
    if (Number(shared[0].n) > 0) {
      const [ins] = await conn.query(
        `INSERT INTO ge_contactos (iddomicilio, dni, nombre, email, telefono, cargo, observaciones, especialidad)
         SELECT ?, dni, nombre, email, telefono, cargo, observaciones, especialidad
           FROM ge_contactos WHERE idcontacto = ?`,
        [idLegal, idRep]
      );
      idRep = ins.insertId;
      await conn.query(
        'UPDATE dual_solicitudes_empresa SET id_representante_legal = ? WHERE id_solicitud_empresa = ?',
        [idRep, live.id_solicitud_empresa]
      );
    }
    const colMap = {
      dniRepresentante: 'dni',
      nombreRepresentante: 'nombre',
      emailRepresentante: 'email',
      telefonoRepresentante: 'telefono',
      cargoRepresentante: 'cargo',
    };
    const sets = [];
    const params = [];
    for (const key of repKeys) {
      if (key in fields) {
        sets.push(`${colMap[key]} = ?`);
        params.push(fields[key]);
      }
    }
    params.push(idRep);
    await conn.query(`UPDATE ge_contactos SET ${sets.join(', ')} WHERE idcontacto = ?`, params);
  }

  const coordKeys = ['dniCoordinador', 'nombreCoordinador', 'emailCoordinador', 'telefonoCoordinador', 'cargoCoordinador'];
  if (coordKeys.some((k) => k in fields)) {
    const colMap = {
      dniCoordinador: 'dni',
      nombreCoordinador: 'nombre',
      emailCoordinador: 'email',
      telefonoCoordinador: 'telefono',
      cargoCoordinador: 'cargo',
    };
    const sets = [];
    const params = [];
    for (const key of coordKeys) {
      if (key in fields) {
        sets.push(`${colMap[key]} = ?`);
        params.push(fields[key]);
      }
    }
    params.push(live.id_coordinador_empresa);
    await conn.query(`UPDATE ge_contactos SET ${sets.join(', ')} WHERE idcontacto = ?`, params);

    if ('nombreCoordinador' in fields) {
      await conn.query(
        `UPDATE dual_usuarios SET nombre_mostrar = ?
          WHERE id_contacto = ?`,
        [fields.nombreCoordinador, live.id_coordinador_empresa]
      );
    }
  }

  if ('descripcion_puesto' in fields) {
    await conn.query(
      'UPDATE dual_solicitudes_empresa SET descripcion_puesto = ? WHERE id_solicitud_empresa = ?',
      [fields.descripcion_puesto, live.id_solicitud_empresa]
    );
  }

  if ('transportes' in fields) {
    const ids = fields.transportes;
    if (ids.length) {
      const [valid] = await conn.query(
        'SELECT id_transporte FROM dual_transportes WHERE id_transporte IN (?)',
        [ids]
      );
      if (valid.length !== ids.length) {
        const err = new Error('Algún medio de transporte no es válido.');
        err.status = 400;
        throw err;
      }
    }
    await conn.query('DELETE FROM dual_empresa_transportes WHERE id_empresa = ?', [live.id_empresa]);
    for (const idT of ids) {
      await conn.query('CALL sp_asignar_transporte_empresa(?, ?)', [live.id_empresa, idT]);
    }
  }
}

function detectConflicts(snapshot, liveSnap, proposed) {
  const conflictos = [];
  for (const key of Object.keys(proposed)) {
    if (!valuesEqual(key, snapshot[key], liveSnap[key])) {
      conflictos.push({
        field: key,
        label: FIELD_DEFS[key]?.label || key,
        original: snapshot[key],
        actual: liveSnap[key],
        solicitado: proposed[key],
      });
    }
  }
  return conflictos;
}

function buildDiff(actualSnap, proposed, transportLabels = {}) {
  const rows = [];
  for (const key of Object.keys(proposed)) {
    const from = key === 'transportes'
      ? (Array.isArray(actualSnap[key]) ? actualSnap[key].map((id) => transportLabels[id] || String(id)).join(', ') || '—' : formatDisplay(key, actualSnap[key]))
      : formatDisplay(key, actualSnap[key]);
    const to = key === 'transportes'
      ? normalizeTransportes(proposed[key]).map((id) => transportLabels[id] || String(id)).join(', ') || '—'
      : formatDisplay(key, proposed[key]);
    rows.push({
      field: key,
      label: FIELD_DEFS[key]?.label || key,
      actual: from,
      solicitado: to,
    });
  }
  return rows;
}

module.exports = {
  ESTADOS_CAMBIO,
  FIELD_DEFS,
  parsePayload,
  sanitizeProposed,
  pickSnapshot,
  diffProposed,
  valuesEqual,
  validateMerged,
  loadEmpresaDatos,
  loadEmpresaDatosRead,
  applyEmpresaDatos,
  detectConflicts,
  buildDiff,
  normalizeTransportes,
};
