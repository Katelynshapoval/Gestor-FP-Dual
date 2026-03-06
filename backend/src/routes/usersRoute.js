const { Router } = require('express');
const router = Router();

const UsersService = require('../services/usersService');

router.post('/getUserByEmail', UsersService.getUserByEmail);

module.exports = router;
