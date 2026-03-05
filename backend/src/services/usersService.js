const { connection } = require("../db/config");
const bcrypt = require("bcrypt");

// Usuario por email
exports.getUserByEmail = function (request, response) {
    const query = `
                    SELECT u.*, JSON_ARRAYAGG(uc.idCourse) AS specialities 
                    FROM users u 
                    LEFT JOIN userscourses uc 
                    ON u.idUser = uc.idUser 
                    WHERE u.email = ? 
                    GROUP BY u.idUser
                `;
    const values = [request.body.email];

    console.log(values);

    connection.query( query, values, 
        (error, results) => {
            if(error)
                throw error;
            if(results == null || results[0] == null) 
                return response.status(400).json({msg: "User not found"});
            response.status(200).json(results[0]);
        });
};

// Insertar usuarios
exports.addUser = function (request, response) {
    const name = request.body.name;
    const email = request.body.email;
    connection.query("INSERT INTO users(name, email) VALUES (?, ?)",
        [name, email],
        (error, results) => {
            if (error) {
                console.error("Error al insertar el usuario:", error);
                return response.status(500).json({ error: "Error al crear el usuario" });
            }

            addCourses(results.insertId, request.body.specialities);

            response.status(201).json("Usuario añadido correctamente");
        }
    );
};

function addCourses(id, specialities){
    const values = specialities.map(specialityId => [id, specialityId]);
    
    connection.query("INSERT INTO userscourses (idUser, idCourse) VALUES (?)",
        [values],
        (error, results) => {
            if (error) {
                console.error("Error al añadir las especialidades del usuario", error);
            }

            console.log("Especialidades del usuario añadidas correctamente");
        }
    );
}