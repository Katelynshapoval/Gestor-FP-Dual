const { Router } = require('express');
const router = Router();

const UsersService = require('../services/usersService');

router.post('/getUserByEmail', UsersService.getUserByEmail); 

/*
router.post('/addUser', UsersService.addUser); 
*/

module.exports = router;