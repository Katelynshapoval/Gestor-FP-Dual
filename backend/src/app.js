// The Express application, without starting the server: index.js listens and
// starts the schedulers; the HTTP tests (test/http.test.js) use this directly.
const express = require("express");
const morgan = require("morgan");

const routes = require("./routes");

const morganPath = (req) => (req.originalUrl || req.url).split("?")[0];
morgan.token("path", morganPath);

const app = express();

app.set("json spaces", 2);
app.disable("x-powered-by");

// SEC-007: trust X-Forwarded-For only for the number of proxies actually in
// front of the API (TRUST_PROXY=1 behind one reverse proxy). Never `true`:
// any client could then pick the IP the rate limiters see.
const trustProxy = parseInt(process.env.TRUST_PROXY, 10);
if (Number.isInteger(trustProxy) && trustProxy > 0) app.set("trust proxy", trustProxy);

// SEC-007: security headers on every API response. The API only serves JSON
// and files, so the CSP can deny everything.
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  });
  if (req.secure) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// SEC-007: outside development, log without the query string (it may carry
// identifiers or tokens); morgan escapes nothing, so keep the format fixed.
// Tests log nothing.
if (process.env.NODE_ENV !== "test") {
  app.use(
    process.env.NODE_ENV === "production"
      ? morgan(":remote-addr :method :path :status :res[content-length] - :response-time ms")
      : morgan("dev"),
  );
}
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(express.json({ limit: "100kb" }));
app.use(routes);

// Body parser errors (malformed JSON, a body over 100 KB) come before the
// routes: answer them in JSON too, instead of Express's HTML page with a stack trace.
app.use((err, _req, res, next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la petición no es un JSON válido." });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "La petición es demasiado grande." });
  }
  return next(err);
});

module.exports = app;
