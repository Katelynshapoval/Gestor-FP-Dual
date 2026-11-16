// Pieces shared by the company application services (solicitudesEmpresaService,
// solicitudEmpresaCambiosService, solicitudEmpresaOfertasService): the places
// limit, who may enlarge an application, access to one application, and the
// convenio generation that follows applying or changing ciclos.
const pool = require("../db/pool");
const empresaDatos = require("./empresaDatos");
const { generateDocument } = require("./documentGenerationService");
const notificar = require("./notificaciones");
const {
  getCompanyIdFromUser,
} = require("../helpers/dbHelpers");

// SEC-002: upper bound for the places a company can offer for one ciclo.
const MAX_PLAZAS_POR_CICLO = Number(process.env.MAX_PLAZAS_POR_CICLO) || 20;
const PLAZAS_EXCEDIDAS = `Como máximo se pueden ofrecer ${MAX_PLAZAS_POR_CICLO} plazas por ciclo.`;

// SEC-002: once the centre has validated a company's application, the company
// cannot add ciclos or raise places by itself (that would give it access to
// students the centre never offered). Staff can still do it on its behalf.
const AMPLIACION_REQUIERE_CENTRO =
  "La solicitud ya está validada. Para añadir ciclos o ampliar plazas, contacta con el centro.";
function empresaNoPuedeAmpliar(req, datos) {
  return req.user.rol === "EMPRESA" && datos.estado_validacion === "VALIDADO";
}

async function resolveSolicitudForUser(req, idSolicitud) {
  const datos = await empresaDatos.loadEmpresaDatosRead(pool, idSolicitud);

  if (!datos) {
    return {
      error: {
        status: 404,
        message: "Solicitud no encontrada.",
      },
    };
  }

  if (req.user.rol === "EMPRESA") {
    const idEmpresa = await getCompanyIdFromUser(req.user.id);

    if (!idEmpresa || idEmpresa !== datos.id_empresa) {
      return {
        error: {
          status: 403,
          message: "No tiene permiso para acceder a esta solicitud.",
        },
      };
    }
  }

  return { datos };
}

// Generates the convenio after an application and always sends the company its
// confirmation: with the PDF attached when an active CONVENIO template exists,
// without it otherwise (staff catch up later from the Plantillas page). Never
// throws: the application is already committed.
async function safelyGenerateAndSendConvenio(idSolicitudEmpresa, errorMessage, userId) {
  let pdf = null;
  try {
    const result = await generateDocument({
      clave: "CONVENIO",
      parents: { id_solicitud_empresa: idSolicitudEmpresa },
      userId: userId || null,
      regenerar: false,
    });
    if (result.ok) pdf = result.pdf;
    else console.warn(`${errorMessage} no hay plantilla activa de convenio. La solicitud se ha guardado.`);
  } catch (err) {
    console.error(errorMessage, err.message);
  }
  await notificar.solicitudEmpresaRecibida(idSolicitudEmpresa, pdf);
}

// Generator of a new convenio for one application (used by the renewals).
function generarConvenio(userId) {
  return (idSolicitud) => generateDocument({
    clave: "CONVENIO",
    parents: { id_solicitud_empresa: idSolicitud },
    userId: userId || null,
    regenerar: false,
  });
}

module.exports = {
  MAX_PLAZAS_POR_CICLO,
  PLAZAS_EXCEDIDAS,
  AMPLIACION_REQUIERE_CENTRO,
  empresaNoPuedeAmpliar,
  resolveSolicitudForUser,
  safelyGenerateAndSendConvenio,
  generarConvenio,
};
