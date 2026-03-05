const { connection } = require("../db/config");

// LISTAR POSIBLES TRANSPORTES
exports.getAllPossibleTransports = function (request, response) {
    connection.query("SELECT * FROM posiblestransportes", 
    (error, results) => {
        if(error)
            throw error;
        response.status(200).json(results);
    });
};