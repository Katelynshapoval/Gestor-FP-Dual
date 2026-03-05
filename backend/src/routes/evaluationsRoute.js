const { Router } = require('express');
const router = Router();

const EvaluationService = require('../services/evaluationService.js');

router.post("/getEvaluationByManagementId", EvaluationService.getEvaluationByManagementId);
router.post("/createEvaluation", EvaluationService.createEvaluation);
router.post("/updateEvaluation", EvaluationService.updateEvaluation);

module.exports = router;