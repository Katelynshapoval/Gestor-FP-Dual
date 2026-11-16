require("dotenv").config();

const { assertJwtConfig } = require("./middleware/auth");

// Refuse to start without a strong JWT secret (no hard-coded fallback).
try {
  assertJwtConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = require("./app");

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  // WF-3: keep dual_convocatorias.activa in line with today's date
  require("./services/convocatoriasService").startConvocatoriaScheduler();
  // Migration 022: every email the code can send needs a valid template.
  require("./services/correoPlantillas").verificar();
  // Migration 025: document types added by the centre.
  require("./services/tiposDocumento")
    .cargar()
    .then((n) => console.log(`[documentos] ${n} tipos de documento añadidos por el centro.`))
    .catch((err) => console.error("[documentos] No se pudieron cargar los tipos de documento:", err.message));
});
