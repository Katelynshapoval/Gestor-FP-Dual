const { Router } = require("express");
const multer = require("multer");

const router = Router();
// Documentos de reserva en memoria para no dejar archivos en disco
const upload = multer({ storage: multer.memoryStorage() });

const LinkingService = require("../services/linkingService.js");
const ReservasService = require("../services/reservasService.js");

// Listado de peticiones de alumnos (admin/tutor/empresa)
router.post("/linkStudents", LinkingService.showStudentRequests);

// Correo de información a la empresa
router.post("/sendMail", LinkingService.sendMail);

// Peticiones de empresas
router.post("/getCompanyRequests", LinkingService.getCompanyRequests);
router.post("/getCompanyIdByEmail", LinkingService.getCompanyIdByEmail);

// Asignación de empresa por slot (solo admin/tutor)
router.post("/updateCompany1", LinkingService.updateCompany1);
router.post("/updateCompany2", LinkingService.updateCompany2);
router.post("/updateCompany3", LinkingService.updateCompany3);

// Reservas de alumnos: crear y cancelar
router.post("/reserveStudent", LinkingService.reserveStudent);
router.post("/unreserveStudent", LinkingService.unreserveStudent);

// Reservas: vista empresa (mis reservas + subida de doc firmado)
router.post("/getMyReservations", ReservasService.getMyReservations);
router.post(
  "/reservationDoc/:idGestion",
  upload.single("documento"),
  ReservasService.uploadReservationDoc,
);

// Reservas: documento firmado (empresa o admin)
router.get(
  "/reservationDoc/:idGestion/:idAuxEmpresa",
  ReservasService.getReservationDoc,
);

// Reservas: listado completo para admin
router.get("/getAllReservations", ReservasService.getAllReservations);

// Documentos adjuntos de gestiondual
router.get("/linkStudents/:id/cv", LinkingService.getCvDoc);
router.get("/linkStudents/:id/anexo2", LinkingService.getAnexo2Doc);
router.get("/linkStudents/:id/anexo3", LinkingService.getAnexo3Doc);
router.get("/linkStudents/:id/:type/validate", LinkingService.validate);

module.exports = router;
