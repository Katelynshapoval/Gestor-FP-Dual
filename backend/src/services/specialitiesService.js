const { connection } = require("../db/config");

// LISTAR ESPECIALIDADES
exports.getAllSpecialities = function (request, response) {
    connection.query("SELECT * FROM especialidad", 
    (error, results) => {
        if(error)
            throw error;
        response.status(200).json(results);
    });
};
/*
// INSERTAR ESPECIALIDAD
exports.addSpecialities = function (request, response) {
    const {nombreEsp, especial, codigoEsp } = request.body;
    console.log("RequestBody speciality: " + request.body);
    connection.query("INSERT INTO especialidades(nombreEsp, especial, codigoEsp) VALUES (?, ?, ?)",
        [nombreEsp, especial, codigoEsp ],
        (error, results) => {
            if(error) throw error;
            response.status(201).json("Item añadido correctamente");
        }
    );
};
// BORRAR ESPECIALIDAD
exports.deleteSpecialities = function (request, response) {
    const {especialidad} = request.body;
    console.log("Valor de especialidad: " + especialidad);
    
    // Desactivar verificación de clave externa
    connection.query("SET FOREIGN_KEY_CHECKS = 0;");

    // Eliminar preferencias basadas en la preferencia proporcionada
    connection.query("WITH temporal AS (SELECT idespecialidad FROM especialidades WHERE nombre = ?) " +
                     "DELETE FROM especialidades WHERE idespecialidad = (SELECT * FROM temporal);",
                     [especialidad]);

    // Reactivar verificación de clave externa
    connection.query("SET FOREIGN_KEY_CHECKS = 1;");
    
    // Todo se ejecutó correctamente, enviar respuesta
    response.status(200).json("Item borrado correctamente");
};
*/