const { connection } = require("../db/config");
const { transporter } = require("../mail/config");
const fs = require('fs');
const path = require('path');
// Para poder convertir a pdf los .docx
const { exec } = require('child_process');
// Para modificar la plantilla y crear los convenios.
const { createReport } = require('docx-templates');

// INSERTAR NUEVA PETICIÓN DE ALUMNOS PARA EL PROGRAMA DUAL POR PARTE DE UNA EMPRESA
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
        url
    } = request.body;

    const query = `
    INSERT INTO AuxiliarEmpresa (emailCoordinador, nombreCoordinador, telefonoCoordinador,
                                razonSocial, cif, telEmpresa, dirRazSocial, provincia, municipio, cpRazSoc,
                                responsableLegal, cargo, dni, descripcionPuesto, direccionLugarTrabajo,
                                metodosTransporte, fechaPeticion, especialidadYCantAlumnos) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = {
        emailCoordinador, nombreCoordinador, telefonoCoordinador, razonSocial, cif, 
        telEmpresa, dirRazSocial, provincia, municipio, cpRazSoc, responsableLegal, 
        cargo, dniRl, descripcionPuesto, direccionLugarTrabajo, metodosTransporte, 
        fechaPeticion, specialities
    };

    connection.query(query, Object.values(values), async (err, result) => {
        if (err) {
        console.error("Error al insertar la empresa:", err);
        return response.status(500).json({ error: "Error al guardar la empresa" });
        }

        const specialitiesCodes = await recibirNombres(values.specialities);
        const convenioDocxPath = await editarConvenio(values, specialitiesCodes);
        const convenioPdfPath = await docxToPdf(convenioDocxPath);
        const idGenerado = await generarId(result.insertId);

        mandarMail(values, convenioPdfPath, idGenerado, url);

        response.status(201).json("Solicitud de empresa añadida correctamente");
    });
};

// De las especialidades tengo las ids, para el documento oficial quiero los códigos oficiales.
async function recibirNombres(specialities){
    const array =JSON.parse(specialities);;
    const values = array[0];
    const plantilla = values.map(() => '?').join(',');
    const query = `
    SELECT codigoEsp FROM especialidad WHERE idEspecialidad IN (${plantilla});
    `;
    // Si no se envuelve en una Promise, el await no se efectuará y devolverá undefined
    return new Promise((resolve, reject) => {
        connection.query(query, Object.values(values), (err, result) => {
            if (err) {
                console.error("Error al obtener los códigos de las especialidades:", err);
                return reject(err);
            }
            // En las promise no es return, es resolve.
            resolve(result);
        });
    });
}

async function editarConvenio(values, specialitiesCodes) {
    // Ruta la plantilla original del convenio
    const templatePath = path.join(__dirname, '..', '..', 'required_documents', 'CONVENIO_GENERAL_PLANTILLA.docx');
    
    // Ruta donde se guardará el convenio editado
    const outputPath = path.join(__dirname, '..', '..', 'uploads', `CONVENIO_${values.razonSocial}_${new Date().getFullYear()}.docx`);

    try {
        // A futuro: 
        // Este código es 100% reusable para el Anexo3. Cambiar la plantilla y los 
        // campos a modificar y lo tienes.
        // Importante: Sin cmdDelimiter pillaría cualquier instancia de las palabras
        // ubicadas dentro de data (cualquier instancia de "cargo", por ejemplo).
        // cmdDelimiter permite que solo recoja las instancias de las palabras que
        // se encuentren dentro de nuestros delimitadores escogidos (['<<', '>>'], 
        // por ejemplo "<<cargo>>" se reconocerá).
        const buffer = await createReport({
            template: fs.readFileSync(templatePath),
            data: {
                razonSocial: values.razonSocial,
                responsableLegal: values.responsableLegal,
                dniRl: values.dniRl,
                dirRazSocial: values.dirRazSocial + ' ' + values.provincia + ' ' + values.municipio + ' ' + values.cpRazSoc,
                cif: values.cif,
                cargo: values.cargo,
                specialities: specialitiesCodes.map(e => e.codigoEsp).join(', '),
                fechaPeticion: values.fechaPeticion,
            },
            cmdDelimiter: ['<<', '>>'],
        });

        // Guardar el archivo editado
        fs.writeFileSync(outputPath, buffer);
        return outputPath;
    } catch (error) {
        console.error('Error al editar el convenio:', error);
        throw error;
    }
}

function docxToPdf(docxPath) {
    // Si no se envuelve en una Promise, el await no se efectuará y devolverá undefined
    return new Promise((resolve, reject) => {
        const libreOfficeCommand = `soffice --headless --convert-to pdf --outdir "${path.dirname(docxPath)}" "${docxPath}"`;

        // Ejecutamos el comando de libreOffice para la conversión.
        exec(libreOfficeCommand, (error, stdout, stderr) => {
            if (error) {
                console.error('Error al convertir a PDF:', stderr);
                return reject(error);
            }

            //Cambiamos la terminacion del documento.
            const pdfPath = docxPath.replace(/\.docx$/, '.pdf');

            // Comprobar que el archivo .pdf existe antes de borrar el .docx.
            fs.access(pdfPath, fs.constants.F_OK, (error2) => {
                if (error2) {
                    console.error('PDF no encontrado tras la conversión');
                    return reject(new Error('PDF no generado'));
                }

                // Eliminar el archivo .docx.
                fs.unlink(docxPath, (error3) => {
                    if (error3) {
                        console.warn('No se pudo eliminar el archivo .docx:', error3.message);
                    }
                    resolve(pdfPath);
                });
            });
        });
    });
}

async function generarId(insertId) {
    const letras = 'QRBMUHPWACKZFJLVDXSYIGTNOE';
    return insertId * 23 + letras[insertId % 26];
}

async function mandarMail(values, convenioPath, idGenerado, host){
    const mail = {
            from: `"Salesianos Zaragoza" <${process.env.EMAIL_USER}>`,
            to: values.emailCoordinador,
            subject: 'Confirmación de solicitud - DUAL',
            html: `
            <p>Buenos días, le enviamos este correo para informarle de que la formalización de la documentación para participar
            en el programa de Formación Profesional Dual ha sido recibida correctamente.</p>
            <p>Si desea participar, por favor cargue el siguiente documento firmado aquí: ${host}/addConvenio/${idGenerado} antes del 15 de febrero.</p>
            <p>IMPORTANTE!</p>
            <p>Si recibe un error de seguridad, es porque debe modificar la ruta de https:// a http://</p>
            `,
            attachments: [
                {
                    filename: 'CONVENIO_' + values.razonSocial + '_' + new Date().getFullYear() + '.pdf',
                    path: convenioPath,
                },
            ],
        };
    transporter.sendMail(mail, (err, info) => {
        if (err) {
            console.error('Error al enviar el correo:', err);
        } else {
            console.log('Correo enviado:', info.response);
        }
    });
}

// INSERTAR EL CONVENIO FIRMADO POR UNA EMPRESA QUE QUIERE PARTICIPAR EN EL PROGRAMA DUAL.
exports.addConvenio = function (request, response) {
    //El id viene alterado para dificultar que se pueda acceder a la ruta 
    const id = request.params.id.slice(0, -1) / 23;
    const convenio = request.file;

    // Leer el archivo y convertirlo a un formato que se pueda almacenar en la base de datos (blob)
    const convData = fs.readFileSync(convenio.path);

    const values = [convData, id];

    const query = `
        UPDATE auxiliarempresa 
        SET convenioDoc = (?) 
        WHERE idAuxEmpresa = (?)
    `;

    connection.query(query, values, (error, results) => {
            if (error) {
                console.error('Error al actualizar la peticion:', error);
                return response.status(500).json({ error: 'Error al actualizar la peticion.' });
            }

            response.status(201).json("Solicitud de empresa actualizada correctamente");
        });
};