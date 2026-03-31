const { Router } = require("express");
const router = Router();
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const CompanyRequestService = require("../services/companyRequestService.js");

// Ruta pública: la empresa envía su solicitud de participación
router.post(
  "/addCompanyRequest",
  upload.none(),
  CompanyRequestService.addCompanyRequest,
);

// Ruta pública: la empresa carga el convenio firmado (ID ofuscado)
router.post(
  "/updateConvenio/:id",
  upload.single("convenio"),
  CompanyRequestService.addConvenio,
);

// Ruta pública: obtener datos de empresa por email (CompanyView)
router.post(
  "/getCompanyDataByEmail",
  CompanyRequestService.getCompanyDataByEmail,
);

// Rutas de administración
router.get("/getAllCompanies", CompanyRequestService.getAllCompanies);
router.get("/getConvenioFile/:id", CompanyRequestService.getConvenioFile);
router.post("/validateConvenio/:id", CompanyRequestService.validateConvenio);
router.post("/resetPassword/:id", CompanyRequestService.resetPassword);

module.exports = router;
