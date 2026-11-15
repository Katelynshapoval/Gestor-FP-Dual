// Shared helpers for page tests: the real router, session and toast providers
// around a page, and a fake `fetch` that answers from a route table, so the
// pages' own request code (and utils/api.js) runs unchanged.
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { User } from "./context/UserContext";
import { ToastProvider } from "./components/feedback/ToastProvider.jsx";
import { FirmarDocumentosProvider } from "./components/firma/FirmarDocumentos.jsx";

// Logs a role in, as the app stores it after login.
export function iniciarSesion(user) {
  localStorage.clear();
  if (user) {
    localStorage.setItem("user", JSON.stringify({ data: { token: "t", ...user }, expires: Date.now() + 3600_000 }));
  }
}

// routes: { "GET /x": value | (req) => value | { status, body } }.
// A value that is { status, body } answers with that status; anything else is
// a 200 JSON body. Unknown routes answer 404 and are recorded in `noEncontradas`.
export function simularApi(routes = {}) {
  const llamadas = [];
  const noEncontradas = [];
  global.fetch = vi.fn(async (url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const path = String(url).split("?")[0];
    let body = options.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { /* keep text */ }
    }
    const req = { method, url: String(url), path, body, headers: options.headers || {} };
    llamadas.push(req);
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(" ");
      if (m !== method) return false;
      const re = new RegExp(`^${p.replace(/:[^/]+/g, "[^/]+")}$`);
      return re.test(path);
    });
    let out = key ? routes[key] : { status: 404, body: { error: "No encontrado" } };
    if (!key) noEncontradas.push(`${method} ${path}`);
    if (typeof out === "function") out = await out(req);
    const conEstado = out && typeof out === "object" && "status" in out && "body" in out;
    const status = conEstado ? out.status : 200;
    const json = conEstado ? out.body : out;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (h) => (h.toLowerCase() === "content-type" ? "application/json" : null) },
      json: async () => json,
      text: async () => JSON.stringify(json),
      blob: async () => new Blob([JSON.stringify(json)]),
    };
  });
  return { llamadas, noEncontradas };
}

function Ruta() {
  const location = useLocation();
  return <span data-testid="ruta">{location.pathname}{location.search}</span>;
}

// What the "Firmar documentos" dialog asks for: the caller's pending documents
// and saved signature. Spread it into simularApi's routes.
export const FIRMA_PRUEBA = { id_firma: 70, imagen: "data:image/png;base64,AAAA", creado_en: "2026-11-15T10:00:00Z", origen: "PANTALLA" };
export function rutasDeFirma(items, mia = { titular: "USUARIO", firma: FIRMA_PRUEBA, puede_cambiar: true }) {
  return {
    "GET /documentos/pendientes-firma": { items },
    "GET /firmas/mia": mia,
    "GET /documentos/:id/descargar": {},
  };
}
export const porFirmar = (extra) => ({
  id_documento: 5, clave: "ANEXO_II", nombre: "Anexo II", alumno: "Ana Ruiz", empresa: "ACME S.L.",
  firmas: [{ rol: "EMPRESA", rol_label: "Empresa", estado: "SIN_FIRMAR" }], marcas: {}, ...extra,
});

// Renders `ui` at `ruta` inside the app's providers. Other paths render a
// marker so redirects can be checked with `screen.getByTestId("ruta")`.
export function renderPagina(ui, { ruta = "/", patron = "*" } = {}) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <User>
        <ToastProvider>
          <FirmarDocumentosProvider>
            <Routes>
              <Route path={patron} element={<>{ui}<Ruta /></>} />
              <Route path="*" element={<Ruta />} />
            </Routes>
          </FirmarDocumentosProvider>
        </ToastProvider>
      </User>
    </MemoryRouter>,
  );
}
