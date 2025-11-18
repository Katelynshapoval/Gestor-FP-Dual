const { Router } = require('express');
const router = Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const CompanyRequestService = require('../services/companyRequestService.js');

router.post('/addCompanyRequest', upload.none(), CompanyRequestService.addCompanyRequest);
router.post('/updateConvenio/:id', upload.single('convenio'), CompanyRequestService.addConvenio);

module.exports = router;