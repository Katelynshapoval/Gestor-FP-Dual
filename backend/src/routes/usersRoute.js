const { Router } = require("express");
const router = Router();

const UsersService = require("../services/usersService");

// Login Google OAuth (admins y profesores)
router.post("/getUserByEmail", UsersService.getUserByEmail);

// Login con credenciales username/password (empresas)
router.post("/loginWithCredentials", UsersService.loginWithCredentials);

router.post("/changePassword", UsersService.changePassword);

module.exports = router;
