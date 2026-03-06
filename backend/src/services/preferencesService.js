const { connection } = require("../db/config");

// LISTAR TODAS LAS PREFERENCIAS
exports.getAllPreferences = function (request, response) {
    connection.query("SELECT * FROM preferencia",
        (error, results) => {
            if (error)
                throw error;
            response.status(200).json(results);
        });
};

// LISTAR PREFERENCIAS POR ESPECIALIDAD
exports.getPreferencesBySpeciality = function (request, response) {
    const idSpeciality = request.body.idSpeciality;
    connection.query("SELECT * FROM preferencia WHERE idEspecialidad = (?)",
        [idSpeciality],
        (error, results) => {
            if (error)
                throw error;
            response.status(200).json(results);
        });
};
