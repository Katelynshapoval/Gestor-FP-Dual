const { Router } = require("express");
const multer = require("multer");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");
const { createLoginRateLimiter } = require("../middleware/loginRateLimit");
const svc = require("../services/firmasService");

const router = Router();

// Signature images are small PNGs; the service checks the content.
const imagen = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: svc.MAX_BYTES.CENTRO, files: 1 },
}).single("imagen");

// Phone sessions are public (the registration form uses them before an
// account exists): 20 per IP every 15 minutes.
const limiteSesiones = createLoginRateLimiter({ windowMs: 15 * 60 * 1000, maxPerIdentifier: Infinity, maxPerIp: 20 });
function limitarSesiones(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const wait = limiteSesiones.retryAfter(ip, "");
  if (wait > 0) {
    res.set("Retry-After", String(wait));
    return res.status(429).json({ error: "Has pedido demasiados códigos. Inténtalo más tarde.", code: "TOO_MANY_ATTEMPTS" });
  }
  limiteSesiones.recordFailure(ip, "");
  return next();
}

router.get("/firmas/mia", requireAuth, asyncHandler(svc.getMia));
router.put("/firmas/mia", requireAuth, requireRole("ALUMNO", "EMPRESA"), imagen, asyncHandler(svc.putMia));
router.delete("/firmas/mia", requireAuth, requireRole("ALUMNO", "EMPRESA"), asyncHandler(svc.deleteMia));
router.put("/firmas/centro", requireAuth, requireRole("ADMINISTRADOR"), imagen, asyncHandler(svc.putCentro));

// Phone hand-off. `movil` routes first: `:id` would match the word.
router.post("/firmas/sesiones", limitarSesiones, asyncHandler(svc.crearSesion));
router.get("/firmas/sesiones/movil", asyncHandler(svc.estadoMovil));
router.post("/firmas/sesiones/movil", imagen, asyncHandler(svc.enviarMovil));
router.get("/firmas/sesiones/:id", asyncHandler(svc.leerSesion));
router.delete("/firmas/sesiones/:id", asyncHandler(svc.cerrarSesion));

router.use((err, req, res, next) => {
  if (err.name === "MulterError") {
    return res.status(400).json({ error: "La imagen de la firma es demasiado grande." });
  }
  return next(err);
});

module.exports = router;
module.exports.limiteSesiones = limiteSesiones;
