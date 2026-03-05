const { Router } = require('express');
const router = Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const DualStudentsService = require('../services/dualStudentsService');

router.post('/addStudent', upload.fields([
    { name: 'doc', maxCount: 1 },
    { name: 'cv', maxCount: 1 }
  ]), DualStudentsService.addStudent);

module.exports = router;