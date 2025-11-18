const { connection } = require("../db/config");

// LISTAR PREFERENCIAS
exports.getAllPreferences = function (request, response) {
    connection.query("SELECT * FROM preferencia", 
    (error, results) => {
        if(error)
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
        if(error)
            throw error;
        response.status(200).json(results);
    });
};
/*
// INSERTAR PREFERENCIAS
exports.addPreferences = function (request, response) {
    const preferencia = request.body.preference;
    connection.query("INSERT INTO preferencias(preferencia) VALUES (?)",
        [preferencia],
        (error, results) => {
            if(error) throw error;
            response.status(201).json("Item añadido correctamente");
        }
    );
};
// BORRAR PREFERENCIAS
// Nota: NO puedes añadir varias sentencias en una sola querry! Tienes que hacerlo en tantas como sentencias quieras aplicar.
exports.deletePreferences = function (request, response) {
    const preferencia = request.body.preference;
    console.log("Valor de preferencia: " + preferencia);
    
    // Desactivar verificación de clave externa
    connection.query("SET FOREIGN_KEY_CHECKS = 0;");
    
    // Eliminar preferencias basadas en la preferencia proporcionada
    connection.query("WITH temporal AS (SELECT idpreferencia FROM preferencias WHERE preferencia = ?) " +
                     "DELETE FROM preferencias WHERE idpreferencia = (SELECT * FROM temporal);",
                     [preferencia]);

    // Reactivar verificación de clave externa
    connection.query("SET FOREIGN_KEY_CHECKS = 1;");
    
    // Todo se ejecutó correctamente, enviar respuesta
    response.status(200).json("Item borrado correctamente");
};
*/