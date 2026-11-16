// Help page: the manual the server sends for this visitor (chapters, profile
// cards only for chapters present, FAQ by role), search across FAQ and manual,
// moving between chapters (nav, select, links inside the manual, the URL
// hash), and a load error. Also the Documents page shell (tabs, summary).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import Ayuda from "./Ayuda.jsx";
import AdminDocumentsView from "../AdminDocumentsView/index.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";

vi.mock("../../hooks/useConvocatoriaEstado.js", () => ({
  useConvocatoriaEstado: () => ({ status: "ready", data: { activa: { id_convocatoria: 6, nombre: "2026/2027" } }, error: null }),
}));

const MANUAL = `# Manual de usuario

Introducción general.

<a id="introduccion"></a>

## 1. Introducción

FP Dual gestiona la Formación Profesional Dual. Ver [plazas](#plazas).

<a id="recuperar"></a>

### Recuperar la contraseña

Pulsa «¿Has olvidado tu contraseña?».

---

<a id="empresa"></a>

## 2. Manual de empresa

<a id="plazas"></a>

### Ciclos y plazas

Cada ciclo tiene un número de plazas.
`;

beforeEach(() => {
  window.history.replaceState(null, "", "/ayuda");
  iniciarSesion(null);
});

describe("Ayuda", () => {
  test("loads the manual: first chapter shown, only profile cards whose chapter exists", async () => {
    simularApi({ "GET /ayuda/manual": { markdown: MANUAL } });
    renderPagina(<Ayuda />);
    expect(await screen.findByText(/FP Dual gestiona la Formación Profesional Dual/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Empresa/ })).toHaveAttribute("href", "#empresa");
    expect(screen.queryByRole("link", { name: /^Administración/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "Preguntas frecuentes" })).toBeInTheDocument();
    expect(screen.getByText("He olvidado la contraseña")).toBeInTheDocument();
  });

  test("a load error is shown with a link back to Ayuda", async () => {
    simularApi({ "GET /ayuda/manual": { status: 500, body: { error: "No se ha podido cargar el manual." } } });
    renderPagina(<Ayuda />);
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No se ha podido cargar el manual.");
    expect(within(alerta).getByRole("link", { name: "Ayuda" })).toHaveAttribute("href", "/ayuda");
  });

  test("a profile card opens its chapter and updates the URL hash", async () => {
    simularApi({ "GET /ayuda/manual": { markdown: MANUAL } });
    renderPagina(<Ayuda />);
    await screen.findByText(/FP Dual gestiona/);
    fireEvent.click(screen.getByRole("link", { name: /^Empresa/ }));
    expect(await screen.findByText("Cada ciclo tiene un número de plazas.")).toBeInTheDocument();
    expect(window.location.hash).toBe("#empresa");
    expect(screen.queryByText(/FP Dual gestiona/)).toBeNull();
  });

  test("a link inside the manual to another chapter opens that chapter", async () => {
    simularApi({ "GET /ayuda/manual": { markdown: MANUAL } });
    renderPagina(<Ayuda />);
    await screen.findByText(/FP Dual gestiona/);
    fireEvent.click(screen.getByRole("link", { name: "plazas" }));
    expect(await screen.findByText("Cada ciclo tiene un número de plazas.")).toBeInTheDocument();
    expect(window.location.hash).toBe("#plazas");
  });

  test("the chapter select (phones) and the side nav move between chapters", async () => {
    simularApi({ "GET /ayuda/manual": { markdown: MANUAL } });
    renderPagina(<Ayuda />);
    await screen.findByText(/FP Dual gestiona/);
    fireEvent.change(screen.getByLabelText("Capítulo"), { target: { value: "empresa" } });
    expect(await screen.findByText("Cada ciclo tiene un número de plazas.")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Contenido de la ayuda" });
    expect(within(nav).getByRole("link", { name: /Manual de empresa/ })).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(nav).getByRole("link", { name: /Introducción/ }));
    expect(await screen.findByText(/FP Dual gestiona/)).toBeInTheDocument();
  });

  test("opening the page with a hash shows the chapter that holds it", async () => {
    window.history.replaceState(null, "", "/ayuda#plazas");
    simularApi({ "GET /ayuda/manual": { markdown: MANUAL } });
    renderPagina(<Ayuda />);
    expect(await screen.findByText("Cada ciclo tiene un número de plazas.")).toBeInTheDocument();
  });

  test("search finds FAQ answers and manual sections; nothing found says so; clearing restores the page", async () => {
    simularApi({ "GET /ayuda/manual": { markdown: MANUAL } });
    renderPagina(<Ayuda />);
    await screen.findByText(/FP Dual gestiona/);
    const buscar = screen.getByLabelText("Buscar en la ayuda");
    fireEvent.change(buscar, { target: { value: "plazas" } });
    expect(await screen.findByRole("heading", { name: "Resultados" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Empresa/ })).toBeNull();
    fireEvent.change(buscar, { target: { value: "xyzzy-nada" } });
    expect(await screen.findByText("Nada coincide con «xyzzy-nada»")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Borrar la búsqueda" }));
    expect(await screen.findByRole("heading", { name: "Preguntas frecuentes" })).toBeInTheDocument();
  });

  test("a student sees only the questions for students and everyone", async () => {
    iniciarSesion({ id: 4, rol: "ALUMNO" });
    simularApi({ "GET /ayuda/manual": { markdown: MANUAL } });
    renderPagina(<Ayuda />);
    await screen.findByText(/FP Dual gestiona/);
    expect(screen.queryByText("El correo de confirmación de la empresa no traía el convenio")).toBeNull();
    expect(screen.getByText("He olvidado la contraseña")).toBeInTheDocument();
  });
});

describe("Documents page shell", () => {
  beforeEach(() => iniciarSesion({ id: 1, rol: "ADMINISTRADOR" }));
  const rutas = {
    "GET /documentos/seguimiento": { items: [], total: 10, pendientes: 4, accionCentro: 2 },
    "GET /documentos/plantillas": [],
    "GET /documentos/pendientes-firma": { items: [] },
    "GET /firmas/mia": { firma: null },
    "GET /especialidades": [],
    "GET /convocatorias": [],
    "GET /tipos-documento": [],
  };

  test("defaults to the active convocatoria in the URL and shows the summary", async () => {
    simularApi(rutas);
    renderPagina(<AdminDocumentsView />, { ruta: "/documentos" });
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("convocatoria=6"));
    expect(screen.getByText("Documentos", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Acción del centro")).toBeInTheDocument();
  });

  test("keeps a convocatoria chosen in the URL", async () => {
    simularApi(rutas);
    renderPagina(<AdminDocumentsView />, { ruta: "/documentos?convocatoria=3" });
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("convocatoria=3"));
  });

  test("the Plantillas tab hides the summary", async () => {
    simularApi(rutas);
    renderPagina(<AdminDocumentsView />, { ruta: "/documentos" });
    fireEvent.click(await screen.findByRole("tab", { name: "Plantillas" }));
    await waitFor(() => expect(screen.queryByText("Acción del centro")).toBeNull());
  });
});
