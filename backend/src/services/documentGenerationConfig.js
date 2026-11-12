// What a generated document's template can fill in. Since migration 025 the
// data depends on WHERE the document belongs (ámbito), not on the document:
// every template of a company application can use the convenio's fields, every
// reservation template the Anexo II/III fields, every student-application
// template the student's fields. The centre adds document types without code.
const pool = require("../db/pool");
const empresaDatos = require("./empresaDatos");
const { anexoClaveForContrato, appliesToContrato, defByClave } = require("./documentCatalogue");

function direccion(parts) {
  return parts.filter(Boolean).join(", ");
}

// Fields per ámbito, with the label shown next to the template upload.
const VARIABLES = {
  solicitud_empresa: [
    ["razonSocial", "Razón social de la empresa"],
    ["responsableLegal", "Representante legal"],
    ["dniRl", "DNI del representante legal"],
    ["dirRazSocial", "Domicilio legal"],
    ["cif", "CIF"],
    ["cargo", "Cargo del representante"],
    ["specialities", "Códigos de los ciclos solicitados"],
    ["fechaPeticion", "Fecha de generación"],
    ["convocatoria", "Convocatoria"],
    ["emailCoordinador", "Email del coordinador de la empresa"],
  ],
  reserva: [
    ["alumno", "Nombre del alumno"],
    ["dniAlumno", "DNI del alumno"],
    ["empresa", "Empresa"],
    ["cif", "CIF de la empresa"],
    ["especialidad", "Ciclo"],
    ["codigoEspecialidad", "Código del ciclo"],
    ["tipoContrato", "Tipo de contrato"],
    ["convocatoria", "Convocatoria"],
    ["tutor", "Tutor de empresa"],
    ["emailTutor", "Email del tutor"],
    ["telefonoTutor", "Teléfono del tutor"],
    ["fecha", "Fecha de generación"],
  ],
  solicitud_alumno: [
    ["alumno", "Nombre del alumno"],
    ["dniAlumno", "DNI del alumno"],
    ["emailAlumno", "Email del alumno"],
    ["telefonoAlumno", "Teléfono del alumno"],
    ["domicilioAlumno", "Domicilio del alumno"],
    ["especialidad", "Ciclo"],
    ["codigoEspecialidad", "Código del ciclo"],
    ["convocatoria", "Convocatoria"],
    ["fecha", "Fecha de generación"],
  ],
};

const variablesDe = (ambito) => (VARIABLES[ambito] || []).map(([nombre]) => nombre);

function variablesPorAmbito(ambito) {
  return (VARIABLES[ambito] || []).map(([nombre, etiqueta]) => ({ nombre, etiqueta, marcador: `<<${nombre}>>` }));
}

function noEncontrado(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

async function datosEmpresa(parents) {
  const datos = await empresaDatos.loadEmpresaDatosRead(pool, parents.id_solicitud_empresa);
  if (!datos) throw noEncontrado("No se encontró la solicitud para generar el documento.");
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
    dirRazSocial: direccion([datos.domicilioLegal, datos.cpLegal, datos.localidadLegal, datos.provinciaLegal]),
    cif: datos.cif,
    cargo: datos.cargoRepresentante,
    specialities: specialityRows.map((row) => row.codigo).join(", "),
    fechaPeticion: new Date().toLocaleDateString("es-ES"),
    convocatoria: datos.convocatoria,
    emailCoordinador: datos.emailCoordinador,
    empresa: datos.empresa,
  };
}

// Reservation data plus the stored contract type name (to check the family).
async function datosReserva(parents) {
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
  if (!row) throw noEncontrado("No se encontró la reserva para generar el documento.");
  return {
    tipoContratoClave: row.tipo_contrato,
    data: {
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
    },
  };
}

async function datosAlumno(parents) {
  const [rows] = await pool.query(
    `SELECT a.nombre, a.dni, a.email, a.telalumno, a.domicilio, a.cp, a.localidad,
            esp.nombre AS especialidad, esp.codigo AS codigo_especialidad, c.nombre AS convocatoria
       FROM dual_solicitudes_alumno sa
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
       LEFT JOIN dual_especialidades esp ON esp.id_especialidad = sa.id_especialidad
      WHERE sa.id_solicitud_alumno = ?`,
    [parents.id_solicitud_alumno],
  );
  const row = rows[0];
  if (!row) throw noEncontrado("No se encontró la solicitud del alumno para generar el documento.");
  return {
    alumno: row.nombre,
    dniAlumno: row.dni,
    emailAlumno: row.email || "",
    telefonoAlumno: row.telalumno || "",
    domicilioAlumno: direccion([row.domicilio, row.cp, row.localidad]),
    especialidad: row.especialidad || "",
    codigoEspecialidad: row.codigo_especialidad || "",
    convocatoria: row.convocatoria,
    fecha: new Date().toLocaleDateString("es-ES"),
  };
}

function familiaIncorrecta(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// Generation settings of one type: the data of its ámbito; for a reservation
// type limited to a contract family, the reservation must have that family.
function configFor(def) {
  if (!def?.generated) return null;
  const variables = variablesDe(def.ambito);
  if (def.ambito === "solicitud_empresa") {
    return { clave: def.clave, context: def.ambito, variables, loadData: datosEmpresa };
  }
  if (def.ambito === "solicitud_alumno") {
    return { clave: def.clave, context: def.ambito, variables, loadData: datosAlumno };
  }
  if (def.ambito === "reserva") {
    return {
      clave: def.clave,
      context: def.ambito,
      variables,
      async loadData(parents) {
        const { tipoContratoClave, data } = await datosReserva(parents);
        if (def.clave === "ANEXO_II" || def.clave === "ANEXO_III") {
          const expected = anexoClaveForContrato(tipoContratoClave);
          if (expected !== def.clave) {
            throw familiaIncorrecta(
              expected
                ? `Esta reserva corresponde a ${expected === "ANEXO_III" ? "Anexo III" : "Anexo II"}.`
                : "El anexo se genera cuando la reserva tiene tipo de contrato.",
            );
          }
        } else if (def.contractFamily && !appliesToContrato(def, tipoContratoClave)) {
          throw familiaIncorrecta(
            tipoContratoClave
              ? `${def.nombre} solo corresponde a reservas de ${def.contractFamily}.`
              : `${def.nombre} se genera cuando la reserva tiene tipo de contrato.`,
          );
        }
        return data;
      },
    };
  }
  return null;
}

// The three system types generated from templates, kept by name for callers and tests.
const GENERATION = {
  CONVENIO: configFor(defByClave("CONVENIO")),
  ANEXO_II: configFor(defByClave("ANEXO_II")),
  ANEXO_III: configFor(defByClave("ANEXO_III")),
};

function generationConfig(clave) {
  const key = String(clave || "").toUpperCase();
  return GENERATION[key] || configFor(defByClave(key));
}

function generatableClaves() {
  return Object.keys(GENERATION);
}

module.exports = {
  GENERATION,
  VARIABLES,
  variablesPorAmbito,
  generationConfig,
  generatableClaves,
};
