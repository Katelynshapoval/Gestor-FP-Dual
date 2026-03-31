const { connection } = require("../db/config");
const bcrypt = require("bcrypt");

// OBTENER USUARIO POR EMAIL (login Google OAuth — para admins y profesores)
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

  connection.query(query, values, (error, results) => {
    if (error) throw error;
    if (results == null || results[0] == null)
      return response.status(400).json({ msg: "User not found" });
    response.status(200).json(results[0]);
  });
};

// LOGIN CON CREDENCIALES (username + password) — para empresas
// Busca el usuario por username en AuxiliarEmpresa (que guarda el username generado),
// luego verifica el hash bcrypt de la contraseña.
exports.loginWithCredentials = async function (request, response) {
  const { username, password } = request.body;
  if (!username || !password) {
    return response.status(400).json({ msg: "Faltan credenciales" });
  }

  // Buscar en AuxiliarEmpresa el username y el idUser vinculado
  const queryEmpresa = `
        SELECT ae.idAuxEmpresa, ae.razonSocial, ae.emailCoordinador, ae.idUser, ae.username
        FROM AuxiliarEmpresa ae
        WHERE ae.username = ?
        LIMIT 1
    `;

  connection.query(
    queryEmpresa,
    [username.toLowerCase()],
    async (err, empresaResults) => {
      if (err) {
        console.error("Error al buscar empresa:", err);
        return response.status(500).json({ msg: "Error interno del servidor" });
      }
      if (!empresaResults || empresaResults.length === 0) {
        return response.status(401).json({ msg: "Credenciales incorrectas" });
      }

      const empresa = empresaResults[0];
      if (!empresa.idUser) {
        return response
          .status(401)
          .json({ msg: "Esta empresa no tiene usuario activo" });
      }

      // Obtener la contraseña hasheada del usuario
      const queryUser = `SELECT password FROM users WHERE idUser = ?`;
      connection.query(
        queryUser,
        [empresa.idUser],
        async (err2, userResults) => {
          if (err2 || !userResults || !userResults[0]) {
            return response
              .status(401)
              .json({ msg: "Credenciales incorrectas" });
          }

          const hashedPassword = userResults[0].password;
          const match = await bcrypt.compare(password, hashedPassword);

          if (!match) {
            return response
              .status(401)
              .json({ msg: "Credenciales incorrectas" });
          }

          // Devolvemos la misma estructura que getUserByEmail espera el frontend
          response.status(200).json({
            idUser: empresa.idUser,
            name: empresa.razonSocial,
            email: empresa.emailCoordinador,
            user_type: "empresa",
            specialities: [null], // las empresas no tienen especialidades propias
          });
        },
      );
    },
  );
};

// INSERTAR USUARIO (desactivado en la ruta, disponible para uso futuro)
exports.addUser = function (request, response) {
  const name = request.body.name;
  const email = request.body.email;
  connection.query(
    "INSERT INTO users(name, email) VALUES (?, ?)",
    [name, email],
    (error, results) => {
      if (error) {
        console.error("Error al insertar el usuario:", error);
        return response
          .status(500)
          .json({ error: "Error al crear el usuario" });
      }

      addCourses(results.insertId, request.body.specialities);

      response.status(201).json("Usuario añadido correctamente");
    },
  );
};

// ASOCIAR ESPECIALIDADES A UN USUARIO RECIÉN CREADO
function addCourses(id, specialities) {
  const values = specialities.map((specialityId) => [id, specialityId]);

  connection.query(
    "INSERT INTO userscourses (idUser, idCourse) VALUES (?)",
    [values],
    (error, results) => {
      if (error) {
        console.error("Error al añadir las especialidades del usuario", error);
      }
      console.log("Especialidades del usuario añadidas correctamente");
    },
  );
}
