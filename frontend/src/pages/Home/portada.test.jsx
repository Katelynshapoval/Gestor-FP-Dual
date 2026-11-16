// Public landing page and the pieces around every page: the open/closed
// banner (and its one request per page load, retried after a failure), the
// session-ending warning, the page title, and small text helpers.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";
import { warnReducePending } from "../../utils/cupos.js";
import { avisoRegenerar, formatDocumentDate } from "../../utils/documentos.js";
import PageLayout from "../../components/layout/PageLayout.jsx";

const ACTIVA = { nombre: "2026/2027", fecha_inicio: "2026-09-01", fecha_fin: "2026-12-15" };

// useConvocatoriaEstado keeps one request per page load: fresh modules per
// test, so the router and session providers come from the same fresh set.
async function cargarHome() {
  vi.resetModules();
  const [{ default: Home }, { User }, rr] = await Promise.all([
    import("./Home.jsx"), import("../../context/UserContext"), import("react-router-dom"),
  ]);
  const Ruta = () => <span data-testid="ruta">{rr.useLocation().pathname}</span>;
  return () => render(
    <rr.MemoryRouter initialEntries={["/"]}>
      <User>
        <rr.Routes>
          <rr.Route path="/" element={<Home />} />
          <rr.Route path="*" element={<Ruta />} />
        </rr.Routes>
      </User>
    </rr.MemoryRouter>,
  );
}

describe("Home", () => {
  beforeEach(() => iniciarSesion(null));

  test("open convocatoria: both forms offered with their call to action", async () => {
    simularApi({ "GET /convocatorias/estado": { abierta: true, activa: ACTIVA } });
    const montar = await cargarHome();
    montar();
    expect(await screen.findByText(/Plazo abierto · convocatoria 2026\/2027/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Soy alumno o alumna/ })).toHaveAttribute("href", "/addDualStudent");
    expect(screen.getByRole("link", { name: /Soy una empresa/ })).toHaveTextContent("Solicitar plazas");
    expect(screen.getByRole("link", { name: /Acceder/ })).toHaveAttribute("href", "/login");
  });

  test("closed with a next convocatoria / with none: the forms say the period is closed", async () => {
    simularApi({ "GET /convocatorias/estado": { abierta: false, activa: null, proxima: { nombre: "2027/2028", fecha_inicio: "2027-09-01" } } });
    let montar = await cargarHome();
    const { unmount } = montar();
    expect(await screen.findByText(/La convocatoria 2027\/2028 abre el/)).toBeInTheDocument();
    expect(screen.getAllByText("Ver el formulario (plazo cerrado)")).toHaveLength(2);
    unmount();
    simularApi({ "GET /convocatorias/estado": { abierta: false, activa: null, proxima: null } });
    montar = await cargarHome();
    montar();
    expect(await screen.findByText("Todavía no hay fecha para la próxima convocatoria.")).toBeInTheDocument();
  });

  test("the status cannot be read: error with a retry that asks again", async () => {
    let fallar = true;
    const { llamadas } = simularApi({
      "GET /convocatorias/estado": () => (fallar ? { status: 500, body: {} } : { abierta: true, activa: ACTIVA }),
    });
    const montar = await cargarHome();
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo comprobar si el plazo");
    fallar = false;
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText(/Plazo abierto/)).toBeInTheDocument();
    expect(llamadas).toHaveLength(2);
  });

  test.each([
    ["ALUMNO", "/studentMain"],
    ["EMPRESA", "/companyMain"],
    ["COORDINADOR", "/panel"],
    ["ADMINISTRADOR", "/panel"],
  ])("signed in as %s goes to %s", async (rol, destino) => {
    iniciarSesion({ id: 1, rol });
    simularApi({ "GET /convocatorias/estado": { abierta: true, activa: ACTIVA } });
    const montar = await cargarHome();
    montar();
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent(destino));
  });
});

test("the convocatoria status is requested once for every component of the page", async () => {
  vi.resetModules();
  const { llamadas } = simularApi({ "GET /convocatorias/estado": { abierta: true, activa: ACTIVA } });
  const { useConvocatoriaEstado } = await import("../../hooks/useConvocatoriaEstado.js");
  const Uno = () => <span>{useConvocatoriaEstado().status}</span>;
  render(<><Uno /><Uno /><Uno /></>);
  await waitFor(() => expect(screen.getAllByText("ready")).toHaveLength(3));
  expect(llamadas).toHaveLength(1);
});

describe("SessionWarning", () => {
  afterEach(() => vi.useRealTimers());

  test("appears in the last 10 minutes of the session, counts down, and can be closed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
    localStorage.setItem("user", JSON.stringify({ data: { token: "t", id: 1, rol: "ALUMNO" }, expires: Date.now() + 15 * 60 * 1000 }));
    vi.resetModules();
    const { User } = await import("../../context/UserContext");
    const { default: SessionWarning } = await import("../../components/layout/SessionWarning.jsx");
    render(<MemoryRouter><User><SessionWarning /></User></MemoryRouter>);
    expect(screen.queryByRole("status")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 10));
    expect(screen.getByRole("status")).toHaveTextContent("(en 10 min)");
    await act(() => vi.advanceTimersByTimeAsync(4 * 60 * 1000));
    expect(screen.getByRole("status")).toHaveTextContent("(en 6 min)");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("PageLayout", () => {
  test("sets the page title and remembers the collapsed sidebar", async () => {
    iniciarSesion({ id: 2, rol: "COORDINADOR", nombre: "Coord" });
    simularApi({ "GET /convocatorias/estado": { abierta: true, activa: ACTIVA } });
    localStorage.setItem("fpdual.sidebarCollapsed", "true");
    renderPagina(<PageLayout><p>contenido</p></PageLayout>, { ruta: "/alumnos" });
    expect(screen.getByText("contenido")).toBeInTheDocument();
    expect(document.title).toBe("Alumnos · FP Dual Salesianos");
    expect(screen.getByRole("link", { name: "Saltar al contenido" })).toHaveAttribute("href", "#contenido");
    expect(localStorage.getItem("fpdual.sidebarCollapsed")).toBe("true");
  });
});

describe("text helpers", () => {
  test("warnReducePending: singular, plural and a missing count", () => {
    expect(warnReducePending(3, 2, 1)).toBe("Al reducir de 3 a 2 plazas se cancelarán 1 reserva pendiente. Las reservas confirmadas no se modificarán.");
    expect(warnReducePending(5, 2, 3)).toMatch(/3 reservas pendientes/);
    expect(warnReducePending(5, 2, undefined)).toMatch(/0 reservas pendientes/);
  });

  test("avisoRegenerar: nobody, one and several signers", () => {
    expect(avisoRegenerar()).toBe("Se creará una nueva versión del documento.");
    expect(avisoRegenerar([{ estado: "SIN_FIRMAR", rol: "ALUMNO" }])).toBe("Se creará una nueva versión del documento.");
    expect(avisoRegenerar([{ estado: "FIRMADO", rol_label: "Empresa" }])).toBe(
      "Ya ha firmado: Empresa. Se creará una nueva versión y esas firmas dejarán de valer: tendrá que volver a firmar.",
    );
    expect(avisoRegenerar([
      { estado: "FIRMADO", rol_label: "Alumno" }, { estado: "FIRMADO", rol: "TUTOR" }, { estado: "FIRMADO", rol_label: "Empresa" },
    ])).toBe("Ya han firmado: Alumno, TUTOR y Empresa. Se creará una nueva versión y esas firmas dejarán de valer: tendrán que volver a firmar.");
  });

  test("formatDocumentDate: empty and invalid give null", () => {
    expect(formatDocumentDate(null)).toBeNull();
    expect(formatDocumentDate("nope")).toBeNull();
    expect(formatDocumentDate("2026-11-16T10:30:00Z")).toMatch(/16\/11\/2026/);
  });
});
