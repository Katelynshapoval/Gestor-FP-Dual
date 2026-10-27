// Staff dashboard counters (Phase 4). Every number is computed here from the
// same rules the lists use, scoped to one convocatoria (the active one by
// default), so the browser never downloads whole lists just to count them.
const pool = require('../db/pool');
const { reservaDocSummary, queryStaffPage } = require('./documentosWorkflow');

async function convocatoriasConActiva() {
  const [rows] = await pool.query(
    `SELECT id_convocatoria, nombre, activa, fecha_inicio, fecha_fin
       FROM dual_convocatorias
      ORDER BY fecha_inicio DESC, id_convocatoria DESC`
  );
  return rows;
}

function elegir(convocatorias, pedida) {
  const id = Number.parseInt(pedida, 10);
  if (Number.isFinite(id)) return convocatorias.find((c) => c.id_convocatoria === id) || null;
  return convocatorias.find((c) => Number(c.activa) === 1) || convocatorias[0] || null;
}

async function contarSolicitudes(tabla, idConvocatoria) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
       FROM ${tabla} s
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = s.id_estado_validacion
      WHERE s.id_convocatoria = ? AND ev.nombre = 'PENDIENTE'`,
    [idConvocatoria]
  );
  return Number(rows[0].n);
}

async function contarCambiosEmpresa(idConvocatoria) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
       FROM dual_empresa_cambios ec
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ec.id_solicitud_empresa
      WHERE ec.estado = 'PENDIENTE' AND se.id_convocatoria = ?`,
    [idConvocatoria]
  );
  return Number(rows[0].n);
}

// Pending reservations grouped exactly like the Reservas page (ReservasAdmin.grupoDe).
async function contarReservas(idConvocatoria) {
  const [rows] = await pool.query(
    `SELECT r.id_reserva, tc.nombre AS tipo_contrato_clave
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
      WHERE er.nombre = 'PENDIENTE' AND se.id_convocatoria = ?`,
    [idConvocatoria]
  );
  const out = { pendientes: rows.length, sinTipo: 0, revisar: 0, listas: 0, firmas: 0, documento: 0 };
  const resumen = await reservaDocSummary(rows);
  for (const r of rows) {
    const anexo = resumen[r.id_reserva]?.anexo;
    if (!anexo) out.sinTipo += 1;
    else if (anexo.estado_operativo === 'VALIDADO') out.listas += 1;
    else if (anexo.estado_operativo === 'PENDIENTE_VALIDACION') out.revisar += 1;
    else if (anexo.estado_operativo === 'PENDIENTE_FIRMA') out.firmas += 1;
    else out.documento += 1;
  }
  return out;
}

async function contarDocumentosCentro(idConvocatoria) {
  const page = await queryStaffPage({ convocatoria: String(idConvocatoria), accionPendiente: 'CENTRO', pageSize: 10 });
  return page.pagination.totalItems;
}

// GET /panel/resumen?convocatoria=<id>
exports.resumen = async function (req, res) {
  const convocatorias = await convocatoriasConActiva();
  const convocatoria = elegir(convocatorias, req.query.convocatoria);
  const opciones = convocatorias.map((c) => ({
    id_convocatoria: c.id_convocatoria,
    nombre: c.nombre,
    activa: Number(c.activa) === 1,
  }));
  if (!convocatoria) {
    return res.json({ convocatoria: null, convocatorias: opciones, contadores: null });
  }
  const id = convocatoria.id_convocatoria;
  const [alumnos, empresas, cambios, reservas, documentos] = await Promise.all([
    contarSolicitudes('dual_solicitudes_alumno', id),
    contarSolicitudes('dual_solicitudes_empresa', id),
    contarCambiosEmpresa(id),
    contarReservas(id),
    contarDocumentosCentro(id),
  ]);
  return res.json({
    convocatoria: {
      id_convocatoria: id,
      nombre: convocatoria.nombre,
      activa: Number(convocatoria.activa) === 1,
      fecha_inicio: convocatoria.fecha_inicio,
      fecha_fin: convocatoria.fecha_fin,
    },
    convocatorias: opciones,
    contadores: {
      solicitudes_alumno_pendientes: alumnos,
      solicitudes_empresa_pendientes: empresas,
      cambios_empresa_pendientes: cambios,
      documentos_accion_centro: documentos,
      reservas: reservas,
    },
  });
};
