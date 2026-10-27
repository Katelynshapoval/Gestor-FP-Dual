require("dotenv").config();

const express = require("express");
const morgan = require("morgan");

const { assertJwtConfig } = require("./middleware/auth");

// Refuse to start without a strong JWT secret (no hard-coded fallback).
try {
  assertJwtConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const routes = require("./routes");

const app = express();
const PORT = process.env.PORT || 3001;

app.set("json spaces", 2);
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(routes);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  // WF-3: keep dual_convocatorias.activa in line with today's date
  require("./services/convocatoriasService").startConvocatoriaScheduler();
});
