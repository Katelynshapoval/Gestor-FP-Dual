const { connection } = require("../db/config");
const { transporter } = require("../mail/config");
const { generarId } = require("../utils/idUtils");
const fs = require("fs");
const path = require("path");
// Conversión de .docx a PDF
const mammoth = require("mammoth");
const puppeteer = require("puppeteer");
// Modificación de la plantilla del convenio
const { createReport } = require("docx-templates");

// INSERTAR NUEVA PETICIÓN DE EMPRESA PARA EL PROGRAMA DUAL
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

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

    const specialitiesCodes = await recibirNombres(values.specialities);
    const convenioDocxPath = await editarConvenio(values, specialitiesCodes);
    const convenioPdfPath = await docxToPdf(convenioDocxPath);
    const idGenerado = await generarId(result.insertId);

    mandarMail(values, convenioPdfPath, idGenerado, url);

    response.status(201).json("Solicitud de empresa añadida correctamente");
  });
};

// OBTENER LOS CÓDIGOS OFICIALES DE ESPECIALIDAD A PARTIR DE SUS IDS
async function recibirNombres(specialities) {
  const array = JSON.parse(specialities);
  const values = array[0];
  const plantilla = values.map(() => "?").join(",");
  const query = `
    SELECT codigoEsp FROM especialidad WHERE idEspecialidad IN (${plantilla});
    `;
  // Envuelto en Promise para que el await funcione correctamente
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
    // cmdDelimiter evita que se sustituyan palabras comunes fuera de las
    // marcas delimitadoras (p. ej. solo «<<cargo>>» se reemplazará).
    // Este patrón es reutilizable para el Anexo 3 cambiando plantilla y datos.
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
            <p>Si recibe un error de seguridad, es porque debe modificar la ruta de https:// a http://</p>
            `,
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
    if (err) {
      console.error("Error al enviar el correo:", err);
    } else {
      console.log("Correo enviado:", info.response);
    }
  });
}

// INSERTAR EL CONVENIO FIRMADO POR LA EMPRESA
exports.addConvenio = function (request, response) {
  // El ID viene ofuscado para dificultar el acceso a rutas con IDs arbitrarios
  const id = request.params.id.slice(0, -1) / 23;
  const convenio = request.file;

  const convData = fs.readFileSync(convenio.path);
  const values = [convData, id];

  const query = `
        UPDATE auxiliarempresa 
        SET convenioDoc = (?) 
        WHERE idAuxEmpresa = (?)
    `;

  connection.query(query, values, (error, results) => {
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
           ae.fechaPeticion, ae.especialidadYCantAlumnos
    FROM AuxiliarEmpresa ae
    WHERE ae.emailCoordinador = ?
    ORDER BY ae.fechaPeticion DESC
    LIMIT 1
  `;

  connection.query(query, [email], (error, results) => {
    if (error) {
      console.error("Error al obtener datos de empresa:", error);
      return response
        .status(500)
        .json({ error: "Error al obtener datos de empresa" });
    }
    if (results.length === 0) {
      return response
        .status(404)
        .json({ error: "No se encontraron datos de empresa" });
    }
    response.status(200).json(results[0]);
  });
};
