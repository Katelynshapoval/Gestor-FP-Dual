// Company applications still waiting for their convenio, and the staff action
// that generates them once an active CONVENIO template exists.
//
// "Waiting" means: application of the convocatoria, not rejected, and no
// current CONVENIO with a file (generated or uploaded). A convenio uploaded by
// hand is therefore never touched. generateDocument still applies its own
// rules (no regeneration without asking, never a validated document), so an
// application that changed in between is reported as failed, not overwritten.
const pool = require('../db/pool');
const { getActiveConvocatoria } = require('../helpers/dbHelpers');
const { generateDocument, loadActiveTemplate } = require('./documentGenerationService');
const notificar = require('./notificaciones');

async function listarPendientes(idConvocatoria) {
  const [rows] = await pool.query(
    `SELECT se.id_solicitud_empresa, emp.empresa
       FROM dual_solicitudes_empresa se
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = se.id_estado_validacion
      WHERE se.id_convocatoria = ?
        AND ev.nombre <> 'RECHAZADO'
        AND NOT EXISTS (
          SELECT 1
            FROM dual_documentos d
            JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
           WHERE d.id_solicitud_empresa = se.id_solicitud_empresa
             AND td.nombre = 'CONVENIO'
             AND d.es_actual = 1
             AND d.archivo IS NOT NULL
        )
      ORDER BY se.id_solicitud_empresa`,
    [idConvocatoria],
  );
  return rows;
}

// Status for the staff warnings (Plantillas page and panel).
async function resumen(idConvocatoria) {
  const [plantilla, pendientes] = await Promise.all([
    loadActiveTemplate('CONVENIO'),
    idConvocatoria ? listarPendientes(idConvocatoria) : [],
  ]);
  return {
    plantilla_activa: Boolean(plantilla),
    solicitudes_sin_convenio: pendientes.length,
  };
}

// One run at a time per server: each generation starts a Puppeteer browser.
let enCurso = false;

// Generates the pending convenios of the active convocatoria one by one and
// emails each company its convenio. Returns which succeeded and which failed.
async function generarPendientes(user) {
  if (enCurso) {
    return { status: 409, body: { error: 'Ya se están generando los convenios pendientes. Espera a que termine.' } };
  }
  enCurso = true;
  try {
    if (!(await loadActiveTemplate('CONVENIO'))) {
      return { status: 409, body: { error: 'No hay una plantilla activa de Convenio.', code: 'SIN_PLANTILLA' } };
    }
    const convocatoria = await getActiveConvocatoria();
    if (!convocatoria) {
      return { status: 400, body: { error: 'No hay ninguna convocatoria activa.' } };
    }

    const generados = [];
    const fallidos = [];
    for (const sol of await listarPendientes(convocatoria.id_convocatoria)) {
      const item = { id_solicitud_empresa: sol.id_solicitud_empresa, empresa: sol.empresa };
      try {
        const result = await generateDocument({
          clave: 'CONVENIO',
          parents: { id_solicitud_empresa: sol.id_solicitud_empresa },
          userId: user?.id || null,
          userRol: user?.rol || null,
          regenerar: false,
        });
        if (!result.ok) {
          // The template was removed while the run was going on.
          fallidos.push({ ...item, error: 'No hay una plantilla activa de Convenio.' });
          continue;
        }
        generados.push({ ...item, id_documento: result.id_documento });
        await notificar.convenioDisponible(sol.id_solicitud_empresa, result.pdf);
      } catch (err) {
        fallidos.push({ ...item, error: err.status ? err.message : 'No se pudo generar el convenio.' });
        if (!err.status) console.error('[convenios pendientes]', sol.id_solicitud_empresa, err.message);
      }
    }

    const message = fallidos.length
      ? `Convenios generados: ${generados.length}. Con error: ${fallidos.length}.`
      : `Convenios generados: ${generados.length}.`;
    return {
      status: 200,
      body: { message, convocatoria: convocatoria.nombre, generados, fallidos },
    };
  } finally {
    enCurso = false;
  }
}

// POST /documentos/convenios/generar-pendientes
exports.generarPendientesHandler = async function (req, res) {
  const { status, body } = await generarPendientes(req.user);
  return res.status(status).json(body);
};

exports.listarPendientes = listarPendientes;
exports.resumen = resumen;
exports.generarPendientes = generarPendientes;
