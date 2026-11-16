// Company applications: public sign-up, lists, staff decisions (validate,
// reject, reopen), reapplying in a new convocatoria and replacing the
// convenio. Data-change requests live in solicitudEmpresaCambiosService and
// ciclos/places in solicitudEmpresaOfertasService.
const bcrypt = require("bcrypt");
const pool = require("../db/pool");
const empresaDatos = require("./empresaDatos");
const { aplicarTransicion } = require("./solicitudTransiciones");
const { missingCompanyValidation } = require("./documentosWorkflow");
const conveniosEmpresa = require("./conveniosEmpresa");
const notificar = require("./notificaciones");
const { revisarTextos } = require("../helpers/formInput");
const {
  getActiveConvocatoria,
  sendSqlError,
  normalizeCif,
  cifValido,
  dniNieValido,
  getCompanyIdFromUser,
} = require("../helpers/dbHelpers");
const {
  MAX_PLAZAS_POR_CICLO,
  PLAZAS_EXCEDIDAS,
  resolveSolicitudForUser,
  safelyGenerateAndSendConvenio,
  generarConvenio,
} = require("./solicitudEmpresaComun");

// Public company sign-up: text fields and their column sizes (000_baseline.sql).
const TEXTOS_ALTA_EMPRESA = {
  cif: { label: "CIF", max: 12 },
  empresa: { label: "Razón social", max: 100 },
  web: { label: "Web", max: 100 },
  observaciones: { label: "Observaciones", max: 2000 },
  emailEmpresa: { label: "Email empresa", max: 100, email: true },
  telefonoEmpresa: { label: "Teléfono empresa", max: 20 },
  domicilioLegal: { label: "Domicilio fiscal", max: 255 },
  cpLegal: { label: "Código postal fiscal", max: 10 },
  provinciaLegal: { label: "Provincia fiscal", max: 50 },
  localidadLegal: { label: "Localidad fiscal", max: 100 },
  municipioLegal: { label: "Municipio fiscal", max: 45 },
  telefonoLegal: { label: "Teléfono fiscal", max: 50 },
  emailLegal: { label: "Email fiscal", max: 100, email: true },
  domicilioTrabajo: { label: "Domicilio de trabajo", max: 255 },
  cpTrabajo: { label: "Código postal de trabajo", max: 10 },
  provinciaTrabajo: { label: "Provincia de trabajo", max: 50 },
  localidadTrabajo: { label: "Localidad de trabajo", max: 100 },
  municipioTrabajo: { label: "Municipio de trabajo", max: 45 },
  telefonoTrabajo: { label: "Teléfono de trabajo", max: 50 },
  emailTrabajo: { label: "Email de trabajo", max: 100, email: true },
  dniRepresentante: { label: "DNI responsable legal", max: 15 },
  nombreRepresentante: { label: "Nombre responsable legal", max: 100 },
  emailRepresentante: { label: "Email responsable legal", max: 100, email: true },
  telefonoRepresentante: { label: "Teléfono responsable legal", max: 50 },
  cargoRepresentante: { label: "Cargo responsable legal", max: 100 },
  dniCoordinador: { label: "DNI coordinador", max: 15 },
  nombreCoordinador: { label: "Nombre coordinador", max: 100 },
  emailCoordinador: { label: "Email coordinador", max: 100, email: true },
  telefonoCoordinador: { label: "Teléfono coordinador", max: 50 },
  cargoCoordinador: { label: "Cargo coordinador", max: 100 },
  descripcion_puesto: { label: "Descripción del puesto", max: 5000 },
  passwordCoordinador: { label: "Contraseña", max: 200 },
  menosdecincotrabajadores: { label: "Menos de cinco trabajadores" },
  mismoLugarTrabajo: { label: "Mismo lugar de trabajo" },
};

const EMPRESA_YA_REGISTRADA =
  "Esta empresa ya está registrada. Inicia sesión con el CIF para gestionar su participación.";


// POST /solicitudes/empresa — public: create company application
exports.create = async function (req, res) {
  const {
    // Company
    cif,
    empresa: empresaNombre,
    web = "",
    observaciones = "",
    emailEmpresa = "",
    telefonoEmpresa = "",
    menosdecincotrabajadores = 0,
    // Legal address
    domicilioLegal,
    cpLegal,
    provinciaLegal,
    localidadLegal,
    municipioLegal = "",
    telefonoLegal = "",
    emailLegal = "",
    // Work address (may be the same as the legal address)
    mismoLugarTrabajo,
    domicilioTrabajo,
    cpTrabajo,
    provinciaTrabajo,
    localidadTrabajo,
    municipioTrabajo = "",
    telefonoTrabajo = "",
    emailTrabajo = "",
    // Legal representative
    dniRepresentante,
    nombreRepresentante,
    emailRepresentante,
    telefonoRepresentante,
    cargoRepresentante = "REPRESENTANTE LEGAL",
    // Company coordinator (dual tutor)
    dniCoordinador,
    nombreCoordinador,
    emailCoordinador,
    telefonoCoordinador,
    cargoCoordinador = "COORDINADOR DUAL",
    // Application details
    descripcion_puesto,
    // Specialities: [{ idEspecialidad, cantidadAlumnos }]
    especialidades,
    // Transports: [id_transporte, ...]
    transportes = [],
    // Initial password for the coordinator user account
    passwordCoordinador,
  } = req.body;

  if (
    !cif ||
    !empresaNombre ||
    !domicilioLegal ||
    !cpLegal ||
    !provinciaLegal ||
    !localidadLegal
  ) {
    return res
      .status(400)
      .json({ error: "Faltan datos obligatorios de la empresa." });
  }

  if (
    !dniRepresentante ||
    !nombreRepresentante ||
    !emailRepresentante ||
    !telefonoRepresentante
  ) {
    return res
      .status(400)
      .json({ error: "Faltan datos del representante legal." });
  }

  if (
    !dniCoordinador ||
    !nombreCoordinador ||
    !emailCoordinador ||
    !telefonoCoordinador
  ) {
    return res
      .status(400)
      .json({ error: "Faltan datos del coordinador de empresa." });
  }

  if (!descripcion_puesto) {
    return res
      .status(400)
      .json({ error: "La descripción del puesto es obligatoria." });
  }

  if (
    !especialidades ||
    !Array.isArray(especialidades) ||
    especialidades.length === 0
  ) {
    return res.status(400).json({
      error:
        "Debe seleccionar al menos una especialidad y cantidad de alumnos.",
    });
  }

  if (!passwordCoordinador) {
    return res.status(400).json({
      error: "Se requiere contraseña para la cuenta del coordinador.",
    });
  }

  // Every text field must be text, fit its column, and emails must look like
  // emails (the convenio and notices are sent to them).
  const textoInvalido = revisarTextos(req.body, TEXTOS_ALTA_EMPRESA);
  if (textoInvalido) {
    return res.status(400).json({ error: textoInvalido, code: "DATOS_NO_VALIDOS" });
  }
  if (
    !Array.isArray(transportes) ||
    especialidades.some((e) => !e || typeof e !== "object" || Array.isArray(e))
  ) {
    return res.status(400).json({ error: "Los ciclos o los transportes no tienen un formato válido." });
  }

  // WF-12: the same checks as the form, enforced here as well.
  if (!cifValido(cif)) {
    return res.status(400).json({ error: "CIF de la empresa no válido.", code: "CIF_INVALIDO" });
  }
  if (!dniNieValido(dniRepresentante)) {
    return res.status(400).json({ error: "DNI/NIE del responsable legal no válido.", code: "DNI_INVALIDO" });
  }
  if (!dniNieValido(dniCoordinador)) {
    return res.status(400).json({ error: "DNI/NIE del coordinador principal no válido.", code: "DNI_INVALIDO" });
  }
  if (String(passwordCoordinador).length < 8) {
    return res.status(400).json({
      error: "La contraseña del coordinador debe tener al menos 8 caracteres.",
      code: "PASSWORD_CORTA",
    });
  }

  const convocatoria = await getActiveConvocatoria();

  if (!convocatoria) {
    return res.status(409).json({
      error:
        "No hay ninguna convocatoria activa. El plazo de solicitud está cerrado.",
    });
  }

  const cifNorm = normalizeCif(cif);

  if (!cifNorm) {
    return res
      .status(400)
      .json({ error: "Faltan datos obligatorios de la empresa." });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Public registration must not upsert: an existing CIF is a duplicate company.
    // CIFs are stored normalised, so `cif = ?` uses uq_ge_empresas_cif and locks one
    // row (UPPER(TRIM(cif)) scanned and locked the whole table, DB-08).
    const [empExist] = await conn.query(
      "SELECT idempresa FROM ge_empresas WHERE cif = ? FOR UPDATE",
      [cifNorm],
    );

    if (empExist[0]) {
      await conn.rollback();
      return res.status(409).json({ error: EMPRESA_YA_REGISTRADA });
    }

    const [r] = await conn.query(
      `INSERT INTO ge_empresas (
         cif,
         empresa,
         convenio,
         fechaconvenio,
         web,
         observaciones,
         emailEmpresa,
         telefonoEmpresa,
         menosdecincotrabajadores
       )
       VALUES (?, ?, '', NULL, ?, ?, ?, ?, ?)`,
      [
        cifNorm,
        empresaNombre,
        web,
        observaciones,
        emailEmpresa,
        telefonoEmpresa,
        menosdecincotrabajadores ? 1 : 0,
      ],
    );

    const idEmpresa = r.insertId;

    // Check for duplicate application in this convocatoria
    const [solExist] = await conn.query(
      `SELECT id_solicitud_empresa
         FROM dual_solicitudes_empresa
        WHERE id_empresa = ?
          AND id_convocatoria = ?`,
      [idEmpresa, convocatoria.id_convocatoria],
    );

    if (solExist[0]) {
      await conn.rollback();
      return res.status(409).json({
        error:
          "Esta empresa ya tiene una solicitud registrada para la convocatoria activa.",
      });
    }

    // 2. Legal address
    const [domLegalRes] = await conn.query(
      `INSERT INTO ge_domicilios (
         idempresa,
         domicilio,
         cp,
         provincia,
         localidad,
         telefono,
         email,
         especialidad,
         municipio
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)`,
      [
        idEmpresa,
        domicilioLegal,
        cpLegal,
        provinciaLegal,
        localidadLegal,
        telefonoLegal,
        emailLegal,
        municipioLegal,
      ],
    );

    const idDomicilioLegal = domLegalRes.insertId;

    // 3. Work address (may reuse legal)
    let idDomicilioTrabajo;

    if (mismoLugarTrabajo) {
      idDomicilioTrabajo = idDomicilioLegal;
    } else {
      if (
        !domicilioTrabajo ||
        !cpTrabajo ||
        !provinciaTrabajo ||
        !localidadTrabajo
      ) {
        await conn.rollback();

        return res
          .status(400)
          .json({ error: "Faltan datos del domicilio de trabajo." });
      }

      const [domTrabRes] = await conn.query(
        `INSERT INTO ge_domicilios (
           idempresa,
           domicilio,
           cp,
           provincia,
           localidad,
           telefono,
           email,
           especialidad,
           municipio
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)`,
        [
          idEmpresa,
          domicilioTrabajo,
          cpTrabajo,
          provinciaTrabajo,
          localidadTrabajo,
          telefonoTrabajo,
          emailTrabajo,
          municipioTrabajo,
        ],
      );

      idDomicilioTrabajo = domTrabRes.insertId;
    }

    // 4. Legal representative contact
    const [repRes] = await conn.query(
      `INSERT INTO ge_contactos (
         iddomicilio,
         dni,
         nombre,
         email,
         telefono,
         cargo,
         observaciones,
         especialidad
       )
       VALUES (?, ?, ?, ?, ?, ?, '', '')`,
      [
        idDomicilioLegal,
        dniRepresentante,
        nombreRepresentante,
        emailRepresentante,
        telefonoRepresentante,
        cargoRepresentante,
      ],
    );

    const idRepresentante = repRes.insertId;

    // 5. Company coordinator contact
    const [coordRes] = await conn.query(
      `INSERT INTO ge_contactos (
         iddomicilio,
         dni,
         nombre,
         email,
         telefono,
         cargo,
         observaciones,
         especialidad
       )
       VALUES (?, ?, ?, ?, ?, ?, '', '')`,
      [
        idDomicilioTrabajo,
        dniCoordinador,
        nombreCoordinador,
        emailCoordinador,
        telefonoCoordinador,
        cargoCoordinador,
      ],
    );

    const idCoordinador = coordRes.insertId;

    // 6. Create solicitud empresa
    const [solRes] = await conn.query(
      `INSERT INTO dual_solicitudes_empresa (
         id_empresa,
         id_convocatoria,
         id_estado_validacion,
         id_representante_legal,
         id_coordinador_empresa,
         id_domicilio_legal,
         id_domicilio_trabajo,
         descripcion_puesto
       )
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      [
        idEmpresa,
        convocatoria.id_convocatoria,
        idRepresentante,
        idCoordinador,
        idDomicilioLegal,
        idDomicilioTrabajo,
        descripcion_puesto,
      ],
    );

    const idSolicitudEmpresa = solRes.insertId;

    // 7. Speciality rows
    for (const esp of especialidades) {
      const idEsp = parseInt(esp.idEspecialidad, 10);
      const cant = parseInt(esp.cantidadAlumnos, 10);

      if (!idEsp || !cant || cant < 1) {
        await conn.rollback();

        return res.status(400).json({
          error: "Cada especialidad debe tener un id válido y cantidad > 0.",
        });
      }
      if (cant > MAX_PLAZAS_POR_CICLO) {
        await conn.rollback();
        return res.status(400).json({ error: PLAZAS_EXCEDIDAS });
      }

      await conn.query(
        `INSERT INTO dual_solicitud_empresa_especialidades (
           id_solicitud_empresa,
           id_especialidad,
           cantidad_alumnos
         )
         VALUES (?, ?, ?)`,
        [idSolicitudEmpresa, idEsp, cant],
      );
    }

    // 8. Transports (per application, D4)
    await empresaDatos.replaceTransportesSolicitud(
      conn,
      idSolicitudEmpresa,
      transportes.map((t) => parseInt(t, 10)).filter(Boolean),
    );

    // 9. Coordinator user account
    const [rolRow] = await conn.query(
      "SELECT id_rol FROM dual_roles WHERE nombre = ?",
      ["EMPRESA"],
    );

    const idRol = rolRow[0]?.id_rol;

    if (!idRol) {
      throw new Error("Rol EMPRESA no encontrado en la base de datos.");
    }

    const hash = await bcrypt.hash(passwordCoordinador, 10);

    // Login identifier is the company CIF. Coordinator email stays in ge_contactos.
    // The company chose this password itself, so no forced change at first
    // login (Phase 4 decision); passwords reset by an administrator still force one.
    await conn.query(
      `INSERT INTO dual_usuarios (
         nombre_mostrar,
         email,
         password_hash,
         id_rol,
         id_contacto,
         activo,
         must_change_password
       )
       VALUES (?, NULL, ?, ?, ?, 1, 0)`,
      [nombreCoordinador, hash, idRol, idCoordinador],
    );

    // Principal coordinator is also the company's first active tutor.
    await conn.query(
      `INSERT INTO dual_empresa_tutores (id_empresa, id_contacto, activo)
       VALUES (?, ?, 1)`,
      [idEmpresa, idCoordinador],
    );

    await conn.commit();

    await safelyGenerateAndSendConvenio(
      idSolicitudEmpresa,
      "Error al generar/enviar el convenio:",
      null,
    );

    return res.status(201).json({
      message: "Solicitud de empresa enviada correctamente.",
      id_solicitud_empresa: idSolicitudEmpresa,
    });
  } catch (err) {
    await conn.rollback();

    if (
      err.code === "ER_DUP_ENTRY" &&
      /uq_ge_empresas_cif|ge_empresas/i.test(err.message)
    ) {
      return res.status(409).json({ error: EMPRESA_YA_REGISTRADA });
    }

    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

// GET /solicitudes/empresa — admin/coordinador: list all
exports.getAll = async function (req, res) {
  const { estado, convocatoria } = req.query;

  let query = `
    SELECT
      se.id_solicitud_empresa,
      se.id_empresa,
      se.id_convocatoria,
      se.fecha_solicitud,
      se.descripcion_puesto,
      se.motivo,
      ev.nombre AS estado_validacion,
      emp.empresa,
      emp.cif,
      c.nombre AS convocatoria,
      rep.nombre AS representante_nombre,
      rep.email AS representante_email,
      coord.nombre AS coordinador_nombre,
      coord.email AS coordinador_email
    FROM dual_solicitudes_empresa se
    JOIN ge_empresas emp
      ON emp.idempresa = se.id_empresa
    JOIN dual_estados_validacion ev
      ON ev.id_estado_validacion = se.id_estado_validacion
    JOIN dual_convocatorias c
      ON c.id_convocatoria = se.id_convocatoria
    JOIN ge_contactos rep
      ON rep.idcontacto = se.id_representante_legal
    JOIN ge_contactos coord
      ON coord.idcontacto = se.id_coordinador_empresa
    WHERE 1 = 1
  `;

  const params = [];

  if (estado) {
    query += " AND ev.nombre = ?";
    params.push(estado.toUpperCase());
  }

  if (convocatoria) {
    query += " AND se.id_convocatoria = ?";
    params.push(convocatoria);
  }

  query += " ORDER BY se.fecha_solicitud DESC";

  const [rows] = await pool.query(query, params);

  return res.json(rows);
};

// GET /solicitudes/empresa/mia — EMPRESA user's own application in the active convocatoria.
// With ?incluir_anteriores=1 (company portal, WF-2) it falls back to the latest
// application of a past convocatoria and says whether the company may re-apply.
exports.getMia = async function (req, res) {
  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  const incluirAnteriores = String(req.query?.incluir_anteriores || "") === "1";

  if (!idEmpresa) {
    return res
      .status(404)
      .json({ error: "No se encontró empresa vinculada a este usuario." });
  }

  const [rows] = await pool.query(
    `SELECT
       se.id_solicitud_empresa,
       se.id_empresa,
       se.id_convocatoria,
       se.fecha_solicitud,
       se.descripcion_puesto,
       se.motivo,
       ev.nombre AS estado_validacion,
       emp.empresa,
       emp.cif,
       c.nombre AS convocatoria,
       c.activa AS convocatoria_activa
     FROM dual_solicitudes_empresa se
     JOIN ge_empresas emp
       ON emp.idempresa = se.id_empresa
     JOIN dual_estados_validacion ev
       ON ev.id_estado_validacion = se.id_estado_validacion
     JOIN dual_convocatorias c
       ON c.id_convocatoria = se.id_convocatoria
     WHERE se.id_empresa = ?
       ${incluirAnteriores ? "" : "AND c.activa = 1"}
     ORDER BY c.activa DESC, se.fecha_solicitud DESC, se.id_solicitud_empresa DESC
     LIMIT 1`,
    [idEmpresa],
  );

  if (!rows[0]) {
    return res
      .status(404)
      .json({ error: "No hay solicitud para la convocatoria activa.", code: "SIN_SOLICITUD" });
  }

  const row = { ...rows[0], convocatoria_activa: Number(rows[0].convocatoria_activa) === 1 };
  // Migration 026: the renewal of this application's convenio, if one is open,
  // and the convenio in force with the ciclos it covers (re-applying with the
  // same ciclos keeps it; other ciclos mean a new convenio to sign).
  const estado = (await conveniosEmpresa.estadoConvenios([row.id_solicitud_empresa]))[row.id_solicitud_empresa];
  row.renovacion_convenio = estado?.renovacion ?? null;
  row.tiene_convenio = Boolean(Number((await conveniosEmpresa.convenioActual(pool, row.id_solicitud_empresa))?.tiene_archivo));
  row.convenio_heredado_de = estado?.convenio_heredado_de ?? null;
  const vigente = await conveniosEmpresa.convenioVigente(pool, idEmpresa);
  row.convenio_vigente = vigente ? { convocatoria: vigente.convocatoria, ciclos: vigente.ciclos } : null;
  if (incluirAnteriores) {
    const activa = await getActiveConvocatoria();
    row.convocatoria_abierta = activa
      ? { id_convocatoria: activa.id_convocatoria, nombre: activa.nombre }
      : null;
    // Re-applying is possible only when a convocatoria is open and the
    // company has no application in it yet (the latest one is from the past).
    row.puede_reaplicar = !!activa && !row.convocatoria_activa;
  }

  return res.json(row);
};

// GET /solicitudes/empresa/:id — detail
exports.getById = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const datos = await empresaDatos.loadEmpresaDatosRead(pool, id);

  if (!datos) {
    return res.status(404).json({ error: "Solicitud no encontrada." });
  }

  if (req.user.rol === "EMPRESA") {
    const idEmpresa = await getCompanyIdFromUser(req.user.id);

    if (!idEmpresa || idEmpresa !== datos.id_empresa) {
      return res
        .status(403)
        .json({ error: "No tiene permiso para acceder a esta solicitud." });
    }
  }

  const [esps] = await pool.query(
    `SELECT
       see.id_solicitud_empresa_especialidad,
       see.id_especialidad,
       see.cantidad_alumnos,
       esp.codigo,
       esp.nombre,
       CASE esp.turno
         WHEN 0 THEN 'DIURNO'
         WHEN 1 THEN 'VESPERTINO'
       END AS turno
     FROM dual_solicitud_empresa_especialidades see
     JOIN dual_especialidades esp
       ON esp.id_especialidad = see.id_especialidad
     WHERE see.id_solicitud_empresa = ?`,
    [id],
  );

  datos.especialidades = esps;

  return res.json(datos);
};

// GET /solicitudes/empresa/:id/especialidades
exports.getEspecialidades = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { error } = await resolveSolicitudForUser(req, id);

  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  const [rows] = await pool.query(
    `SELECT
       see.id_solicitud_empresa_especialidad,
       see.id_especialidad,
       see.cantidad_alumnos,
       esp.codigo,
       esp.nombre,
       CASE esp.turno
         WHEN 0 THEN 'DIURNO'
         WHEN 1 THEN 'VESPERTINO'
       END AS turno,
       po.plazas_disponibles,
       po.plazas_ocupadas,
       po.plazas_confirmadas,
       po.plazas_pendientes
     FROM dual_solicitud_empresa_especialidades see
     JOIN vw_plazas_oferta po
       ON po.id_solicitud_empresa_especialidad = see.id_solicitud_empresa_especialidad
     JOIN dual_especialidades esp
       ON esp.id_especialidad = see.id_especialidad
     WHERE see.id_solicitud_empresa = ?`,
    [id],
  );

  return res.json(rows);
};

// POST /solicitudes/empresa/:id/validar
exports.validar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Solicitud no válida." });
  // Every required document (the convenio and the ones the centre added) first.
  const pending = await missingCompanyValidation(id);
  if (pending.length) {
    return res.status(400).json({
      error: `Para validar la empresa primero hay que validar: ${pending.join(", ")}.`,
      code: "DOCUMENTOS_PENDIENTES",
    });
  }
  try {
    const out = await aplicarTransicion("SOLICITUD_EMPRESA", id, "VALIDAR", { user: req.user });
    if (!out.ok) return res.status(out.status).json({ error: out.error, code: out.code });
    return res.json({
      message: "Solicitud de empresa validada correctamente.",
    });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// POST /solicitudes/empresa/:id/rechazar
exports.rechazar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const motivo = String(req.body?.motivo || "").trim();
  if (!id) return res.status(400).json({ error: "Solicitud no válida." });
  if (!motivo) {
    return res
      .status(400)
      .json({ error: "Debe indicar el motivo del rechazo." });
  }
  try {
    const out = await aplicarTransicion("SOLICITUD_EMPRESA", id, "RECHAZAR", { user: req.user, motivo });
    if (!out.ok) return res.status(out.status).json({ error: out.error, code: out.code });
    return res.json({
      message: "Solicitud de empresa rechazada.",
    });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// POST /solicitudes/empresa/:id/reabrir — staff, active convocatoria only (D7)
exports.reabrir = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const motivo = String(req.body?.motivo || "").trim() || null;
  if (!id) return res.status(400).json({ error: "Solicitud no válida." });
  try {
    const out = await aplicarTransicion("SOLICITUD_EMPRESA", id, "REABRIR", { user: req.user, motivo });
    if (!out.ok) return res.status(out.status).json({ error: out.error, code: out.code });
    return res.json({ message: "Solicitud reabierta: vuelve a estar pendiente de revisión." });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// GET /solicitudes/empresa/todas
exports.getTodas = async function (req, res) {
  const [rows] = await pool.query(
    `SELECT
       se.id_solicitud_empresa,
       se.id_empresa,
       se.fecha_solicitud,
       se.descripcion_puesto,
       se.motivo,
       se.transportes_conocidos,
       ev.nombre AS estado_validacion,
       emp.empresa AS razonSocial,
       emp.cif,
       emp.telefonoEmpresa AS telEmpresa,
       se.id_convocatoria,
       c.nombre AS convocatoria,
       c.activa AS convocatoria_activa,
       coord.nombre AS nombreCoordinador,
       coord.email AS emailCoordinador,
       coord.telefono AS telefonoCoordinador,
       rep.nombre AS responsableLegal,
       rep.dni AS dniRl,
       rep.cargo,
       dl.domicilio AS dirRazSocial,
       dl.provincia,
       dl.municipio,
       dl.cp AS cpRazSoc,
       dt.domicilio AS direccionLugarTrabajo,
       u.id_usuario,
       u.activo AS cuenta_activa,
       emp.cif AS username,
       (SELECT e.motivo FROM dual_eventos e
         WHERE e.entidad = 'SOLICITUD_EMPRESA' AND e.id_entidad = se.id_solicitud_empresa AND e.accion = 'BAJA'
         ORDER BY e.id_evento DESC LIMIT 1) AS motivo_baja,
       (SELECT e.creado_en FROM dual_eventos e
         WHERE e.entidad = 'SOLICITUD_EMPRESA' AND e.id_entidad = se.id_solicitud_empresa AND e.accion = 'BAJA'
         ORDER BY e.id_evento DESC LIMIT 1) AS fecha_baja
     FROM dual_solicitudes_empresa se
     JOIN ge_empresas emp
       ON emp.idempresa = se.id_empresa
     JOIN dual_estados_validacion ev
       ON ev.id_estado_validacion = se.id_estado_validacion
     JOIN dual_convocatorias c
       ON c.id_convocatoria = se.id_convocatoria
     JOIN ge_contactos coord
       ON coord.idcontacto = se.id_coordinador_empresa
     JOIN ge_contactos rep
       ON rep.idcontacto = se.id_representante_legal
     JOIN ge_domicilios dl
       ON dl.iddomicilio = se.id_domicilio_legal
     JOIN ge_domicilios dt
       ON dt.iddomicilio = se.id_domicilio_trabajo
     LEFT JOIN dual_usuarios u
       ON u.id_contacto = coord.idcontacto
     ORDER BY se.fecha_solicitud DESC`,
  );

  if (rows.length === 0) {
    return res.json([]);
  }

  // Batch-load specialities, transports, and convenio status
  const ids = rows.map((r) => r.id_solicitud_empresa);

  const [esps] = await pool.query(
    `SELECT
       see.id_solicitud_empresa,
       see.id_solicitud_empresa_especialidad,
       see.cantidad_alumnos,
       esp.id_especialidad,
       esp.codigo,
       esp.nombre,
       CASE esp.turno
         WHEN 0 THEN 'DIURNO'
         WHEN 1 THEN 'VESPERTINO'
       END AS turno
     FROM dual_solicitud_empresa_especialidades see
     JOIN dual_especialidades esp
       ON esp.id_especialidad = see.id_especialidad
     WHERE see.id_solicitud_empresa IN (?)`,
    [ids],
  );

  const [transp] = await pool.query(
    `SELECT
     det.id_solicitud_empresa,
     dt.id_transporte,
     dt.nombre,
     dt.nombre_mostrar
   FROM dual_solicitud_empresa_transportes det
   JOIN dual_transportes dt
     ON dt.id_transporte = det.id_transporte
   WHERE det.id_solicitud_empresa IN (?)`,
    [ids],
  );

  const [convenios] = await pool.query(
    `SELECT
       d.id_solicitud_empresa,
       d.id_documento,
       d.motivo,
       ev.nombre AS estado_validacion
     FROM dual_documentos d
     JOIN dual_estados_validacion ev
       ON ev.id_estado_validacion = d.id_estado_validacion
     JOIN dual_tipos_documento td
       ON td.id_tipo_documento = d.id_tipo_documento
     WHERE d.id_solicitud_empresa IN (?)
       AND td.nombre = 'CONVENIO'
       AND d.es_actual = 1
     ORDER BY d.id_documento DESC`,
    [ids],
  );

  const espMap = {};

  esps.forEach((e) => {
    if (!espMap[e.id_solicitud_empresa]) {
      espMap[e.id_solicitud_empresa] = [];
    }

    espMap[e.id_solicitud_empresa].push({
      id_solicitud_empresa_especialidad: e.id_solicitud_empresa_especialidad,
      id_especialidad: e.id_especialidad,
      nombre: e.nombre,
      codigo: e.codigo,
      turno: e.turno,
      cantidad_alumnos: e.cantidad_alumnos,
    });
  });

  const transpMap = {};

  transp.forEach((t) => {
    if (!transpMap[t.id_solicitud_empresa]) {
      transpMap[t.id_solicitud_empresa] = [];
    }

    transpMap[t.id_solicitud_empresa].push({
      id_transporte: t.id_transporte,
      nombre: t.nombre_mostrar || t.nombre,
    });
  });

  let cambiosPend = [];

  try {
    const [rowsC] = await pool.query(
      `SELECT
         id_solicitud_empresa,
         id_cambio,
         fecha_solicitud
       FROM dual_empresa_cambios
       WHERE estado = 'PENDIENTE'
         AND id_solicitud_empresa IN (?)`,
      [ids],
    );

    cambiosPend = rowsC;
  } catch (err) {
    if (err.code !== "ER_NO_SUCH_TABLE") {
      throw err;
    }
  }

  const cambioMap = {};

  cambiosPend.forEach((c) => {
    cambioMap[c.id_solicitud_empresa] = {
      id_cambio: c.id_cambio,
      fecha_solicitud: c.fecha_solicitud,
    };
  });

  const convenioMap = {};

  convenios.forEach((d) => {
    if (!convenioMap[d.id_solicitud_empresa]) {
      convenioMap[d.id_solicitud_empresa] = {
        id_documento: d.id_documento,
        estado: d.estado_validacion,
        validado: d.estado_validacion === "VALIDADO",
        motivo: d.motivo,
      };
    }
  });

  // Migration 026: open convenio renewal and inherited convenio of each application.
  const estadoConvenio = await conveniosEmpresa.estadoConvenios(ids);

  const result = rows.map((r) => {
    const conv = convenioMap[r.id_solicitud_empresa];

    return {
      ...r,
      // Aliased for frontend compatibility
      empresa: r.razonSocial,
      convocatoria_activa: Number(r.convocatoria_activa) === 1,
      idAuxEmpresa: r.id_solicitud_empresa,
      fechaPeticion: r.fecha_solicitud,
      especialidades: espMap[r.id_solicitud_empresa] || [],
      transportes: transpMap[r.id_solicitud_empresa] || [],
      transportes_conocidos: Number(r.transportes_conocidos) !== 0,
      tieneConvenio: conv ? 1 : 0,
      convenio_validado: conv?.validado ? 1 : 0,
      convenio_estado: conv?.estado ?? null,
      convenio_motivo: conv?.motivo ?? null,
      id_documento_convenio: conv?.id_documento ?? null,
      cambio_pendiente: cambioMap[r.id_solicitud_empresa] ? 1 : 0,
      id_cambio_pendiente: cambioMap[r.id_solicitud_empresa]?.id_cambio ?? null,
      fecha_cambio_pendiente:
        cambioMap[r.id_solicitud_empresa]?.fecha_solicitud ?? null,
      renovacion_convenio: estadoConvenio[r.id_solicitud_empresa]?.renovacion ?? null,
      convenio_heredado_de: estadoConvenio[r.id_solicitud_empresa]?.convenio_heredado_de ?? null,
    };
  });

  return res.json(result);
};

// POST /solicitudes/empresa/reapply
exports.reapply = async function (req, res) {
  const idEmpresa = await getCompanyIdFromUser(req.user.id);

  if (!idEmpresa) {
    return res
      .status(404)
      .json({ error: "No se encontró empresa vinculada a este usuario." });
  }

  const convocatoria = await getActiveConvocatoria();

  if (!convocatoria) {
    return res
      .status(409)
      .json({ error: "No hay ninguna convocatoria activa.", code: "SIN_CONVOCATORIA" });
  }

  const {
    nombreCoordinador,
    emailCoordinador,
    telefonoCoordinador,
    descripcion_puesto,
    especialidades,
    transportes = [],
  } = req.body;

  if (
    !especialidades ||
    !Array.isArray(especialidades) ||
    especialidades.length === 0
  ) {
    return res
      .status(400)
      .json({ error: "Debe seleccionar al menos una especialidad." });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Guard against duplicate applications in the same convocatoria
    const [solExist] = await conn.query(
      `SELECT id_solicitud_empresa
       FROM dual_solicitudes_empresa
       WHERE id_empresa = ?
         AND id_convocatoria = ?`,
      [idEmpresa, convocatoria.id_convocatoria],
    );

    if (solExist[0]) {
      await conn.rollback();

      return res.status(409).json({
        error: "Ya existe una solicitud para la convocatoria activa.",
        code: "SOLICITUD_EXISTENTE",
      });
    }

    // Reuse legal representative and addresses from the previous application
    const [empData] = await conn.query(
      `SELECT
         se.id_representante_legal,
         se.id_domicilio_legal,
         se.id_domicilio_trabajo,
         coord.idcontacto AS id_coordinador_actual,
         coord.iddomicilio AS id_domicilio_coord
       FROM dual_solicitudes_empresa se
       JOIN ge_contactos coord
         ON coord.idcontacto = se.id_coordinador_empresa
       WHERE se.id_empresa = ?
       ORDER BY se.fecha_solicitud DESC
       LIMIT 1`,
      [idEmpresa],
    );

    if (!empData[0]) {
      await conn.rollback();

      return res.status(404).json({
        error:
          "No se encontró una solicitud previa de esta empresa para copiar los datos base.",
      });
    }

    const prev = empData[0];

    // Update coordinator fields with new values when provided. WF-11: earlier
    // applications first move to a frozen copy so they keep the old values.
    const [coordActual] = await conn.query(
      "SELECT nombre, email, telefono FROM ge_contactos WHERE idcontacto = ? FOR UPDATE",
      [prev.id_coordinador_actual],
    );
    const cambiaCoordinador = [
      ["nombre", nombreCoordinador],
      ["email", emailCoordinador],
      ["telefono", telefonoCoordinador],
    ].some(([col, value]) => value && String(value) !== String(coordActual[0]?.[col] ?? ""));
    if (cambiaCoordinador) {
      await empresaDatos.freezeCoordinadorForOtherSolicitudes(conn, prev.id_coordinador_actual, null);
      await conn.query(
        `UPDATE ge_contactos
         SET
           nombre = COALESCE(NULLIF(?, ''), nombre),
           email = COALESCE(NULLIF(?, ''), email),
           telefono = COALESCE(NULLIF(?, ''), telefono)
         WHERE idcontacto = ?`,
        [
          nombreCoordinador,
          emailCoordinador,
          telefonoCoordinador,
          prev.id_coordinador_actual,
        ],
      );

      // Display name may change; login remains the company CIF.
      if (nombreCoordinador) {
        await conn.query(
          `UPDATE dual_usuarios
           SET nombre_mostrar =
             COALESCE(NULLIF(?, ''), nombre_mostrar)
           WHERE id_contacto = ?`,
          [nombreCoordinador, prev.id_coordinador_actual],
        );
      }
    }

    // Create new solicitud using existing base company information
    const [solRes] = await conn.query(
      `INSERT INTO dual_solicitudes_empresa (
         id_empresa,
         id_convocatoria,
         id_estado_validacion,
         id_representante_legal,
         id_coordinador_empresa,
         id_domicilio_legal,
         id_domicilio_trabajo,
         descripcion_puesto
       )
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      [
        idEmpresa,
        convocatoria.id_convocatoria,
        prev.id_representante_legal,
        prev.id_coordinador_actual,
        prev.id_domicilio_legal,
        prev.id_domicilio_trabajo,
        descripcion_puesto || "",
      ],
    );

    const idSolicitudEmpresa = solRes.insertId;

    // Ensure principal coordinator remains registered as a company tutor.
    await conn.query(
      `INSERT IGNORE INTO dual_empresa_tutores (id_empresa, id_contacto, activo)
       VALUES (?, ?, 1)`,
      [idEmpresa, prev.id_coordinador_actual],
    );

    // Insert speciality rows
    for (const esp of especialidades) {
      const idEsp = parseInt(esp.idEspecialidad, 10);
      const cant = parseInt(esp.cantidadAlumnos, 10);

      if (!idEsp || !cant || cant < 1) {
        await conn.rollback();

        return res.status(400).json({ error: "Especialidad inválida." });
      }
      if (cant > MAX_PLAZAS_POR_CICLO) {
        await conn.rollback();
        return res.status(400).json({ error: PLAZAS_EXCEDIDAS });
      }

      await conn.query(
        `INSERT INTO dual_solicitud_empresa_especialidades (
           id_solicitud_empresa,
           id_especialidad,
           cantidad_alumnos
         )
         VALUES (?, ?, ?)`,
        [idSolicitudEmpresa, idEsp, cant],
      );
    }

    // Transports of the new application only; earlier years keep theirs (D4).
    await empresaDatos.replaceTransportesSolicitud(
      conn,
      idSolicitudEmpresa,
      transportes.map((t) => parseInt(t, 10)).filter(Boolean),
    );

    // Migration 026: same ciclos as the company's validated convenio → it is
    // kept (inherited copy); other ciclos → a renewal the centre is told about.
    const convenio = await conveniosEmpresa.alSolicitarDeNuevo(conn, {
      idSolicitud: idSolicitudEmpresa, idEmpresa, user: req.user,
    });

    await conn.commit();

    if (convenio.vigente) {
      notificar.solicitudEmpresaRecibida(idSolicitudEmpresa, null, { vigente: true });
    } else if (convenio.renovacion) {
      // The company receives the new convenio with «solicitud recibida».
      const { pdf } = await conveniosEmpresa.despuesDeAbrir(idSolicitudEmpresa, {
        generar: generarConvenio(req.user?.id || null),
        avisarEmpresa: false,
        motivoCentro: convenio.renovacion.motivoCentro,
        ciclosAntes: convenio.renovacion.ciclosAntes,
        ciclosAhora: convenio.renovacion.ciclosAhora,
      });
      notificar.solicitudEmpresaRecibida(idSolicitudEmpresa, pdf);
    } else {
      await safelyGenerateAndSendConvenio(
        idSolicitudEmpresa,
        "Error al generar/enviar el convenio de reaplicación:",
        req.user?.id || null,
      );
    }

    return res.status(201).json({
      message: convenio.vigente
        ? "Reaplicación enviada correctamente. Vuestro convenio sigue vigente: no hace falta firmar otro."
        : convenio.renovacion
          ? "Reaplicación enviada correctamente. Como han cambiado los ciclos, tendréis que firmar un convenio nuevo."
          : "Reaplicación enviada correctamente.",
      id_solicitud_empresa: idSolicitudEmpresa,
      convenio_vigente: convenio.vigente,
      convenio_renovado: Boolean(convenio.renovacion),
    });
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

// GET /solicitudes/empresa/:id/documentos
exports.getDocumentos = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { error } = await resolveSolicitudForUser(req, id);

  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  const [rows] = await pool.query(
    `SELECT
       d.id_documento,
       td.nombre AS tipo_documento,
       ev.nombre AS estado_validacion,
       d.motivo
     FROM dual_documentos d
     JOIN dual_tipos_documento td
       ON td.id_tipo_documento = d.id_tipo_documento
     JOIN dual_estados_validacion ev
       ON ev.id_estado_validacion = d.id_estado_validacion
     WHERE d.id_solicitud_empresa = ?
     ORDER BY d.id_tipo_documento`,
    [id],
  );

  return res.json(rows);
};

// POST /solicitudes/empresa/:id/convenio/sustituir { motivo } — staff.
// Migration 026: the centre replaces a company's convenio (new representative,
// new template, a mistake…). The current one goes to history, a new one is
// generated, the company signs it and the centre validates it. The company
// stays validated meanwhile.
exports.sustituirConvenio = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const motivo = String(req.body?.motivo || "").replace(/\s+/g, " ").trim();
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Solicitud no válida." });
  if (!motivo) return res.status(400).json({ error: "Indica por qué se sustituye el convenio." });
  if (motivo.length > 300) return res.status(400).json({ error: "El motivo admite como máximo 300 caracteres." });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT se.id_solicitud_empresa, ev.nombre AS estado, c.activa
         FROM dual_solicitudes_empresa se
         JOIN dual_estados_validacion ev ON ev.id_estado_validacion = se.id_estado_validacion
         JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
        WHERE se.id_solicitud_empresa = ?
        FOR UPDATE`,
      [id],
    );
    const sol = rows[0];
    let denegado = null;
    if (!sol) denegado = [404, "Solicitud no encontrada."];
    else if (Number(sol.activa) !== 1) denegado = [400, "Solo se sustituye el convenio de solicitudes de la convocatoria activa."];
    else if (sol.estado === "RECHAZADO" || sol.estado === "BAJA") denegado = [400, "La solicitud no está activa."];
    else if (await conveniosEmpresa.renovacionAbierta(conn, id)) {
      denegado = [409, "Ya hay una renovación del convenio en curso: genera, firma y valida el convenio nuevo."];
    } else {
      const actual = await conveniosEmpresa.convenioActual(conn, id);
      if (!actual || !Number(actual.tiene_archivo)) {
        denegado = [400, "Esta solicitud todavía no tiene convenio: genéralo en lugar de sustituirlo."];
      }
    }
    if (denegado) {
      await conn.rollback();
      return res.status(denegado[0]).json({ error: denegado[1] });
    }
    await conveniosEmpresa.abrirRenovacion(conn, { idSolicitud: id, motivo: "MANUAL", detalle: motivo, user: req.user });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }

  const { pdf, sinPlantilla } = await conveniosEmpresa.despuesDeAbrir(id, {
    generar: generarConvenio(req.user.id),
    motivoEmpresa: `el centro lo ha sustituido (${motivo})`,
    motivoCentro: `se ha sustituido desde el centro (${motivo})`,
  });
  return res.json({
    message: pdf
      ? "Convenio sustituido. El nuevo se ha enviado a la empresa para que lo firme."
      : sinPlantilla
        ? "Convenio retirado. No hay plantilla activa: súbela y genera el convenio nuevo."
        : "Convenio retirado. Genera el convenio nuevo para enviarlo a la empresa.",
    generado: Boolean(pdf),
  });
};

exports._internals = { safelyGenerateAndSendConvenio };
