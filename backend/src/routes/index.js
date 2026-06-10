const { Router } = require("express");

const router = Router();

router.use(require("./preferencesRoute"));
router.use(require("./usersRoute"));
router.use(require("./specialitiesRoute"));
router.use(require("./possibleTransportsRoute"));
router.use(require("./dualStudentsRoute"));
router.use(require("./companyRequestRoute"));
router.use(require("./evaluationsRoute"));
router.use(require("./linkingRoute"));

module.exports = router;
