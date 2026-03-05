const { Router } = require('express');
const router = Router();

const SpecialitiesService = require('../services/specialitiesService');

router.get('/getAllSpecialities', SpecialitiesService.getAllSpecialities);

module.exports = router;