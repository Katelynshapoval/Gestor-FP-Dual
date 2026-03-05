require('dotenv').config();
const { connection } = require("../db/config");
const { transporter } = require("../mail/config");
// Para gestionar los documentos
const fs = require('fs');

// INSERTAR NUEVO PARTICIPANTE EN EL PROGRAMA DUAL
exports.addStudent = function (request, response) {
    const file = request.files['doc']?.[0];
    const cv = request.files['cv']?.[0];
    const {
        emailinstituto,
        dniNie,
        nombre,
        sexo,
        fechanacimiento,
        nacionalidad,
        email,
        telalumno,
        carnetconducir,
        disponibilidad,
        idiomas,
        numeroSS,
        domicilio,
        cp,
        localidad,
        especialidad,
        idpreferencia1,
        idpreferencia2,
        idpreferencia3,
        nombretutorlegal,
        dnitutorlegal
    } = request.body;
    
    if (!file) {
        return response.status(400).json({ error: 'No se ha subido el anexo 2.' });
    }

    if (!cv) {
        return response.status(400).json({ error: 'No se ha subido ningún cv.' });
    }

    // Leer los archivos y convertirlos a un formato que se pueda almacenar en la base de datos (blob)
    const fileData = fs.readFileSync(file.path);
    const cvData = fs.readFileSync(cv.path);

    // Insertar el archivo y los datos del estudiante en la base de datos
    const query = `INSERT INTO AuxiliarAlumno (emailColegio, dni, nombreCompleto, sexo, fechaNacimiento, nacionalidad, email, 
        telAlumno, carnetConducir, tieneCoche, numeroSS, domicilio, cp, localidad, idEspecialidad, preferencia1, preferencia2, 
        preferencia3, idiomasNivel, cvEuropass, anexo2, tutorLegal, dniTutorLegal) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [
        emailinstituto, dniNie, nombre, sexo, fechanacimiento, nacionalidad, email, telalumno, carnetconducir === "true",
        disponibilidad === "true", numeroSS, domicilio, cp, localidad, especialidad, idpreferencia1, idpreferencia2,
        idpreferencia3, idiomas, cvData, fileData, nombretutorlegal || null, dnitutorlegal || null
    ];

    connection.query(query, values, (error, results) => {
        if (error) {
            console.error('Error al insertar el estudiante:', error);
            return response.status(500).json({ error: 'Error al insertar el estudiante.' });
        }

        sendMail(request, request.body);

        response.status(201).json("Solicitud de estudiante añadida correctamente");
    });
};

function sendMail(request, datosEstudiante){
    const {
        emailinstituto, dniNie, nombre, sexo, fechanacimiento, nacionalidad,
        email, telalumno, carnetconducir, disponibilidad, idiomas, numeroSS, 
        domicilio, cp, localidad, especialidad, idpreferencia1, idpreferencia2,
        idpreferencia3, nombretutorlegal, dnitutorlegal
    } = datosEstudiante;

    // De las preferencias y la especialidad recibo los ids, por lo que necesito recibir 
    // los nombres para mandarlos en el correo.
    const query = `
        SELECT e.nombreEsp AS nomEsp,
        (SELECT p1.preferencia FROM Preferencia p1 WHERE p1.idPreferencia = ?) AS nomPre1,
        (SELECT p2.preferencia FROM Preferencia p2 WHERE p2.idPreferencia = ?) AS nomPre2,
        (SELECT p3.preferencia FROM Preferencia p3 WHERE p3.idPreferencia = ?) AS nomPre3
        FROM Especialidad e
        WHERE e.idEspecialidad = ?
    `;

    const values = [idpreferencia1, idpreferencia2, idpreferencia3, especialidad];

    connection.query(query, values, (err, results) => {
        if (err) {
            return reject('Error al obtener las preferencias o la especialidad');
        }

        const { nomEsp, nomPre1, nomPre2, nomPre3 } = results[0];

        const mail = {
            from: `"Salesianos Zaragoza" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Confirmación de inscripción - DUAL',
            html: `
            <p>Buenos días, le enviamos este correo para informarle de que su inscripción en el programa de 
            Formación Profesional Dual ha sido recibida correctamente.</p>
            <h3>Estos son los datos que nos ha enviado:</h3>
            <ul>
                <li><b>Nombre:</b> ${nombre}</li>
                <li><b>DNI/NIE:</b> ${dniNie}</li>
                <li><b>Sexo:</b> ${sexo}</li>
                <li><b>Fecha de nacimiento:</b> ${fechanacimiento}</li>
                ${nombretutorlegal ? `<li><b>Nombre del tutor legal:</b> ${nombretutorlegal}</li>` : ''}
                ${dnitutorlegal ? `<li><b>DNI del tutor legal:</b> ${dnitutorlegal}</li>` : ''}
                <li><b>Nacionalidad:</b> ${nacionalidad}</li>
                <li><b>Email del instituto:</b> ${emailinstituto}</li>
                <li><b>Teléfono:</b> ${telalumno}</li>
                <li><b>Carnet de conducir:</b> ${carnetconducir === 'true' ? 'Sí' : 'No'}</li>
                <li><b>Vehículo disponible:</b> ${disponibilidad === 'true' ? 'Sí' : 'No'}</li>
                <li><b>Idiomas:</b> ${idiomas}</li>
                ${numeroSS ? `<li><b>Número de la Seguridad Social:</b> ${numeroSS}</li>` : ''}
                <li><b>Domicilio:</b> ${domicilio}</li>
                <li><b>Código Postal:</b> ${cp}</li>
                <li><b>Localidad:</b> ${localidad}</li>
                <li><b>Especialidad:</b> ${nomEsp}</li>
                <li><b>Preferencia 1:</b> ${nomPre1}</li>
                <li><b>Preferencia 2:</b> ${nomPre2}</li>
                <li><b>Preferencia 3:</b> ${nomPre3}</li>
            </ul>
            `,
            attachments: [
                {
                    filename: "CV.pdf",
                    path: request.files.cv[0].path,
                },
                {
                    filename: "Anexo2.pdf",
                    path: request.files.doc[0].path,
                },
            ],
        };

        transporter.sendMail(mail, (err, info) => {
            if (err) {
                console.error('Error al enviar el correo:', err);
            } else {
                console.log('Correo enviado:', info.response);
            }

            try {
                if (request.files.doc) fs.unlinkSync(request.files.doc[0].path);
            } catch (e) {
                console.warn('Error al eliminar archivo temporal del anexo:', e);
            }

            try {
                if (request.files.cv) fs.unlinkSync(request.files.cv[0].path);
            } catch (e) {
                console.warn('Error al eliminar archivo temporal del cv:', e);
            }
        });
    });
}