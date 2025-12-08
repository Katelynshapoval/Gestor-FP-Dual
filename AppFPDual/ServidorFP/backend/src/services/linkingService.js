const { connection } = require("../db/config");
const { transporter } = require("../mail/config");

// MOSTRAR TODAS LAS PETICIONES HECHAS POR ALUMNOS
exports.showStudentRequests = function (request, response) {
  const specialities = request.body.specialities;

  let query = `
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
        em1.empresa as em1, 
        g.estadoDual1 as estid1, 
        est1.descEstado as est1, 
        t1.nombreTipo as tipo1, 
        g.observaciones1 as obv1,
        g.idEmpresa2, 
        em2.empresa as em2, 
        g.estadoDual2 as estid2, 
        est2.descEstado as est2, 
        t2.nombreTipo as tipo2, 
        g.observaciones2 as obv2, 
        g.idEmpresa3, 
        em3.empresa as em3, 
        g.estadoDual3 as estid3, 
        est3.descEstado as est3, 
        t3.nombreTipo as tipo3, 
        g.observaciones3 as obv3, 
        g.fechaFormalizacion, 
        g.fechaPeticion, 
        g.anexo3FirmadoRecibido
    FROM gestiondual g
    JOIN gf_alumnosfct a ON a.idAlumno = g.idAlumno
    LEFT JOIN ge_empresas em1 ON em1.idempresa = g.idEmpresa1
    LEFT JOIN ge_empresas em2 ON em2.idempresa = g.idEmpresa2
    LEFT JOIN ge_empresas em3 ON em3.idempresa = g.idEmpresa3
    JOIN estadodual est1 ON g.estadoDual1 = est1.idEstado
    LEFT JOIN estadodual est2 ON g.estadoDual2 = est2.idEstado
    LEFT JOIN estadodual est3 ON g.estadoDual3 = est3.idEstado
    LEFT JOIN tipocontrato t1 ON g.tipoContrato1 = t1.idContrato
    LEFT JOIN tipocontrato t2 ON g.tipoContrato2 = t2.idContrato
    LEFT JOIN tipocontrato t3 ON g.tipoContrato3 = t3.idContrato
    JOIN especialidad es ON g.idEspecialidad = es.idEspecialidad
    LEFT JOIN evaluacion e ON g.idEvaluacion = e.idEvaluacion
    LEFT JOIN calendario c ON c.idAlumno = g.idAlumno
`;

  // Si no es admin (y por tanto tiene especialidades) filtrar por sus
  // especialidades
  if (specialities && specialities.length > 0 && specialities[0] !== null) {
    // Esto añade los ? que correspondan según cuantas especialidades haya.
    const placeholders = specialities.map(() => "?").join(",");
    query += ` WHERE g.idEspecialidad IN (${placeholders})`;
  }

  // El ORDER BY siempre debe ser lo último de la query.
  query += ` ORDER BY YEAR(g.fechaPeticion) DESC, es.nombreEsp;`;

  // Como specialities es un array de valores, puedo ponerlo directamente
  // donde de normal pondría values.
  connection.query(query, specialities, (error, results) => {
    if (error) {
      console.error("Error en la consulta:", error);
      return response
        .status(500)
        .json({ error: "Error al obtener las peticiones" });
    }
    response.status(200).json(results);
  });
};

// ENVIAR MAIL A LA EMPRESA PARA INFORMARLE DEL ALUMNO ASIGNADO
exports.sendMail = function (request, response) {
  const idGestion = request.body.idGestion;
  const idAlumno = request.body.idAlumno;
  const idEmpresa = request.body.idEmpresa;

  const query = "SELECT cvDoc FROM gestiondual WHERE idGestion = ?";

  connection.query(query, [idGestion], (error, results) => {
    if (error) return response.status(500).send("Error en BD");
    if (results.length === 0) return response.status(404).send("No encontrado");

    const cv = results[0].cvDoc;
    if (!cv) return response.status(404).send("Cv no encontrado");

    const query2 = "SELECT nombre FROM gf_alumnosfct WHERE idAlumno = ?";

    connection.query(query2, [idAlumno], (error2, results2) => {
      if (error2) return response.status(500).send("Error en BD");
      if (results2.length === 0)
        return response.status(404).send("No encontrado");
      const nombreAlumno = results2[0].nombre;

      const query3 = `
                SELECT p.correoAnexos, e.empresa
                FROM ge_empresas e, peticionempresa p
                WHERE p.idEmpresa = e.idempresa
                AND p.fecha = (
                    SELECT MAX(p2.fecha)
                    FROM peticionempresa p2
                    WHERE p2.idEmpresa = p.idEmpresa
                )
                AND p.idEmpresa = ?
                `;

      connection.query(query3, [idEmpresa], async (error3, results3) => {
        if (error3) return response.status(500).send("Error en BD");
        if (results3.length === 0)
          return response.status(404).send("No encontrado");
        const correoAnexos = results3[0].correoAnexos;
        const empresa = results3[0].empresa;

        try {
          await mandarMail(
            correoAnexos,
            cv,
            empresa,
            nombreAlumno,
            idEmpresa,
            idAlumno,
            request.body.url
          );
          response.status(201).json("Datos enviados correctamente");
        } catch (error) {
          console.error("Error en mandarMail:", error);
          response.status(500).json("Error al enviar el correo");
        }
      });
    });
  });
};

async function generarId(insertId) {
  const letras = "QRBMUHPWACKZFJLVDXSYIGTNOE";
  return insertId * 23 + letras[insertId % 26];
}

async function mandarMail(
  correoAnexos,
  cv,
  empresa,
  nombreAlumno,
  idEmpresa,
  idAlumno,
  host
) {
  const mail = {
    from: `"Salesianos Zaragoza" <${process.env.EMAIL_USER}>`,
    to: correoAnexos,
    subject: `Alumno seleccionado para ${empresa} - DUAL`,
    html: `
        <p>Buenos días, le enviamos este correo para informarle de que desde Salesianos hemos considerado que ${nombreAlumno} será 
        una buena opción para trabajar con ustedes.</p>
        <p>Adjuntamos en este correo su CV, para que puedan proceder a contactar con él y realizar el proceso de selección pertinente.</p>
        <p>Si deciden acoger a ${nombreAlumno} como parte de su equipo, rellenen el siguiente formulario: 
        ${host}/confirmStudent/${await generarId(idEmpresa)}/${await generarId(
      idAlumno
    )} antes del 15 de febrero.</p>
        <p>En caso contrario, porfavor notifiquenlo en este otro lo antes posible: 
        ${host}/denyStudent/${await generarId(idEmpresa)}/${await generarId(
      idAlumno
    )}</p>
        <p>IMPORTANTE!</p>
        <p>Si recibe un error de seguridad, es porque debe modificar la ruta de https:// a http://</p>
        `,
    attachments: [
      {
        filename:
          "CV_" + nombreAlumno + "_" + new Date().getFullYear() + ".pdf",
        content: cv,
        contentType: "application/pdf",
      },
    ],
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(mail, (err, info) => {
      if (err) {
        console.error("Error al enviar el correo:", err);
        reject(err);
      } else {
        console.log("Correo enviado:", info.response);
        console.log(idEmpresa);

        const query = `
                    UPDATE GestionDual
                    SET estadoDual1 = CASE WHEN idEmpresa1 = ? THEN 2 ELSE estadoDual1 END,
                        estadoDual2 = CASE WHEN idEmpresa2 = ? THEN 2 ELSE estadoDual2 END,
                        estadoDual3 = CASE WHEN idEmpresa3 = ? THEN 2 ELSE estadoDual3 END
                    WHERE (idEmpresa1 = ? OR idEmpresa2 = ? OR idEmpresa3 = ?)
                    AND idAlumno = ?
                    `;

        const values = [
          idEmpresa,
          idEmpresa,
          idEmpresa,
          idEmpresa,
          idEmpresa,
          idEmpresa,
          idAlumno,
        ];

        connection.query(query, values, (error, results) => {
          if (error) {
            console.error("Al cambiar el estado de la gestión:", error);
            reject(error);
          } else {
            console.log("Estado de la gestión cambiado");
            resolve(results);
          }
        });
      }
    });
  });
}

// MOSTRAR TODAS LAS PETICIONES HECHAS POR LAS EMPRESAS
exports.getCompanyRequests = function (request, response) {
  const specialities = request.body.specialities;

  let query = `
        SELECT p.idEmpresa, e.empresa, a.cantidad, a.idEspecialidad
        FROM ge_empresas e, peticionempresa p, alumnospedidos a
        WHERE p.idEmpresa = e.idempresa
        AND p.idPeticion = a.idPeticion
        AND p.fecha = (
            SELECT MAX(p2.fecha)
            FROM peticionempresa p2
            WHERE p2.idEmpresa = p.idEmpresa
        )
    `;

  // Si no es admin (y por tanto tiene especialidades) filtrar por sus
  // especialidades
  if (specialities && specialities.length > 0 && specialities[0] !== null) {
    // Esto añade los ? que correspondan según cuantas especialidades haya.
    const placeholders = specialities.map(() => "?").join(",");
    query += ` AND a.idEspecialidad IN (${placeholders})`;
  }

  // Como specialities es un array de valores, puedo ponerlo directamente
  // donde de normal pondría values.
  connection.query(query, specialities, (error, results) => {
    if (error) {
      console.error("Error en la consulta:", error);
      return response
        .status(500)
        .json({ error: "Error al obtener las peticiones" });
    }
    response.status(200).json(results);
  });
};

// ACTUALIZAR EL CAMPO EMPRESA1
exports.updateCompany1 = function (request, response) {
  const idGestion = request.body.idGestion;
  const idEmpresa = request.body.idEmpresa;

  const query = `
        UPDATE GestionDual 
        SET idEmpresa1 = ?, estadoDual1 = 1 
        WHERE idGestion = ?
    `;

  connection.query(query, [idEmpresa, idGestion], (error, results) => {
    if (error) {
      console.error("Error al actualizar empresa1:", error);
      return response.status(500).json({
        error: "Error interno del servidor",
      });
    }

    if (results.affectedRows === 0) {
      return response.status(404).json({
        error: "No se encontró el registro especificado",
      });
    }

    response.json({
      success: true,
      message: "Registro actualizado correctamente",
    });
  });
};

// ACTUALIZAR EL CAMPO EMPRESA2
exports.updateCompany2 = function (request, response) {
  const idGestion = request.body.idGestion;
  const idEmpresa = request.body.idEmpresa;

  const query = `
        UPDATE GestionDual 
        SET idEmpresa2 = ?, estadoDual2 = 1 
        WHERE idGestion = ?
    `;

  connection.query(query, [idEmpresa, idGestion], (error, results) => {
    if (error) {
      console.error("Error al actualizar empresa2:", error);
      return response.status(500).json({
        error: "Error interno del servidor",
      });
    }

    if (results.affectedRows === 0) {
      return response.status(404).json({
        error: "No se encontró el registro especificado",
      });
    }

    response.json({
      success: true,
      message: "Registro actualizado correctamente",
    });
  });
};

// ACTUALIZAR EL CAMPO EMPRESA3
exports.updateCompany3 = function (request, response) {
  const idGestion = request.body.idGestion;
  const idEmpresa = request.body.idEmpresa;

  const query = `
        UPDATE GestionDual 
        SET idEmpresa3 = ?, estadoDual3 = 1 
        WHERE idGestion = ?
    `;

  connection.query(query, [idEmpresa, idGestion], (error, results) => {
    if (error) {
      console.error("Error al actualizar empresa3:", error);
      return response.status(500).json({
        error: "Error interno del servidor",
      });
    }

    if (results.affectedRows === 0) {
      return response.status(404).json({
        error: "No se encontró el registro especificado",
      });
    }

    response.json({
      success: true,
      message: "Registro actualizado correctamente",
    });
  });
};

// OBTENER CV POR ID
exports.getCvDoc = function (request, response) {
  const id = request.params.id;
  const query = "SELECT cvDoc FROM gestiondual WHERE idGestion = ?";

  connection.query(query, [id], (error, results) => {
    if (error) return response.status(500).send("Error en BD");
    if (results.length === 0) return response.status(404).send("No encontrado");

    const blob = results[0].cvDoc;
    if (!blob) return response.status(404).send("Blob no encontrado");

    response.setHeader("Content-Type", "application/pdf");
    response.send(blob);
  });
};

// OBTENER ANEXO2 POR ID
exports.getAnexo2Doc = function (request, response) {
  const id = request.params.id;
  const query = "SELECT anexo2Doc FROM gestiondual WHERE idGestion = ?";

  connection.query(query, [id], (error, results) => {
    if (error) throw error;

    const blob = results[0].anexo2Doc;
    if (!blob)
      return response
        .status(404)
        .send("No hay blobs recogidos en la gestión con id " + id);

    response.setHeader("Content-Type", "application/pdf");
    response.send(blob);
  });
};

// OBTENER ANEXO3 POR ID
exports.getAnexo3Doc = function (request, response) {
  const id = request.params.id;
  const query = "SELECT anexo3Doc FROM gestiondual WHERE idGestion = ?";

  connection.query(query, [id], (error, results) => {
    if (error) throw error;

    const blob = results[0].anexo3Doc;
    if (!blob)
      return response
        .status(404)
        .send("No hay blobs recogidos en la gestión con id " + id);

    response.setHeader("Content-Type", "application/pdf");
    response.send(blob);
  });
};

// Obtener anexo3Doc por idGestion
exports.validate = function (request, response) {
  const id = request.params.id;
  const type = request.params.type;
  let query = "";
  switch (type) {
    case "anexo2":
      query =
        "UPDATE gestiondual SET anexo2FirmadoRecibido = NOT anexo2FirmadoRecibido WHERE idGestion = ?";
      break;
    case "anexo2":
      query =
        "UPDATE gestiondual SET anexo3FirmadoRecibido = NOT anexo3FirmadoRecibido WHERE idGestion = ?";
      break;
    default:
      return false;
  }

  connection.query(query, [id], (error, results) => {
    if (error) throw error;
    response.status(200).json(results);
  });
};
