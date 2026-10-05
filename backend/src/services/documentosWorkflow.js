const pool = require("../db/pool");
const {
  staffRole,
  defByClave,
  activeDefs,
  requiredForStudentValidation,
  anexoClaveForContrato,
  appliesToContrato,
  workflowLabel,
  reviewLabel,
  SIGN_ROLES,
} = require("./documentCatalogue");

async function tipoIdByNombre(clave, conn = pool) {
  const [rows] = await conn.query(
    "SELECT id_tipo_documento FROM dual_tipos_documento WHERE nombre = ? LIMIT 1",
    [clave],
  );
  return rows[0]?.id_tipo_documento ?? null;
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

function projectItem(def, rol, ctx, row, firmas = []) {
  const actor = actorOf(rol);
  const mode = def.actor[actor] || "hidden";
  if (mode === "hidden") return null;

  const hasFile = Boolean(row?.archivo_presente || row?.id_documento && row?.tiene_archivo);
  const storedWorkflow = row?.estado_workflow || null;
  let estadoWorkflow = "NO_SUBIDO";

  if (mode === "view" || (mode === "review" && def.kind === "event")) {
    estadoWorkflow = def.kind === "event" ? "SUBIDO" : "NO_HACE_NADA";
  } else if (mode === "event" || def.kind === "event") {
    estadoWorkflow = "SUBIDO";
  } else if (mode === "sign" || def.kind === "signature") {
    const mine = firmas.find((f) => f.rol === actor);
    estadoWorkflow = mine?.estado === "FIRMADO" ? "FIRMADO" : "SIN_FIRMAR";
  } else if (!row?.id_documento || row.tiene_archivo === 0) {
    estadoWorkflow = "NO_SUBIDO";
  } else {
    estadoWorkflow = storedWorkflow || def.workflowOnUpload || "SUBIDO";
  }

  const review = def.requiresReview && row?.id_documento ? row.estado_validacion || "PENDIENTE" : null;
  const validated = review === "VALIDADO";
  const rejected = review === "RECHAZADO";
  const ownsUpload = canUpload(def, rol);
  const puedeSubir = ownsUpload && !row?.id_documento && def.kind !== "event";
  const puedeReemplazar =
    ownsUpload &&
    Boolean(row?.id_documento) &&
    def.kind !== "event" &&
    (def.replaceIfValidated || !validated);

  const firmaList = (def.signers || []).map((signRol) => {
    const found = firmas.find((f) => f.rol === signRol);
    return {
      rol: signRol,
      estado: found?.estado || "SIN_FIRMAR",
      estado_label: workflowLabel(found?.estado || "SIN_FIRMAR"),
    };
  });

  return {
    clave: def.clave,
    nombre: def.nombre,
    ambito: def.ambito,
    id_documento: row?.id_documento || null,
    estado_workflow: estadoWorkflow,
    estado_workflow_label: workflowLabel(estadoWorkflow),
    estado_validacion: review,
    estado_validacion_label: reviewLabel(review),
    motivo: rejected ? row?.motivo || null : null,
    puede_ver: Boolean(row?.id_documento && row?.tiene_archivo),
    puede_subir: puedeSubir || (ownsUpload && estadoWorkflow === "NO_SUBIDO"),
    puede_reemplazar: puedeReemplazar,
    puede_revisar: actor === "GESTOR" && def.requiresReview && Boolean(row?.id_documento),
    puede_firmar: mode === "sign",
    firmas: firmaList,
    requerido_para_validar: Boolean(def.requeridoParaValidarAlumno),
    id_solicitud_alumno: ctx.id_solicitud_alumno || null,
    id_solicitud_empresa: ctx.id_solicitud_empresa || null,
    id_reserva: ctx.id_reserva || null,
    convocatoria: ctx.convocatoria || null,
    alumno: ctx.alumno || null,
    empresa: ctx.empresa || null,
    especialidad: ctx.especialidad || null,
    tipo_contrato: ctx.tipo_contrato || null,
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
            d.motivo, d.estado_workflow,
            td.nombre AS clave,
            ev.nombre AS estado_validacion,
            CASE WHEN d.archivo IS NULL THEN 0 ELSE 1 END AS tiene_archivo
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
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

async function itemsForSolicitudAlumno(rol, solicitud, docMap, firmaMap) {
  const items = [];
  for (const def of activeDefs().filter((d) => d.ambito === "solicitud_alumno")) {
    const row = def.kind === "event" ? { id_documento: null, tiene_archivo: 0 } : pick(docMap, `A:${solicitud.id_solicitud_alumno}`, def.clave);
    const item = projectItem(
      def,
      rol,
      {
        id_solicitud_alumno: solicitud.id_solicitud_alumno,
        convocatoria: solicitud.convocatoria,
        alumno: solicitud.nombre || solicitud.alumno,
      },
      def.kind === "event" ? { id_documento: null, tiene_archivo: 0, estado_workflow: "SUBIDO" } : row,
      row ? firmaMap[row.id_documento] || [] : [],
    );
    if (item) items.push(item);
  }
  return items;
}

async function buildAlumnoList(idAlumno) {
  const [sols] = await pool.query(
    `SELECT sa.id_solicitud_alumno, c.nombre AS convocatoria, a.nombre
       FROM dual_solicitudes_alumno sa
       JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
      WHERE sa.id_alumno = ?
      ORDER BY c.activa DESC, sa.fecha_solicitud DESC
      LIMIT 1`,
    [idAlumno],
  );
  const solicitud = sols[0];
  if (!solicitud) return [];

  const [reservas] = await pool.query(
    `SELECT r.id_reserva, er.nombre AS estado_reserva, tc.nombre AS tipo_contrato,
            emp.empresa, se.id_solicitud_empresa, c.nombre AS convocatoria, esp.nombre AS especialidad
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

  const items = await itemsForSolicitudAlumno("ALUMNO", solicitud, docMap, firmaMap);

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
        },
        row,
        row ? firmaMap[row.id_documento] || [] : [],
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
          empresa: reserva.empresa,
          especialidad: reserva.especialidad,
          tipo_contrato: reserva.tipo_contrato,
          convocatoria: reserva.convocatoria,
        },
        row,
        row ? firmaMap[row.id_documento] || [] : [],
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
        empresa: reserva.empresa,
        especialidad: reserva.especialidad,
        convocatoria: reserva.convocatoria,
      },
      calRow,
      calRow ? firmaMap[calRow.id_documento] || [] : [],
    );
    if (calItem) items.push(calItem);
  }

  return items;
}

async function buildEmpresaList(idEmpresa) {
  const [solicitudes] = await pool.query(
    `SELECT se.id_solicitud_empresa, c.nombre AS convocatoria, c.activa AS convocatoria_activa, emp.empresa
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
            a.nombre AS alumno, esp.nombre AS especialidad, se.id_solicitud_empresa, c.nombre AS convocatoria
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
       JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
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
        },
        row,
        row ? firmaMap[row.id_documento] || [] : [],
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
          especialidad: reserva.especialidad,
          tipo_contrato: reserva.tipo_contrato,
          convocatoria: reserva.convocatoria,
          id_solicitud_empresa: reserva.id_solicitud_empresa,
        },
        row,
        row ? firmaMap[row.id_documento] || [] : [],
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
        especialidad: reserva.especialidad,
        convocatoria: reserva.convocatoria,
      },
      row,
      row ? firmaMap[row.id_documento] || [] : [],
    );
    if (item) items.push(item);
  }

  return items;
}

async function attachSolicitudDocumentos(rows, rol) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id_solicitud_alumno);
  const docMap = await latestDocs("d.id_solicitud_alumno IN (?)", [ids]);
  const firmaMap = await loadFirmas(Object.values(docMap).map((d) => d.id_documento));
  return Promise.all(
    rows.map(async (row) => {
      const documentos = await itemsForSolicitudAlumno(rol, row, docMap, firmaMap);
      const required = documentos.filter((d) => d.requerido_para_validar);
      const puedeValidar =
        row.estado_validacion === "PENDIENTE" &&
        required.length > 0 &&
        required.every((d) => d.estado_validacion === "VALIDADO");
      return { ...row, documentos, puede_validar_solicitud: puedeValidar };
    }),
  );
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
  attachSolicitudDocumentos,
  missingStudentValidation,
  alumnoMaySee,
  actorOf,
  SIGN_ROLES,
  appliesToContrato,
};
