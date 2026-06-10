const { connection } = require("../db/config");
const { transporter } = require("../mail/config");
const { generarId } = require("../utils/idUtils");

// Fragmento SELECT compartido entre la vista de admin y la de empresa
const BASE_SELECT = `
  SELECT
    g.idGestion,
    g.idAlumno,
    a.nombre,
    a.dni,
    a.email,
    a.telalumno,
    a.telfamilia,
    a.carnetDeConducir,
    a.tieneCoche,
    c.calendarioComprobado,
    g.idEspecialidad,
    es.nombreEsp,
    g.anexo2FirmadoRecibido,
    e.idEvaluacion,
    e.notaTotal,
    g.idEmpresa1,
    em1.empresa AS em1,
    g.estadoDual1  AS estid1,
    est1.descEstado AS est1,
    t1.nombreTipo   AS tipo1,
    g.observaciones1 AS obv1,
    g.idEmpresa2,
    em2.empresa AS em2,
    g.estadoDual2  AS estid2,
    est2.descEstado AS est2,
    t2.nombreTipo   AS tipo2,
    g.observaciones2 AS obv2,
    g.idEmpresa3,
    em3.empresa AS em3,
    g.estadoDual3  AS estid3,
    est3.descEstado AS est3,
    t3.nombreTipo   AS tipo3,
    g.observaciones3 AS obv3,
    g.fechaFormalizacion,
    g.fechaPeticion,
    g.anexo3FirmadoRecibido
`;

// Fragmento adicional para la vista de empresa: datos de reserva
const RESERVA_SELECT = `,
  COALESCE(res_agg.totalReservas, 0) AS totalReservas,
  COALESCE(res_agg.miReserva, 0)     AS miReserva
`;

// FROM + JOINs compartidos
const BASE_FROM = `
  FROM gestiondual g
  JOIN  gf_alumnosfct a   ON a.idAlumno   = g.idAlumno
  LEFT JOIN ge_empresas em1  ON em1.idempresa = g.idEmpresa1
  LEFT JOIN ge_empresas em2  ON em2.idempresa = g.idEmpresa2
  LEFT JOIN ge_empresas em3  ON em3.idempresa = g.idEmpresa3
  JOIN  estadodual est1  ON g.estadoDual1  = est1.idEstado
  LEFT JOIN estadodual est2  ON g.estadoDual2  = est2.idEstado
  LEFT JOIN estadodual est3  ON g.estadoDual3  = est3.idEstado
  LEFT JOIN tipocontrato t1  ON g.tipoContrato1 = t1.idContrato
  LEFT JOIN tipocontrato t2  ON g.tipoContrato2 = t2.idContrato
  LEFT JOIN tipocontrato t3  ON g.tipoContrato3 = t3.idContrato
  JOIN  especialidad es  ON g.idEspecialidad = es.idEspecialidad
  LEFT JOIN evaluacion e     ON g.idEvaluacion  = e.idEvaluacion
  LEFT JOIN calendario c     ON c.idAlumno      = g.idAlumno
`;

// JOIN adicional que agrega datos de reservas para una empresa concreta.
// El primer parámetro de la query debe ser idAuxEmpresa.
const RESERVA_JOIN = `
  LEFT JOIN (
    SELECT  idGestion,
            COUNT(*)  AS totalReservas,
            MAX(CASE WHEN idAuxEmpresa = ? THEN 1 ELSE 0 END) AS miReserva
    FROM    reservas
    GROUP BY idGestion
  ) res_agg ON res_agg.idGestion = g.idGestion
`;

// Obtiene idAuxEmpresa a partir del idUser o email del usuario logueado
function getAuxEmpresaId(idUser, email, callback) {
  const q = `
    SELECT idAuxEmpresa
    FROM   auxiliarempresa
    WHERE  (idUser = ? OR emailCoordinador = ?)
    ORDER  BY fechaPeticion DESC
    LIMIT  1
  `;
  connection.query(q, [idUser, email], (err, rows) => {
    if (err || rows.length === 0) return callback(null);
    callback(rows[0].idAuxEmpresa);
  });
}

// Devuelve todas las peticiones de alumnos según el tipo de usuario
exports.showStudentRequests = function (request, response) {
  const { specialities, user_type, idUser, email, year } = request.body;
  const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();

  if (user_type === "empresa") {
    // Primero obtener especialidades e idAuxEmpresa de la empresa
    const espQuery = `
      SELECT idAuxEmpresa, especialidadYCantAlumnos
      FROM   auxiliarempresa
      WHERE  (idUser = ? OR emailCoordinador = ?)
        AND  especialidadYCantAlumnos IS NOT NULL
      ORDER  BY fechaPeticion DESC
      LIMIT  1
    `;

    connection.query(espQuery, [idUser, email], (espErr, espRows) => {
      if (espErr || espRows.length === 0) {
        console.error("No se encontró solicitud de empresa para idUser:", idUser, "email:", email, espErr);
        return response.status(200).json([]);
      }

      const idAuxEmpresa = espRows[0].idAuxEmpresa;
      let empresaSpecialities = [];

      try {
        const parsed = JSON.parse(espRows[0].especialidadYCantAlumnos);
        empresaSpecialities = (Array.isArray(parsed[0]) ? parsed[0] : parsed)
          .map(Number)
          .filter((n) => !isNaN(n) && n > 0);
      } catch (e) {
        console.error("Error al parsear especialidadYCantAlumnos:", e);
        return response.status(200).json([]);
      }

      if (empresaSpecialities.length === 0) return response.status(200).json([]);

      const placeholders = empresaSpecialities.map(() => "?").join(",");
      const q =
        BASE_SELECT + RESERVA_SELECT +
        BASE_FROM + RESERVA_JOIN +
        ` WHERE YEAR(g.fechaPeticion) = ?
            AND g.idEspecialidad IN (${placeholders})
          ORDER BY es.nombreEsp`;

      // Primer parámetro es idAuxEmpresa (para el CASE dentro de RESERVA_JOIN)
      connection.query(q, [idAuxEmpresa, targetYear, ...empresaSpecialities], (err, rows) => {
        if (err) {
          console.error("Error en consulta empresa:", err);
          return response.status(500).json({ error: "Error al obtener las peticiones" });
        }
        response.status(200).json(rows);
      });
    });

    return;
  }

  // Usuarios no-empresa (admin, tutores)
  let query = BASE_SELECT + BASE_FROM + " WHERE 1=1";
  const params = [];

  query += " AND YEAR(g.fechaPeticion) = ?";
  params.push(targetYear);

  if (specialities && specialities.length > 0 && specialities[0] !== null) {
    const placeholders = specialities.map(() => "?").join(",");
    query += ` AND g.idEspecialidad IN (${placeholders})`;
    params.push(...specialities);
  }

  query += " ORDER BY YEAR(g.fechaPeticion) DESC, es.nombreEsp;";

  connection.query(query, params, (error, results) => {
    if (error) {
      console.error("Error en la consulta:", error);
      return response.status(500).json({ error: "Error al obtener las peticiones" });
    }
    response.status(200).json(results);
  });
};

// Crea una reserva de un alumno por parte de una empresa.
// Solo se permite si el alumno no tiene el anexo firmado todavía.
exports.reserveStudent = function (request, response) {
  const { idGestion, idUser, email } = request.body;

  getAuxEmpresaId(idUser, email, (idAuxEmpresa) => {
    if (!idAuxEmpresa) {
      return response.status(404).json({ error: "Empresa no encontrada" });
    }

    // Verificar que el alumno no tenga asignación definitiva
    connection.query(
      "SELECT anexo2FirmadoRecibido, anexo3FirmadoRecibido FROM gestiondual WHERE idGestion = ?",
      [idGestion],
      (err, rows) => {
        if (err || rows.length === 0) {
          return response.status(404).json({ error: "Gestión no encontrada" });
        }

        if (rows[0].anexo2FirmadoRecibido || rows[0].anexo3FirmadoRecibido) {
          return response.status(409).json({ error: "Este alumno ya tiene asignación definitiva" });
        }

        // INSERT IGNORE: si ya existe la reserva no devuelve error
        connection.query(
          "INSERT IGNORE INTO reservas (idGestion, idAuxEmpresa) VALUES (?, ?)",
          [idGestion, idAuxEmpresa],
          (insertErr) => {
            if (insertErr) {
              console.error("Error al crear reserva:", insertErr);
              return response.status(500).json({ error: "Error al crear la reserva" });
            }
            response.status(201).json({ success: true });
          },
        );
      },
    );
  });
};

// Elimina la reserva de un alumno por parte de una empresa
exports.unreserveStudent = function (request, response) {
  const { idGestion, idUser, email } = request.body;

  getAuxEmpresaId(idUser, email, (idAuxEmpresa) => {
    if (!idAuxEmpresa) {
      return response.status(404).json({ error: "Empresa no encontrada" });
    }

    connection.query(
      "DELETE FROM reservas WHERE idGestion = ? AND idAuxEmpresa = ?",
      [idGestion, idAuxEmpresa],
      (err) => {
        if (err) {
          console.error("Error al eliminar reserva:", err);
          return response.status(500).json({ error: "Error al eliminar la reserva" });
        }
        response.status(200).json({ success: true });
      },
    );
  });
};

// Envía el correo a la empresa con el CV del alumno asignado
exports.sendMail = function (request, response) {
  const { idGestion, idAlumno, idEmpresa } = request.body;

  connection.query(
    "SELECT cvDoc FROM gestiondual WHERE idGestion = ?",
    [idGestion],
    (error, results) => {
      if (error) return response.status(500).send("Error en BD");
      if (results.length === 0) return response.status(404).send("No encontrado");

      const cv = results[0].cvDoc;
      if (!cv) return response.status(404).send("Cv no encontrado");

      connection.query(
        "SELECT nombre FROM gf_alumnosfct WHERE idAlumno = ?",
        [idAlumno],
        (error2, results2) => {
          if (error2) return response.status(500).send("Error en BD");
          if (results2.length === 0) return response.status(404).send("No encontrado");

          const nombreAlumno = results2[0].nombre;

          const query3 = `
            SELECT p.correoAnexos, e.empresa
            FROM   ge_empresas e, peticionempresa p
            WHERE  p.idEmpresa = e.idempresa
              AND  p.fecha = (
                SELECT MAX(p2.fecha) FROM peticionempresa p2 WHERE p2.idEmpresa = p.idEmpresa
              )
              AND  p.idEmpresa = ?
          `;

          connection.query(query3, [idEmpresa], async (error3, results3) => {
            if (error3) return response.status(500).send("Error en BD");
            if (results3.length === 0) return response.status(404).send("No encontrado");

            const { correoAnexos, empresa } = results3[0];

            try {
              await mandarMail(correoAnexos, cv, empresa, nombreAlumno, idEmpresa, idAlumno, request.body.url);
              response.status(201).json("Datos enviados correctamente");
            } catch (err) {
              console.error("Error en mandarMail:", err);
              response.status(500).json("Error al enviar el correo");
            }
          });
        },
      );
    },
  );
};

// Envía el correo y actualiza el estado del slot correspondiente
async function mandarMail(correoAnexos, cv, empresa, nombreAlumno, idEmpresa, idAlumno, host) {
  const idEmpresaOfuscado = await generarId(idEmpresa);
  const idAlumnoOfuscado = await generarId(idAlumno);

  const mail = {
    from: `"Salesianos Zaragoza" <${process.env.EMAIL_USER}>`,
    to: correoAnexos,
    subject: `Alumno seleccionado para ${empresa} - DUAL`,
    html: `
      <p>Buenos días, le enviamos este correo para informarle de que desde Salesianos hemos considerado
      que ${nombreAlumno} será una buena opción para trabajar con ustedes.</p>
      <p>Adjuntamos en este correo su CV, para que puedan proceder a contactar con él y realizar
      el proceso de selección pertinente.</p>
      <p>Si deciden acoger a ${nombreAlumno} como parte de su equipo, rellenen el siguiente formulario:
      ${host}/confirmStudent/${idEmpresaOfuscado}/${idAlumnoOfuscado} antes del 15 de febrero.</p>
      <p>En caso contrario, porfavor notifiquenlo en este otro lo antes posible:
      ${host}/denyStudent/${idEmpresaOfuscado}/${idAlumnoOfuscado}</p>
      <p>IMPORTANTE: Si recibe un error de seguridad, es porque debe modificar la ruta de https:// a http://</p>
    `,
    attachments: [
      {
        filename: `CV_${nombreAlumno}_${new Date().getFullYear()}.pdf`,
        content: cv,
        contentType: "application/pdf",
      },
    ],
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(mail, (err, info) => {
      if (err) {
        console.error("Error al enviar el correo:", err);
        return reject(err);
      }
      console.log("Correo enviado:", info.response);

      const updateQuery = `
        UPDATE GestionDual
        SET estadoDual1 = CASE WHEN idEmpresa1 = ? THEN 2 ELSE estadoDual1 END,
            estadoDual2 = CASE WHEN idEmpresa2 = ? THEN 2 ELSE estadoDual2 END,
            estadoDual3 = CASE WHEN idEmpresa3 = ? THEN 2 ELSE estadoDual3 END
        WHERE (idEmpresa1 = ? OR idEmpresa2 = ? OR idEmpresa3 = ?)
          AND idAlumno = ?
      `;

      connection.query(
        updateQuery,
        [idEmpresa, idEmpresa, idEmpresa, idEmpresa, idEmpresa, idEmpresa, idAlumno],
        (error) => {
          if (error) {
            console.error("Error al cambiar el estado de la gestión:", error);
            return reject(error);
          }
          resolve();
        },
      );
    });
  });
}

// Devuelve todas las peticiones de empresas con la cantidad solicitada por especialidad
exports.getCompanyRequests = function (request, response) {
  const { specialities } = request.body;

  let query = `
    SELECT p.idEmpresa, e.empresa, a.cantidad, a.idEspecialidad
    FROM   ge_empresas e, peticionempresa p, alumnospedidos a
    WHERE  p.idEmpresa = e.idempresa
      AND  p.idPeticion = a.idPeticion
      AND  p.fecha = (
        SELECT MAX(p2.fecha) FROM peticionempresa p2 WHERE p2.idEmpresa = p.idEmpresa
      )
  `;

  if (specialities && specialities.length > 0 && specialities[0] !== null) {
    const placeholders = specialities.map(() => "?").join(",");
    query += ` AND a.idEspecialidad IN (${placeholders})`;
  }

  connection.query(query, specialities, (error, results) => {
    if (error) {
      console.error("Error en la consulta:", error);
      return response.status(500).json({ error: "Error al obtener las peticiones" });
    }
    response.status(200).json(results);
  });
};

// Actualiza el slot empresa1 de una gestión
exports.updateCompany1 = function (request, response) {
  const { idGestion, idEmpresa } = request.body;
  connection.query(
    "UPDATE GestionDual SET idEmpresa1 = ?, estadoDual1 = 1 WHERE idGestion = ?",
    [idEmpresa, idGestion],
    (error, results) => {
      if (error) {
        console.error("Error al actualizar empresa1:", error);
        return response.status(500).json({ error: "Error interno del servidor" });
      }
      if (results.affectedRows === 0) {
        return response.status(404).json({ error: "No se encontró el registro especificado" });
      }
      response.json({ success: true, message: "Registro actualizado correctamente" });
    },
  );
};

// Actualiza el slot empresa2 de una gestión
exports.updateCompany2 = function (request, response) {
  const { idGestion, idEmpresa } = request.body;
  connection.query(
    "UPDATE GestionDual SET idEmpresa2 = ?, estadoDual2 = 1 WHERE idGestion = ?",
    [idEmpresa, idGestion],
    (error, results) => {
      if (error) {
        console.error("Error al actualizar empresa2:", error);
        return response.status(500).json({ error: "Error interno del servidor" });
      }
      if (results.affectedRows === 0) {
        return response.status(404).json({ error: "No se encontró el registro especificado" });
      }
      response.json({ success: true, message: "Registro actualizado correctamente" });
    },
  );
};

// Actualiza el slot empresa3 de una gestión
exports.updateCompany3 = function (request, response) {
  const { idGestion, idEmpresa } = request.body;
  connection.query(
    "UPDATE GestionDual SET idEmpresa3 = ?, estadoDual3 = 1 WHERE idGestion = ?",
    [idEmpresa, idGestion],
    (error, results) => {
      if (error) {
        console.error("Error al actualizar empresa3:", error);
        return response.status(500).json({ error: "Error interno del servidor" });
      }
      if (results.affectedRows === 0) {
        return response.status(404).json({ error: "No se encontró el registro especificado" });
      }
      response.json({ success: true, message: "Registro actualizado correctamente" });
    },
  );
};

// Devuelve el CV de una gestión en formato PDF
exports.getCvDoc = function (request, response) {
  connection.query(
    "SELECT cvDoc FROM gestiondual WHERE idGestion = ?",
    [request.params.id],
    (error, results) => {
      if (error) return response.status(500).send("Error en BD");
      if (results.length === 0) return response.status(404).send("No encontrado");
      const blob = results[0].cvDoc;
      if (!blob) return response.status(404).send("Blob no encontrado");
      response.setHeader("Content-Type", "application/pdf");
      response.send(blob);
    },
  );
};

// Devuelve el Anexo 2 de una gestión en formato PDF
exports.getAnexo2Doc = function (request, response) {
  connection.query(
    "SELECT anexo2Doc FROM gestiondual WHERE idGestion = ?",
    [request.params.id],
    (error, results) => {
      if (error) return response.status(500).send("Error en BD");
      const blob = results[0]?.anexo2Doc;
      if (!blob) return response.status(404).send("No hay blobs recogidos en la gestión con id " + request.params.id);
      response.setHeader("Content-Type", "application/pdf");
      response.send(blob);
    },
  );
};

// Devuelve el Anexo 3 de una gestión en formato PDF
exports.getAnexo3Doc = function (request, response) {
  connection.query(
    "SELECT anexo3Doc FROM gestiondual WHERE idGestion = ?",
    [request.params.id],
    (error, results) => {
      if (error) return response.status(500).send("Error en BD");
      const blob = results[0]?.anexo3Doc;
      if (!blob) return response.status(404).send("No hay blobs recogidos en la gestión con id " + request.params.id);
      response.setHeader("Content-Type", "application/pdf");
      response.send(blob);
    },
  );
};

// Alterna el flag de recepción firmada de un anexo (anexo2 o anexo3)
exports.validate = function (request, response) {
  const { id, type } = request.params;
  const queries = {
    anexo2: "UPDATE gestiondual SET anexo2FirmadoRecibido = NOT anexo2FirmadoRecibido WHERE idGestion = ?",
    anexo3: "UPDATE gestiondual SET anexo3FirmadoRecibido = NOT anexo3FirmadoRecibido WHERE idGestion = ?",
  };

  const query = queries[type];
  if (!query) return response.status(400).json({ error: "Tipo de documento no válido" });

  connection.query(query, [id], (error, results) => {
    if (error) return response.status(500).json({ error: "Error en BD" });
    response.status(200).json(results);
  });
};

// Devuelve el idEmpresa de una empresa a partir del correo de anexos
exports.getCompanyIdByEmail = function (request, response) {
  const { email } = request.body;

  const query = `
    SELECT p.idEmpresa
    FROM   peticionempresa p
    WHERE  p.correoAnexos = ?
      AND  p.fecha = (
        SELECT MAX(p2.fecha) FROM peticionempresa p2 WHERE p2.idEmpresa = p.idEmpresa
      )
    LIMIT 1
  `;

  connection.query(query, [email], (error, results) => {
    if (error) {
      console.error("Error al obtener idEmpresa:", error);
      return response.status(500).json({ error: "Error interno" });
    }
    if (results.length === 0) {
      return response.status(404).json({ error: "Empresa no encontrada" });
    }
    response.status(200).json(results[0]);
  });
};
