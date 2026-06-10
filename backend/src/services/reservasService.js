const { connection } = require("../db/config");

// Obtiene idAuxEmpresa a partir del idUser o emailCoordinador del usuario logueado
function getAuxEmpresaId(idUser, email, callback) {
  connection.query(
    `SELECT idAuxEmpresa
     FROM   auxiliarempresa
     WHERE  (idUser = ? OR emailCoordinador = ?)
     ORDER  BY fechaPeticion DESC
     LIMIT  1`,
    [idUser, email],
    (err, rows) => {
      if (err || rows.length === 0) return callback(null);
      callback(rows[0].idAuxEmpresa);
    },
  );
}

// Devuelve las reservas de la empresa logueada con datos completos del alumno
exports.getMyReservations = function (request, response) {
  const { idUser, email } = request.body;

  getAuxEmpresaId(idUser, email, (idAuxEmpresa) => {
    if (!idAuxEmpresa) {
      return response.status(404).json({ error: "Empresa no encontrada" });
    }

    const q = `
      SELECT
        r.idReserva,
        r.idGestion,
        r.fechaReserva,
        r.documentoSubido,
        ae.razonSocial AS miEmpresa,
        g.idAlumno,
        a.nombre,
        a.dni,
        a.email       AS emailAlumno,
        a.telalumno,
        a.carnetDeConducir,
        a.tieneCoche,
        es.nombreEsp,
        g.idEspecialidad,
        g.anexo2FirmadoRecibido,
        g.anexo3FirmadoRecibido,
        g.idEmpresa1,  em1.empresa AS em1, g.estadoDual1 AS estid1,
        g.idEmpresa2,  em2.empresa AS em2, g.estadoDual2 AS estid2,
        g.idEmpresa3,  em3.empresa AS em3, g.estadoDual3 AS estid3,
        CASE
          WHEN em1.empresa = ae.razonSocial THEN 1
          WHEN em2.empresa = ae.razonSocial THEN 2
          WHEN em3.empresa = ae.razonSocial THEN 3
          ELSE 0
        END AS miSlot
      FROM   reservas r
      JOIN   auxiliarempresa ae ON ae.idAuxEmpresa = r.idAuxEmpresa
      JOIN   gestiondual g      ON g.idGestion     = r.idGestion
      JOIN   gf_alumnosfct a    ON a.idAlumno      = g.idAlumno
      JOIN   especialidad es    ON es.idEspecialidad = g.idEspecialidad
      LEFT JOIN ge_empresas em1 ON em1.idempresa = g.idEmpresa1
      LEFT JOIN ge_empresas em2 ON em2.idempresa = g.idEmpresa2
      LEFT JOIN ge_empresas em3 ON em3.idempresa = g.idEmpresa3
      WHERE  r.idAuxEmpresa = ?
      ORDER  BY r.documentoSubido DESC, r.fechaReserva DESC
    `;

    connection.query(q, [idAuxEmpresa], (err, rows) => {
      if (err) {
        console.error("Error al obtener reservas:", err);
        return response.status(500).json({ error: "Error al obtener las reservas" });
      }
      response.status(200).json(rows);
    });
  });
};

// Sube el documento firmado de la empresa para una reserva concreta
exports.uploadReservationDoc = function (request, response) {
  const { idUser, email } = request.body;
  const { idGestion } = request.params;

  if (!request.file) {
    return response.status(400).json({ error: "No se recibió ningún archivo" });
  }

  getAuxEmpresaId(idUser, email, (idAuxEmpresa) => {
    if (!idAuxEmpresa) {
      return response.status(404).json({ error: "Empresa no encontrada" });
    }

    const docBuffer = request.file.buffer;

    connection.query(
      `UPDATE reservas
       SET    documentoFirmado = ?, documentoSubido = 1
       WHERE  idGestion = ? AND idAuxEmpresa = ?`,
      [docBuffer, idGestion, idAuxEmpresa],
      (err, result) => {
        if (err) {
          console.error("Error al guardar documento:", err);
          return response.status(500).json({ error: "Error al guardar el documento" });
        }
        if (result.affectedRows === 0) {
          return response.status(404).json({ error: "Reserva no encontrada" });
        }
        response.status(200).json({ success: true });
      },
    );
  });
};

// Devuelve el documento firmado de una reserva (empresa o admin)
exports.getReservationDoc = function (request, response) {
  const { idGestion, idAuxEmpresa } = request.params;

  connection.query(
    `SELECT documentoFirmado FROM reservas WHERE idGestion = ? AND idAuxEmpresa = ?`,
    [idGestion, idAuxEmpresa],
    (err, rows) => {
      if (err) return response.status(500).send("Error en BD");
      const blob = rows[0]?.documentoFirmado;
      if (!blob) return response.status(404).send("Documento no encontrado");
      response.setHeader("Content-Type", "application/pdf");
      response.send(blob);
    },
  );
};

// Devuelve todas las reservas activas con datos de empresa y alumno (admin)
exports.getAllReservations = function (request, response) {
  const q = `
    SELECT
      r.idReserva,
      r.idGestion,
      r.idAuxEmpresa,
      r.fechaReserva,
      r.documentoSubido,
      ae.razonSocial  AS empresa,
      ae.emailCoordinador,
      g.idAlumno,
      a.nombre        AS alumno,
      a.dni,
      es.nombreEsp,
      g.anexo2FirmadoRecibido,
      g.anexo3FirmadoRecibido
    FROM   reservas r
    JOIN   auxiliarempresa ae ON ae.idAuxEmpresa = r.idAuxEmpresa
    JOIN   gestiondual g      ON g.idGestion     = r.idGestion
    JOIN   gf_alumnosfct a    ON a.idAlumno      = g.idAlumno
    JOIN   especialidad es    ON es.idEspecialidad = g.idEspecialidad
    ORDER  BY r.documentoSubido DESC, ae.razonSocial, r.fechaReserva DESC
  `;

  connection.query(q, (err, rows) => {
    if (err) {
      console.error("Error al obtener todas las reservas:", err);
      return response.status(500).json({ error: "Error al obtener las reservas" });
    }
    response.status(200).json(rows);
  });
};
