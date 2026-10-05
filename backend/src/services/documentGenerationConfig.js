const pool = require("../db/pool");
const empresaDatos = require("./empresaDatos");
const { anexoClaveForContrato } = require("./documentCatalogue");

function direccion(parts) {
  return parts.filter(Boolean).join(", ");
}

const GENERATION = {
  CONVENIO: {
    clave: "CONVENIO",
    context: "solicitud_empresa",
    variables: [
      "razonSocial",
      "responsableLegal",
      "dniRl",
      "dirRazSocial",
      "cif",
      "cargo",
      "specialities",
      "fechaPeticion",
      "convocatoria",
      "emailCoordinador",
    ],
    async loadData(parents) {
      const datos = await empresaDatos.loadEmpresaDatosRead(pool, parents.id_solicitud_empresa);
      if (!datos) {
        const err = new Error("No se encontró la solicitud para generar el convenio.");
        err.status = 404;
        throw err;
      }
      const [specialityRows] = await pool.query(
        `SELECT esp.codigo, esp.nombre
           FROM dual_solicitud_empresa_especialidades see
           JOIN dual_especialidades esp ON esp.id_especialidad = see.id_especialidad
          WHERE see.id_solicitud_empresa = ?
          ORDER BY esp.codigo`,
        [parents.id_solicitud_empresa],
      );
      return {
        razonSocial: datos.empresa,
        responsableLegal: datos.nombreRepresentante,
        dniRl: datos.dniRepresentante,
        dirRazSocial: direccion([
          datos.domicilioLegal,
          datos.cpLegal,
          datos.localidadLegal,
          datos.provinciaLegal,
        ]),
        cif: datos.cif,
        cargo: datos.cargoRepresentante,
        specialities: specialityRows.map((row) => row.codigo).join(", "),
        fechaPeticion: new Date().toLocaleDateString("es-ES"),
        convocatoria: datos.convocatoria,
        emailCoordinador: datos.emailCoordinador,
        empresa: datos.empresa,
      };
    },
  },
  ANEXO_II: anexoConfig("ANEXO_II"),
  ANEXO_III: anexoConfig("ANEXO_III"),
};

function anexoConfig(clave) {
  return {
    clave,
    context: "reserva",
    variables: [
      "alumno",
      "dniAlumno",
      "empresa",
      "cif",
      "especialidad",
      "codigoEspecialidad",
      "tipoContrato",
      "convocatoria",
      "tutor",
      "emailTutor",
      "telefonoTutor",
      "fecha",
    ],
    async loadData(parents) {
      const [rows] = await pool.query(
        `SELECT a.nombre AS alumno, a.dni AS dni_alumno, emp.empresa, emp.cif,
                esp.nombre AS especialidad, esp.codigo AS codigo_especialidad,
                tc.nombre AS tipo_contrato, tc.nombre_mostrar,
                c.nombre AS convocatoria,
                tutor_c.nombre AS tutor_nombre, tutor_c.email AS tutor_email, tutor_c.telefono AS tutor_telefono
           FROM dual_reservas r
           JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
           JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
           JOIN dual_solicitud_empresa_especialidades ee
             ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
           JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
           JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
           JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
           JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
           LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
           LEFT JOIN dual_empresa_tutores t ON t.id_empresa_tutor = r.id_empresa_tutor
           LEFT JOIN ge_contactos tutor_c ON tutor_c.idcontacto = t.id_contacto
          WHERE r.id_reserva = ?`,
        [parents.id_reserva],
      );
      const row = rows[0];
      if (!row) {
        const err = new Error("No se encontró la reserva para generar el anexo.");
        err.status = 404;
        throw err;
      }
      const expected = anexoClaveForContrato(row.tipo_contrato);
      if (expected !== clave) {
        const err = new Error(
          expected
            ? `Esta reserva corresponde a ${expected === "ANEXO_III" ? "Anexo III" : "Anexo II"}.`
            : "El anexo se genera cuando la reserva tiene tipo de contrato.",
        );
        err.status = 400;
        throw err;
      }
      return {
        alumno: row.alumno,
        dniAlumno: row.dni_alumno,
        empresa: row.empresa,
        cif: row.cif,
        especialidad: row.especialidad,
        codigoEspecialidad: row.codigo_especialidad,
        tipoContrato: row.nombre_mostrar || row.tipo_contrato,
        convocatoria: row.convocatoria,
        tutor: row.tutor_nombre || "",
        emailTutor: row.tutor_email || "",
        telefonoTutor: row.tutor_telefono || "",
        fecha: new Date().toLocaleDateString("es-ES"),
      };
    },
  };
}

function generationConfig(clave) {
  return GENERATION[String(clave || "").toUpperCase()] || null;
}

function generatableClaves() {
  return Object.keys(GENERATION);
}

module.exports = {
  GENERATION,
  generationConfig,
  generatableClaves,
};
