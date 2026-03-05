const { Router } = require('express');
const router = Router();

const PossibleTransportsService = require('../services/possibleTransportsService.js');

router.get('/getAllPossibleTransports', PossibleTransportsService.getAllPossibleTransports);

module.exports = router;