const pool = require("../db/pool");
const { buildStaffPage } = require("./documentStaffQuery");
const {
  staffRole,
  defByClave,
  activeDefs,
  requiredForStudentValidation,
  anexoClaveForContrato,
  workflowLabel,
  reviewLabel,
  deriveDocumentState,
  hasFile,
  mapActor,
  actorLabel,
  CONTEXTO_LABEL,
  SIGN_ROLES,
} = require("./documentCatalogue");

async function tipoIdByNombre(clave, conn = pool) {
  const [rows] = await conn.query(
    "SELECT id_tipo_documento FROM dual_tipos_documento WHERE nombre = ? LIMIT 1",
    [clave],
  );
  return rows[0]?.id_tipo_documento ?? null;
}

async function activeTemplateClaves() {
  const [rows] = await pool.query(
    `SELECT td.nombre AS clave
       FROM dual_documento_plantillas p
       JOIN dual_tipos_documento td ON td.id_tipo_documento = p.id_tipo_documento
      WHERE p.es_activa = 1`,
  );
  return new Set(rows.map((row) => row.clave));
}

function actorOf(rol) {
  return staffRole(rol);
}

function canUpload(def, rol) {
  const mode = def.actor[actorOf(rol)];
  if (mode === "upload") return true;
  if (def.uploadRoles && def.uploadRoles.includes(rol)) return true;
  if (mode === "sign" && def.uploadRoles && def.uploadRoles.includes(rol)) return true;
  return false;
}

function projectItem(def, rol, ctx, row, firmas = [], options = {}) {
  const actor = actorOf(rol);
  const mode = def.actor[actor] || "hidden";
  if (mode === "hidden" || def.legacy) return null;

  const templateAvailable = options.templateAvailable ?? options.templates?.has?.(def.clave) ?? false;
  const derived = deriveDocumentState(def, row, firmas, { templateAvailable });
  const file = hasFile(row);
  const validated = derived.estado_validacion === "VALIDADO";
  const ownsUpload = canUpload(def, rol);
  const isStaff = actor === "GESTOR";
  const viewer = mapActor(actor);
  const signRole = actor;
  const ownSignature = derived.firmas.find((f) => f.rol === signRole);

  const puedeSubir = ownsUpload && !file;
  const puedeReemplazar = ownsUpload && file && (def.replaceIfValidated || !validated);
  const puedeRevisar = isStaff && derived.estado_operativo === "PENDIENTE_VALIDACION" && Boolean(row?.id_documento);
  const puedeFirmar = Boolean(file && ownSignature && ownSignature.estado !== "FIRMADO" && def.signers?.includes(signRole));
  const puedeGenerar = isStaff && def.generated && !file && templateAvailable;
  const puedeRegenerar = isStaff && def.generated && file && (def.replaceIfValidated || !validated);

  const origen = row?.origen_documento || null;
  const origenConocido = origen === "SUBIDA" || origen === "GENERADO";

  return {
    clave: def.clave,
    nombre: def.nombre,
    ambito: def.ambito,
    contexto: def.ambito,
    contexto_label: CONTEXTO_LABEL[def.ambito] || def.ambito,
    generado: Boolean(def.generated),
    id_documento: row?.id_documento || null,
    estado_workflow: file ? row?.estado_workflow || def.workflowOnUpload || "SUBIDO" : "NO_SUBIDO",
    estado_workflow_label: derived.estado_operativo_label,
    estado_operativo: derived.estado_operativo,
    estado_operativo_label: derived.estado_operativo_label,
    estado_validacion: derived.estado_validacion,
    estado_validacion_label: reviewLabel(derived.estado_validacion),
    motivo: derived.estado_operativo === "RECHAZADO" ? row?.motivo || null : null,
    accion_pendiente: derived.accion_pendiente,
    accion_pendiente_de: derived.accion_pendiente_de,
    requiere_accion_actual: derived.accion_pendiente_de.includes(viewer),
    falta_plantilla: derived.falta_plantilla,
    responsable: derived.responsable,
    responsable_label: derived.responsable_label,
    puede_ver: Boolean(row?.id_documento && file),
    puede_subir: puedeSubir,
    puede_reemplazar: puedeReemplazar,
    puede_revisar: puedeRevisar,
    puede_firmar: puedeFirmar,
    puede_generar: puedeGenerar,
    puede_regenerar: puedeRegenerar,
    firmas: derived.firmas,
    origen_documento: origenConocido ? origen : "LEGACY",
    origen_label: origen === "GENERADO" ? "Generado" : origen === "SUBIDA" ? "Subida" : "No registrado",
    id_usuario_origen: row?.id_usuario_origen || null,
    origen_nombre: row?.origen_nombre || null,
    origen_rol: row?.origen_rol || null,
    origen_rol_label: row?.origen_rol ? actorLabel(row.origen_rol) : null,
    subido_por: row?.origen_nombre
      ? `${row.origen_nombre}${row.origen_rol ? ` (${actorLabel(row.origen_rol)})` : ""}`
      : "No registrado",
    fecha: row?.registrado_en || null,
    id_plantilla: row?.id_plantilla || null,
    plantilla_nombre: row?.plantilla_nombre || null,
    plantilla_version: row?.plantilla_version || null,
    requerido_para_validar: Boolean(def.requeridoParaValidarAlumno),
    id_solicitud_alumno: ctx.id_solicitud_alumno || null,
    id_solicitud_empresa: ctx.id_solicitud_empresa || null,
    id_reserva: ctx.id_reserva || null,
    convocatoria: ctx.convocatoria || null,
    alumno: ctx.alumno || null,
    dni: ctx.dni || null,
    empresa: ctx.empresa || null,
    cif: ctx.cif || null,
    especialidad: ctx.especialidad || null,
    tipo_contrato: ctx.tipo_contrato || null,
    id_alumno: ctx.id_alumno || null,
    id_empresa: ctx.id_empresa || null,
    id_especialidad: ctx.id_especialidad || null,
    id_convocatoria: ctx.id_convocatoria || null,
    legacy: false,
  };
}

async function loadFirmas(ids) {
  if (!ids.length) return {};
  const [rows] = await pool.query(
    `SELECT id_documento, rol, estado FROM dual_documento_firmas WHERE id_documento IN (?)`,
    [ids],
  );
  const map = {};
  for (const row of rows) {
    if (!map[row.id_documento]) map[row.id_documento] = [];
    map[row.id_documento].push(row);
  }
  return map;
}

async function latestDocs(whereSql, params) {
  const [rows] = await pool.query(
    `SELECT d.id_documento, d.id_solicitud_alumno, d.id_solicitud_empresa, d.id_reserva,
            d.motivo, d.estado_workflow, d.origen_documento, d.id_usuario_origen,
            d.id_plantilla, d.registrado_en,
            td.nombre AS clave,
            ev.nombre AS estado_validacion,
            uo.nombre_mostrar AS origen_nombre,
            ro.nombre AS origen_rol,
            pl.nombre_archivo AS plantilla_nombre,
            pl.version AS plantilla_version,
            CASE WHEN d.archivo IS NULL THEN 0 ELSE 1 END AS tiene_archivo
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
       LEFT JOIN dual_usuarios uo ON uo.id_usuario = d.id_usuario_origen
       LEFT JOIN dual_roles ro ON ro.id_rol = uo.id_rol
       LEFT JOIN dual_documento_plantillas pl ON pl.id_plantilla = d.id_plantilla
      WHERE ${whereSql}
        AND (d.es_actual = 1 OR d.es_actual IS NULL)
      ORDER BY d.id_documento DESC`,
    params,
  );
  const map = {};
  for (const row of rows) {
    const parent =
      row.id_solicitud_alumno != null
        ? `A:${row.id_solicitud_alumno}`
        : row.id_solicitud_empresa != null
          ? `E:${row.id_solicitud_empresa}`
          : `R:${row.id_reserva}`;
    const key = `${parent}:${row.clave}`;
    if (!map[key]) map[key] = row;
  }
  return map;
}

function pick(map, parent, clave) {
  return map[`${parent}:${clave}`] || null;
}

function itemsForSolicitudAlumno(rol, solicitud, docMap, firmaMap, templates) {
  const items = [];
  for (const def of activeDefs().filter((d) => d.ambito === "solicitud_alumno")) {
    const row = pick(docMap, `A:${solicitud.id_solicitud_alumno}`, def.clave);
    const item = projectItem(
      def,
      rol,
      {
        id_solicitud_alumno: solicitud.id_solicitud_alumno,
        id_alumno: solicitud.id_alumno || null,
        id_convocatoria: solicitud.id_convocatoria || null,
        id_especialidad: solicitud.id_especialidad || null,
        convocatoria: solicitud.convocatoria,
        alumno: solicitud.nombre || solicitud.alumno,
        dni: solicitud.dni || null,
        especialidad: solicitud.especialidad || null,
      },
      row,
      row ? firmaMap[row.id_documento] || [] : [],
      { templates },
    );
    if (item) items.push(item);
  }
  return items;
}

async function buildAlumnoList(idAlumno) {
  const [sols] = await pool.query(
    `SELECT sa.id_solicitud_alumno, c.nombre AS convocatoria, a.nombre, a.dni,
            esp.nombre AS especialidad
       FROM dual_solicitudes_alumno sa
       JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       LEFT JOIN dual_especialidades esp ON esp.id_especialidad = a.id_especialidad_dual
      WHERE sa.id_alumno = ?
      ORDER BY c.activa DESC, sa.fecha_solicitud DESC
      LIMIT 1`,
    [idAlumno],
  );
  const solicitud = sols[0];
  if (!solicitud) return [];

  const [reservas] = await pool.query(
    `SELECT r.id_reserva, er.nombre AS estado_reserva, tc.nombre AS tipo_contrato,
            emp.empresa, emp.cif, se.id_solicitud_empresa, c.nombre AS convocatoria, esp.nombre AS especialidad
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
       JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
      WHERE r.id_solicitud_alumno = ?
        AND er.nombre <> 'CANCELADA'
      ORDER BY r.id_reserva DESC`,
    [solicitud.id_solicitud_alumno],
  );

  const docMap = await latestDocs(
    `(d.id_solicitud_alumno = ? OR d.id_solicitud_empresa IN (?) OR d.id_reserva IN (?))`,
    [
      solicitud.id_solicitud_alumno,
      reservas.map((r) => r.id_solicitud_empresa).concat([-1]),
      reservas.map((r) => r.id_reserva).concat([-1]),
    ],
  );
  const ids = Object.values(docMap).map((d) => d.id_documento);
  const firmaMap = await loadFirmas(ids);
  const templates = await activeTemplateClaves();
  const items = itemsForSolicitudAlumno("ALUMNO", solicitud, docMap, firmaMap, templates);

  const seenConvenio = new Set();
  for (const reserva of reservas) {
    if (!seenConvenio.has(reserva.id_solicitud_empresa)) {
      seenConvenio.add(reserva.id_solicitud_empresa);
      const def = defByClave("CONVENIO");
      const row = pick(docMap, `E:${reserva.id_solicitud_empresa}`, "CONVENIO");
      const item = projectItem(
        def,
        "ALUMNO",
        {
          id_solicitud_empresa: reserva.id_solicitud_empresa,
          convocatoria: reserva.convocatoria,
          empresa: reserva.empresa,
          cif: reserva.cif,
          alumno: solicitud.nombre,
          dni: solicitud.dni,
        },
        row,
        row ? firmaMap[row.id_documento] || [] : [],
        { templates },
      );
      if (item) items.push(item);
    }

    const anexoClave = anexoClaveForContrato(reserva.tipo_contrato);
    if (anexoClave) {
      const def = defByClave(anexoClave);
      const row = pick(docMap, `R:${reserva.id_reserva}`, anexoClave);
      const item = projectItem(
        def,
        "ALUMNO",
        {
          id_reserva: reserva.id_reserva,
          id_solicitud_alumno: solicitud.id_solicitud_alumno,
          alumno: solicitud.nombre,
          dni: solicitud.dni,
          empresa: reserva.empresa,
          cif: reserva.cif,
          especialidad: reserva.especialidad,
          tipo_contrato: reserva.tipo_contrato,
          convocatoria: reserva.convocatoria,
        },
        row,
        row ? firmaMap[row.id_documento] || [] : [],
        { templates },
      );
      if (item) items.push(item);
    }

    const cal = defByClave("CALENDARIO");
    const calRow = pick(docMap, `R:${reserva.id_reserva}`, "CALENDARIO");
    const calItem = projectItem(
      cal,
      "ALUMNO",
      {
        id_reserva: reserva.id_reserva,
        alumno: solicitud.nombre,
        dni: solicitud.dni,
        empresa: reserva.empresa,
        cif: reserva.cif,
        especialidad: reserva.especialidad,
        convocatoria: reserva.convocatoria,
      },
      calRow,
      calRow ? firmaMap[calRow.id_documento] || [] : [],
      { templates },
    );
    if (calItem) items.push(calItem);
  }

  return items;
}

async function buildEmpresaList(idEmpresa) {
  const [solicitudes] = await pool.query(
    `SELECT se.id_solicitud_empresa, c.nombre AS convocatoria, c.activa AS convocatoria_activa, emp.empresa, emp.cif
       FROM dual_solicitudes_empresa se
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
      WHERE se.id_empresa = ?
      ORDER BY c.activa DESC, se.fecha_solicitud DESC`,
    [idEmpresa],
  );
  const solIds = solicitudes.map((s) => s.id_solicitud_empresa);
  const [reservas] = await pool.query(
    `SELECT r.id_reserva, tc.nombre AS tipo_contrato, er.nombre AS estado_reserva,
            a.nombre AS alumno, a.dni, esp.nombre AS especialidad, se.id_solicitud_empresa,
            c.nombre AS convocatoria, emp.empresa, emp.cif
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
       JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
       JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
      WHERE se.id_empresa = ?
        AND er.nombre <> 'CANCELADA'
      ORDER BY r.id_reserva DESC`,
    [idEmpresa],
  );

  const docMap = await latestDocs(
    `(d.id_solicitud_empresa IN (?) OR d.id_reserva IN (?))`,
    [solIds.concat([-1]), reservas.map((r) => r.id_reserva).concat([-1])],
  );
  const firmaMap = await loadFirmas(Object.values(docMap).map((d) => d.id_documento));
  const templates = await activeTemplateClaves();
  const items = [];

  for (const se of solicitudes) {
    for (const clave of ["CONVENIO", "ANEXO_XIV"]) {
      const def = defByClave(clave);
      const row = pick(docMap, `E:${se.id_solicitud_empresa}`, clave);
      const item = projectItem(
        def,
        "EMPRESA",
        {
          id_solicitud_empresa: se.id_solicitud_empresa,
          convocatoria: se.convocatoria,
          empresa: se.empresa,
          cif: se.cif,
        },
        row,
        row ? firmaMap[row.id_documento] || [] : [],
        { templates },
      );
      if (item) items.push(item);
    }
  }

  for (const reserva of reservas) {
    const anexoClave = anexoClaveForContrato(reserva.tipo_contrato);
    if (anexoClave) {
      const def = defByClave(anexoClave);
      const row = pick(docMap, `R:${reserva.id_reserva}`, anexoClave);
      const item = projectItem(
        def,
        "EMPRESA",
        {
          id_reserva: reserva.id_reserva,
          alumno: reserva.alumno,
          dni: reserva.dni,
          empresa: reserva.empresa,
          cif: reserva.cif,
          especialidad: reserva.especialidad,
          tipo_contrato: reserva.tipo_contrato,
          convocatoria: reserva.convocatoria,
          id_solicitud_empresa: reserva.id_solicitud_empresa,
        },
        row,
        row ? firmaMap[row.id_documento] || [] : [],
        { templates },
      );
      if (item) items.push(item);
    }
    const cal = defByClave("CALENDARIO");
    const row = pick(docMap, `R:${reserva.id_reserva}`, "CALENDARIO");
    const item = projectItem(
      cal,
      "EMPRESA",
      {
        id_reserva: reserva.id_reserva,
        alumno: reserva.alumno,
        dni: reserva.dni,
        empresa: reserva.empresa,
        cif: reserva.cif,
        especialidad: reserva.especialidad,
        convocatoria: reserva.convocatoria,
      },
      row,
      row ? firmaMap[row.id_documento] || [] : [],
      { templates },
    );
    if (item) items.push(item);
  }

  return items;
}

async function buildStaffList() {
  const [alumnos] = await pool.query(
    `SELECT sa.id_solicitud_alumno, sa.id_alumno, sa.id_convocatoria, c.nombre AS convocatoria,
            a.nombre AS alumno, a.dni, a.id_especialidad_dual AS id_especialidad,
            esp.nombre AS especialidad
       FROM dual_solicitudes_alumno sa
       JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       LEFT JOIN dual_especialidades esp ON esp.id_especialidad = a.id_especialidad_dual
      ORDER BY a.nombre, sa.id_solicitud_alumno DESC`,
  );
  const [empresas] = await pool.query(
    `SELECT se.id_solicitud_empresa, se.id_empresa, se.id_convocatoria, c.nombre AS convocatoria,
            emp.empresa, emp.cif
       FROM dual_solicitudes_empresa se
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
      ORDER BY emp.empresa, se.id_solicitud_empresa DESC`,
  );
  const [reservas] = await pool.query(
    `SELECT r.id_reserva, tc.nombre AS tipo_contrato, a.nombre AS alumno, a.dni, sa.id_alumno,
            emp.empresa, emp.cif, se.id_empresa, esp.nombre AS especialidad, ee.id_especialidad,
            se.id_solicitud_empresa, sa.id_solicitud_alumno, se.id_convocatoria, c.nombre AS convocatoria
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
       JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
       JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
      WHERE er.nombre <> 'CANCELADA'
      ORDER BY r.id_reserva DESC`,
  );

  const docMap = await latestDocs(
    `(d.id_solicitud_alumno IN (?) OR d.id_solicitud_empresa IN (?) OR d.id_reserva IN (?))`,
    [
      alumnos.map((a) => a.id_solicitud_alumno).concat([-1]),
      empresas.map((e) => e.id_solicitud_empresa).concat([-1]),
      reservas.map((r) => r.id_reserva).concat([-1]),
    ],
  );
  const firmaMap = await loadFirmas(Object.values(docMap).map((d) => d.id_documento));
  const templates = await activeTemplateClaves();
  const items = [];

  for (const sa of alumnos) {
    items.push(...itemsForSolicitudAlumno("ADMINISTRADOR", sa, docMap, firmaMap, templates));
  }

  for (const se of empresas) {
    for (const clave of ["CONVENIO", "ANEXO_XIV", "ANEXO_G", "EXCEL"]) {
      const def = defByClave(clave);
      const row = pick(docMap, `E:${se.id_solicitud_empresa}`, clave);
      const item = projectItem(
        def,
        "ADMINISTRADOR",
        {
          id_solicitud_empresa: se.id_solicitud_empresa,
          id_empresa: se.id_empresa,
          id_convocatoria: se.id_convocatoria,
          convocatoria: se.convocatoria,
          empresa: se.empresa,
          cif: se.cif,
        },
        row,
        row ? firmaMap[row.id_documento] || [] : [],
        { templates },
      );
      if (item) items.push(item);
    }
  }

  for (const reserva of reservas) {
    const anexoClave = anexoClaveForContrato(reserva.tipo_contrato);
    if (anexoClave) {
      const def = defByClave(anexoClave);
      const row = pick(docMap, `R:${reserva.id_reserva}`, anexoClave);
      const item = projectItem(
        def,
        "ADMINISTRADOR",
        {
          id_reserva: reserva.id_reserva,
          id_solicitud_alumno: reserva.id_solicitud_alumno,
          id_solicitud_empresa: reserva.id_solicitud_empresa,
          id_alumno: reserva.id_alumno,
          id_empresa: reserva.id_empresa,
          id_especialidad: reserva.id_especialidad,
          id_convocatoria: reserva.id_convocatoria,
          alumno: reserva.alumno,
          dni: reserva.dni,
          empresa: reserva.empresa,
          cif: reserva.cif,
          especialidad: reserva.especialidad,
          tipo_contrato: reserva.tipo_contrato,
          convocatoria: reserva.convocatoria,
        },
        row,
        row ? firmaMap[row.id_documento] || [] : [],
        { templates },
      );
      if (item) items.push(item);
    }

    const cal = defByClave("CALENDARIO");
    const row = pick(docMap, `R:${reserva.id_reserva}`, "CALENDARIO");
    const item = projectItem(
      cal,
      "ADMINISTRADOR",
      {
        id_reserva: reserva.id_reserva,
        id_alumno: reserva.id_alumno,
        id_empresa: reserva.id_empresa,
        id_especialidad: reserva.id_especialidad,
        id_convocatoria: reserva.id_convocatoria,
        alumno: reserva.alumno,
        dni: reserva.dni,
        empresa: reserva.empresa,
        cif: reserva.cif,
        especialidad: reserva.especialidad,
        convocatoria: reserva.convocatoria,
      },
      row,
      row ? firmaMap[row.id_documento] || [] : [],
      { templates },
    );
    if (item) items.push(item);
  }

  return items;
}

async function queryStaffPage(rawQuery) {
  const items = await buildStaffList();
  return buildStaffPage(items, rawQuery);
}

async function attachSolicitudDocumentos(rows, rol) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id_solicitud_alumno);
  const docMap = await latestDocs("d.id_solicitud_alumno IN (?)", [ids]);
  const firmaMap = await loadFirmas(Object.values(docMap).map((d) => d.id_documento));
  const templates = await activeTemplateClaves();
  return rows.map((row) => {
    const documentos = itemsForSolicitudAlumno(rol, row, docMap, firmaMap, templates);
    const required = documentos.filter((d) => d.requerido_para_validar);
    const puedeValidar =
      row.estado_validacion === "PENDIENTE" &&
      required.length > 0 &&
      required.every((d) => d.estado_validacion === "VALIDADO");
    return { ...row, documentos, puede_validar_solicitud: puedeValidar };
  });
}

async function missingStudentValidation(idSolicitud) {
  const required = requiredForStudentValidation();
  const docMap = await latestDocs("d.id_solicitud_alumno = ?", [idSolicitud]);
  const pending = [];
  for (const def of required) {
    const row = pick(docMap, `A:${idSolicitud}`, def.clave);
    if (!row || row.estado_validacion !== "VALIDADO") pending.push(def.nombre);
  }
  return pending;
}

function alumnoMaySee(def, doc) {
  if (!def || def.legacy) return false;
  if (def.actor.ALUMNO === "hidden") return false;
  return Boolean(doc?.id_solicitud_alumno || doc?.id_reserva || doc?.id_solicitud_empresa);
}

module.exports = {
  tipoIdByNombre,
  canUpload,
  projectItem,
  buildAlumnoList,
  buildEmpresaList,
  buildStaffList,
  queryStaffPage,
  attachSolicitudDocumentos,
  missingStudentValidation,
  alumnoMaySee,
  actorOf,
  activeTemplateClaves,
  SIGN_ROLES,
  workflowLabel,
};
