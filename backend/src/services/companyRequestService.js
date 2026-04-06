const { connection } = require("../db/config");
const { transporter } = require("../mail/config");
const { generarId } = require("../utils/idUtils");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const puppeteer = require("puppeteer");
const { createReport } = require("docx-templates");

// INSERTAR NUEVA PETICIÓN DE EMPRESA PARA EL PROGRAMA DUAL
// Ahora también crea un usuario en la tabla users y lo vincula con la empresa
exports.addCompanyRequest = function (request, response) {
  const {
    emailCoordinador,
    nombreCoordinador,
    telefonoCoordinador,
    razonSocial,
    cif,
    telEmpresa,
    dirRazSocial,
    provincia,
    municipio,
    cpRazSoc,
    responsableLegal,
    cargo,
    dniRl,
    descripcionPuesto,
    direccionLugarTrabajo,
    metodosTransporte,
    fechaPeticion,
    specialities,
    url,
  } = request.body;

  const query = `
    INSERT INTO AuxiliarEmpresa (emailCoordinador, nombreCoordinador, telefonoCoordinador,
                                razonSocial, cif, telEmpresa, dirRazSocial, provincia, municipio, cpRazSoc,
                                responsableLegal, cargo, dni, descripcionPuesto, direccionLugarTrabajo,
                                metodosTransporte, fechaPeticion, especialidadYCantAlumnos) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const values = {
    emailCoordinador,
    nombreCoordinador,
    telefonoCoordinador,
    razonSocial,
    cif,
    telEmpresa,
    dirRazSocial,
    provincia,
    municipio,
    cpRazSoc,
    responsableLegal,
    cargo,
    dniRl,
    descripcionPuesto,
    direccionLugarTrabajo,
    metodosTransporte,
    fechaPeticion,
    specialities,
  };

  connection.query(query, Object.values(values), async (err, result) => {
    if (err) {
      console.error("Error al insertar la empresa:", err);
      return response
        .status(500)
        .json({ error: "Error al guardar la empresa" });
    }

    const idAuxEmpresa = result.insertId;

    // Crear cuenta de usuario para la empresa
    try {
      await crearUsuarioEmpresa(
        idAuxEmpresa,
        emailCoordinador,
        razonSocial,
        cif,
      );
    } catch (userErr) {
      console.error("Error al crear el usuario de la empresa:", userErr);
    }

    const specialitiesCodes = await recibirNombres(values.specialities);
    const convenioDocxPath = await editarConvenio(values, specialitiesCodes);
    const convenioPdfPath = await docxToPdf(convenioDocxPath);
    const idGenerado = await generarId(idAuxEmpresa);

    mandarMail(values, convenioPdfPath, idGenerado, url);
    response.status(201).json("Solicitud de empresa añadida correctamente");
  });
};

// CREAR USUARIO EMPRESA: username = CIF en minúsculas, contraseña aleatoria hasheada
async function crearUsuarioEmpresa(idAuxEmpresa, email, razonSocial, cif) {
  const username = cif.toLowerCase();
  const rawPassword =
    Math.random().toString(36).slice(-4).toUpperCase() +
    Math.random().toString(36).slice(-4);
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  return new Promise((resolve, reject) => {
    const insertUser = `INSERT INTO users (name, email, user_type, password) VALUES (?, ?, 'empresa', ?)`;
    connection.query(
      insertUser,
      [razonSocial, email, hashedPassword],
      (err, userResult) => {
        if (err) return reject(err);
        const idUser = userResult.insertId;
        const updateEmpresa = `UPDATE AuxiliarEmpresa SET idUser = ?, username = ? WHERE idAuxEmpresa = ?`;
        connection.query(
          updateEmpresa,
          [idUser, username, idAuxEmpresa],
          (err2) => {
            if (err2) return reject(err2);
            console.log(
              `Usuario empresa creado: ${username} (idUser: ${idUser})`,
            );
            resolve({ idUser, username, rawPassword });
          },
        );
      },
    );
  });
}

// OBTENER TODAS LAS EMPRESAS PARA EL PANEL DE ADMINISTRACIÓN
exports.getAllCompanies = function (request, response) {
  const query = `
    SELECT
      ae.idAuxEmpresa, ae.emailCoordinador, ae.nombreCoordinador, ae.telefonoCoordinador,
      ae.razonSocial, ae.cif, ae.telEmpresa, ae.dirRazSocial, ae.provincia, ae.municipio,
      ae.cpRazSoc, ae.responsableLegal, ae.cargo, ae.dni AS dniRl,
      ae.descripcionPuesto, ae.direccionLugarTrabajo, ae.metodosTransporte,
      ae.fechaPeticion, ae.especialidadYCantAlumnos,
      ae.idUser, ae.username,
      COALESCE(ae.convenio_validado, 0) AS convenio_validado,
      CASE WHEN ae.convenioDoc IS NOT NULL THEN 1 ELSE 0 END AS tieneConvenio
    FROM AuxiliarEmpresa ae
    ORDER BY ae.fechaPeticion DESC`;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error al obtener las empresas:", error);
      return response
        .status(500)
        .json({ error: "Error al obtener las empresas" });
    }
    response.status(200).json(results);
  });
};

// OBTENER EL FICHERO DE CONVENIO FIRMADO (para el admin)
exports.getConvenioFile = function (request, response) {
  const id = parseInt(request.params.id, 10);

  const query = `SELECT convenioDoc FROM AuxiliarEmpresa WHERE idAuxEmpresa = ?`;

  connection.query(query, [id], (error, results) => {
    if (error || !results[0]?.convenioDoc) {
      return response.status(404).json({ error: "Convenio no encontrado" });
    }

    const pdf = results[0].convenioDoc;

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Length", pdf.length);
    response.setHeader(
      "Content-Disposition",
      `inline; filename="convenio_${id}.pdf"`,
    );

    response.send(pdf);
  });
};

// MARCAR EL CONVENIO COMO VALIDADO POR EL ADMIN
exports.validateConvenio = function (request, response) {
  const id = parseInt(request.params.id, 10);
  const query = `UPDATE AuxiliarEmpresa SET convenio_validado = 1 WHERE idAuxEmpresa = ?`;
  connection.query(query, [id], (error) => {
    if (error) {
      console.error("Error al validar el convenio:", error);
      return response
        .status(500)
        .json({ error: "Error al validar el convenio" });
    }
    response.status(200).json({ ok: true });
  });
};

// RESETEAR LA CONTRASEÑA DEL USUARIO VINCULADO A UNA EMPRESA
exports.resetPassword = async function (request, response) {
  const id = parseInt(request.params.id, 10);
  const newPassword =
    Math.random().toString(36).slice(-4).toUpperCase() +
    Math.random().toString(36).slice(-4);
  const hashed = await bcrypt.hash(newPassword, 10);

  connection.query(
    "SELECT idUser FROM AuxiliarEmpresa WHERE idAuxEmpresa = ?",
    [id],
    (err, results) => {
      if (err || !results[0]?.idUser) {
        return response
          .status(404)
          .json({ error: "Usuario no encontrado para esta empresa" });
      }
      const idUser = results[0].idUser;
      connection.query(
        "UPDATE users SET password = ? WHERE idUser = ?",
        [hashed, idUser],
        (err2) => {
          if (err2)
            return response
              .status(500)
              .json({ error: "Error al resetear la contraseña" });
          response.status(200).json({ newPassword });
        },
      );
    },
  );
};

// OBTENER LOS CÓDIGOS OFICIALES DE ESPECIALIDAD A PARTIR DE SUS IDS
async function recibirNombres(specialities) {
  const array = JSON.parse(specialities);
  const values = array[0];
  const plantilla = values.map(() => "?").join(",");
  const query = `SELECT codigoEsp FROM especialidad WHERE idEspecialidad IN (${plantilla});`;
  return new Promise((resolve, reject) => {
    connection.query(query, Object.values(values), (err, result) => {
      if (err) {
        console.error(
          "Error al obtener los códigos de las especialidades:",
          err,
        );
        return reject(err);
      }
      resolve(result);
    });
  });
}

// RELLENAR LA PLANTILLA DEL CONVENIO Y GUARDAR EL DOCX RESULTANTE
async function editarConvenio(values, specialitiesCodes) {
  const templatePath = path.join(
    __dirname,
    "..",
    "..",
    "required_documents",
    "CONVENIO_GENERAL_PLANTILLA.docx",
  );
  const outputPath = path.join(
    __dirname,
    "..",
    "..",
    "uploads",
    `CONVENIO_${values.razonSocial}_${new Date().getFullYear()}.docx`,
  );
  try {
    const buffer = await createReport({
      template: fs.readFileSync(templatePath),
      data: {
        razonSocial: values.razonSocial,
        responsableLegal: values.responsableLegal,
        dniRl: values.dniRl,
        dirRazSocial:
          values.dirRazSocial +
          " " +
          values.provincia +
          " " +
          values.municipio +
          " " +
          values.cpRazSoc,
        cif: values.cif,
        cargo: values.cargo,
        specialities: specialitiesCodes.map((e) => e.codigoEsp).join(", "),
        fechaPeticion: values.fechaPeticion,
      },
      cmdDelimiter: ["<<", ">>"],
    });
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  } catch (error) {
    console.error("Error al editar el convenio:", error);
    throw error;
  }
}

// CONVERTIR UN DOCX A PDF Y ELIMINAR EL DOCX TEMPORAL
async function docxToPdf(docxPath) {
  const pdfPath = docxPath.replace(/\.docx$/, ".pdf");
  try {
    const { value: html } = await mammoth.convertToHtml({ path: docxPath });
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      margin: { top: "2cm", bottom: "2cm", left: "2cm", right: "2cm" },
      printBackground: true,
    });
    await browser.close();
    fs.unlink(docxPath, (err) => {
      if (err) console.warn("No se pudo eliminar el DOCX:", err.message);
    });
    return pdfPath;
  } catch (error) {
    console.error("Error al convertir DOCX a PDF:", error);
    throw error;
  }
}

// ENVIAR CORREO DE CONFIRMACIÓN CON EL CONVENIO ADJUNTO
async function mandarMail(values, convenioPath, idGenerado, host) {
  const mail = {
    from: `"Salesianos Zaragoza" <${process.env.EMAIL_USER}>`,
    to: values.emailCoordinador,
    subject: "Confirmación de solicitud - DUAL",
    html: `
      <p>Buenos días, le enviamos este correo para informarle de que la formalización de la documentación para participar
      en el programa de Formación Profesional Dual ha sido recibida correctamente.</p>
      <p>Si desea participar, por favor cargue el siguiente documento firmado aquí: ${host}/addConvenio/${idGenerado} antes del 15 de febrero.</p>
      <p>IMPORTANTE!</p>
      <p>Si recibe un error de seguridad, es porque debe modificar la ruta de https:// a http://</p>`,
    attachments: [
      {
        filename:
          "CONVENIO_" +
          values.razonSocial +
          "_" +
          new Date().getFullYear() +
          ".pdf",
        path: convenioPath,
      },
    ],
  };
  transporter.sendMail(mail, (err, info) => {
    if (err) console.error("Error al enviar el correo:", err);
    else console.log("Correo enviado:", info.response);
  });
}

// INSERTAR EL CONVENIO FIRMADO POR LA EMPRESA (ruta pública, ID ofuscado)
exports.addConvenio = function (request, response) {
  const id = request.params.id.slice(0, -1) / 23;
  const convenio = request.file;
  const convData = fs.readFileSync(convenio.path);

  const query = `
    UPDATE auxiliarempresa 
    SET convenioDoc = (?), convenio_validado = 0
    WHERE idAuxEmpresa = (?)`;

  connection.query(query, [convData, id], (error) => {
    if (error) {
      console.error("Error al actualizar la peticion:", error);
      return response
        .status(500)
        .json({ error: "Error al actualizar la peticion." });
    }
    response.status(201).json("Solicitud de empresa actualizada correctamente");
  });
};

// OBTENER LOS DATOS DE LA EMPRESA POR EMAIL DEL COORDINADOR
exports.getCompanyDataByEmail = function (request, response) {
  const email = request.body.email;
  const query = `
    SELECT ae.idAuxEmpresa, ae.emailCoordinador, ae.nombreCoordinador, ae.telefonoCoordinador,
           ae.razonSocial, ae.cif, ae.telEmpresa, ae.dirRazSocial, ae.provincia, ae.municipio,
           ae.cpRazSoc, ae.responsableLegal, ae.cargo, ae.dni AS dniRl,
           ae.descripcionPuesto, ae.direccionLugarTrabajo, ae.metodosTransporte,
           ae.fechaPeticion, ae.especialidadYCantAlumnos,
           ae.username,
           COALESCE(ae.convenio_validado, 0) AS convenio_validado,
           CASE WHEN ae.convenioDoc IS NOT NULL THEN 1 ELSE 0 END AS tieneConvenio
    FROM AuxiliarEmpresa ae
    WHERE ae.emailCoordinador = ?
    ORDER BY ae.fechaPeticion DESC
    LIMIT 1`;

  connection.query(query, [email], (error, results) => {
    if (error) {
      console.error("Error al obtener datos de empresa:", error);
      return response
        .status(500)
        .json({ error: "Error al obtener datos de empresa" });
    }
    if (results.length === 0)
      return response
        .status(404)
        .json({ error: "No se encontraron datos de empresa" });
    response.status(200).json(results[0]);
  });
};
