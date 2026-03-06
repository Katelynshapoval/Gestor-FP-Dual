const { connection } = require("../db/config");

// LISTAR TODAS LAS ESPECIALIDADES
exports.getAllSpecialities = function (request, response) {
    connection.query("SELECT * FROM especialidad",
        (error, results) => {
            if (error)
                throw error;
            response.status(200).json(results);
        });
};
