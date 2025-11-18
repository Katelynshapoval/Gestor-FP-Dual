const { connection } = require("../db/config");

// SACAR UNA EVALUACIÓN EN FUNCIÓN DEL ID DE SU GESTIÓN DUAL
exports.getEvaluationByManagementId = function (request, response) {
    const idManagement = request.body.idManagement.slice(0, -1) / 23;
    connection.query("SELECT e.* FROM evaluacion e, gestiondual g WHERE g.idGestion = (?) AND g.idEvaluacion = e.idEvaluacion",
        [idManagement], 
        (error, results) => {
        if(error)
            throw error;
        response.status(200).json(results);
    });
};

// CREAR UNA EVALUACION
exports.createEvaluation = function (request, response) {
    const {
        id,
        notaMedia,
        idiomas,
        madurez,
        competencia,
        faltas,
        notaTotal,
        fecha
    } = request.body;

    const query = `
        INSERT INTO evaluacion (notaMedia, idiomas, madurez, competencia, faltas, notaTotal, fecha) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        notaMedia,
        idiomas,
        madurez,
        competencia,
        faltas === '' ? 0 : faltas,
        notaTotal,
        fecha
    ];

    connection.query(query, values, (error, results) => {
        if(error)
            throw error;

        const values2 = [
            results.insertId,
            id.slice(0, -1) / 23
        ];

        const query2 = `
            UPDATE gestiondual SET idEvaluacion = ? WHERE idGestion = ?
        `;

        connection.query(query2, values2, (error2, results2) => {
            if(error)
                throw error;
        });

        response.status(200).json(results);
    });
};

// ACTUALIZAR UNA EVALUACION
exports.updateEvaluation = function (request, response) {
    const {
        id,
        notaMedia,
        idiomas,
        madurez,
        competencia,
        faltas,
        notaTotal,
        fecha
    } = request.body;

    const query = `
        UPDATE evaluacion 
        SET notaMedia = ?, idiomas = ?, madurez = ?, competencia = ?, faltas = ?, notaTotal = ?, fecha = ?
        WHERE idEvaluacion = ?
    `;

    const values = [
        notaMedia,
        idiomas,
        madurez,
        competencia,
        faltas === '' ? 0 : faltas,
        notaTotal,
        fecha,
        id
    ];

    connection.query(query, values, (error, results) => {
        if(error)
            throw error;
        response.status(200).json(results);
    });
};