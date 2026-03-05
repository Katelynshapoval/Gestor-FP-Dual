const { Router } = require('express');
const router = Router();

const PreferencesService = require('../services/preferencesService');

router.post('/getPreferencesBySpeciality', PreferencesService.getPreferencesBySpeciality);

module.exports = router;