// Staff management pages: staff accounts (create with a temporary password
// shown once, edit, deactivate/reactivate, never one's own), convocatorias
// (create, edit only future ones) and the dashboard (counts and links).
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import Personal from "./Personal/Personal.jsx";
import Convocatorias from "./Convocatorias/Convocatorias.jsx";
import Panel from "./Panel/Panel.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../testUtils";

beforeEach(() => iniciarSesion({ id: 1, rol: "ADMINISTRADOR", nombre: "Admin" }));

// ── Staff accounts ──────────────────────────────────────────────────────────

const PERSONAL = [
  { id_usuario: 1, nombre_mostrar: "Admin", email: "admin@centro.test", rol: "ADMINISTRADOR", activo: 1 },
  { id_usuario: 2, nombre_mostrar: "Marta", email: "marta@centro.test", rol: "COORDINADOR", activo: 1 },
  { id_usuario: 3, nombre_mostrar: "Pablo", email: "pablo@centro.test", rol: "COORDINADOR", activo: 0 },
];

describe("staff accounts", () => {
  test("creating an account shows its temporary password once, then hides it", async () => {
    vi.useFakeTimers();
    const { llamadas } = simularApi({
      "GET /usuarios/personal": PERSONAL,
      "POST /usuarios/personal": { usuario: { nombre_mostrar: "Nuevo" }, newPassword: "clave-temporal-de-prueba" },
    });
    renderPagina(<Personal />);
    await screen.findByText("Marta");
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Nuevo" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "nuevo@centro.test" } });
    fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "ADMINISTRADOR" } });
    fireEvent.click(screen.getByRole("button", { name: "Dar de alta" }));
    expect(await screen.findByText("clave-temporal-de-prueba")).toBeInTheDocument();
    expect(llamadas.find((l) => l.method === "POST").body).toEqual({ nombre: "Nuevo", email: "nuevo@centro.test", rol: "ADMINISTRADOR" });
    expect(screen.getByLabelText("Nombre")).toHaveValue("");
    act(() => vi.advanceTimersByTime(2 * 60 * 1000 + 10));
    expect(screen.queryByText("clave-temporal-de-prueba")).toBeNull();
    vi.useRealTimers();
  });

  test("a refused creation shows the server's reason", async () => {
    simularApi({ "GET /usuarios/personal": PERSONAL, "POST /usuarios/personal": { status: 409, body: { error: "Ese email ya tiene cuenta." } } });
    renderPagina(<Personal />);
    await screen.findByText("Marta");
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "marta@centro.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Dar de alta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese email ya tiene cuenta.");
  });

  test("one's own account cannot be deactivated; others can, after confirming", async () => {
    const { llamadas } = simularApi({ "GET /usuarios/personal": PERSONAL, "POST /usuarios/personal/2/baja": {}, "POST /usuarios/personal/3/reactivar": {} });
    renderPagina(<Personal />);
    await screen.findByText("Marta");
    expect(screen.getByText("(tú)")).toBeInTheDocument();
    const bajas = screen.getAllByRole("button", { name: "Dar de baja" });
    expect(bajas).toHaveLength(1, "only Marta: Admin is oneself, Pablo is already inactive");
    fireEvent.click(bajas[0]);
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("La cuenta de Marta dejará de poder entrar");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Dar de baja" }));
    await waitFor(() => expect(llamadas.some((l) => l.path === "/usuarios/personal/2/baja")).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Reactivar" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Reactivar" }));
    await waitFor(() => expect(llamadas.some((l) => l.path === "/usuarios/personal/3/reactivar")).toBe(true));
  });

  test("cancelling the confirmation changes nothing", async () => {
    const { llamadas } = simularApi({ "GET /usuarios/personal": PERSONAL });
    renderPagina(<Personal />);
    await screen.findByText("Marta");
    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(llamadas.filter((l) => l.method === "POST")).toHaveLength(0);
  });

  test("editing sends name, email and role; one's own role is locked", async () => {
    const { llamadas } = simularApi({ "GET /usuarios/personal": PERSONAL, "PATCH /usuarios/personal/:id": {} });
    renderPagina(<Personal />);
    await screen.findByText("Marta");
    fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    expect(screen.getByLabelText("Rol", { selector: "#personal-1-rol" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[1]);
    fireEvent.change(screen.getByDisplayValue("Marta"), { target: { value: "Marta Gil" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(llamadas.some((l) => l.method === "PATCH")).toBe(true));
    expect(llamadas.find((l) => l.method === "PATCH")).toMatchObject({ path: "/usuarios/personal/2", body: { nombre: "Marta Gil", email: "marta@centro.test", rol: "COORDINADOR" } });
  });

  test("a load failure is shown", async () => {
    simularApi({ "GET /usuarios/personal": { status: 500, body: { error: "Caída" } } });
    renderPagina(<Personal />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Caída");
  });
});

// ── Convocatorias ───────────────────────────────────────────────────────────

const futura = `${new Date().getFullYear() + 1}-09-01`;
const CONVOCATORIAS = [
  { id_convocatoria: 7, nombre: "Próxima", fecha_inicio: `${futura}T00:00:00Z`, fecha_fin: `${new Date().getFullYear() + 2}-06-30`, activa: 0 },
  { id_convocatoria: 6, nombre: "Actual", fecha_inicio: "2026-09-01", fecha_fin: "2027-06-30", activa: 1 },
  { id_convocatoria: 5, nombre: "Pasada", fecha_inicio: "2025-09-01", fecha_fin: "2026-06-30", activa: 0 },
];

describe("convocatorias", () => {
  test("states and edit buttons: the future and the active convocatoria can be edited, a closed one cannot", async () => {
    simularApi({ "GET /convocatorias": CONVOCATORIAS });
    renderPagina(<Convocatorias />);
    await screen.findByText("Actual");
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("Próxima", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Cerrada")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Editar" })).toHaveLength(2);
  });

  test("mistakes are caught before sending, next to the form", async () => {
    const { llamadas } = simularApi({ "GET /convocatorias": CONVOCATORIAS });
    renderPagina(<Convocatorias />);
    await screen.findByText("Actual");
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Crear convocatoria" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe un nombre");
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "2030/2031" } });
    fireEvent.change(screen.getByLabelText("Fecha de inicio"), { target: { value: "2031-09-01" } });
    fireEvent.change(screen.getByLabelText("Fecha de fin"), { target: { value: "2030-06-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear convocatoria" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no puede ser posterior");
    expect(llamadas.some((l) => l.method === "POST")).toBe(false);
  });

  test("the active convocatoria can be corrected but must stay open today", async () => {
    const { llamadas } = simularApi({ "GET /convocatorias": CONVOCATORIAS, "PUT /convocatorias/6": {} });
    renderPagina(<Convocatorias />);
    await screen.findByText("Actual");
    fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[1]);
    const ayer = new Date(Date.now() - 864e5);
    const ayerIso = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, "0")}-${String(ayer.getDate()).padStart(2, "0")}`;
    fireEvent.change(screen.getByLabelText("Fecha fin"), { target: { value: ayerIso } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("seguir abierta hoy");
    expect(llamadas.some((l) => l.method === "PUT")).toBe(false);
  });

  test("creating sends name and dates and reloads; a refusal is shown", async () => {
    let respuesta = { status: 409, body: { error: "Las fechas se solapan con «Actual»." } };
    const { llamadas } = simularApi({ "GET /convocatorias": CONVOCATORIAS, "POST /convocatorias": () => respuesta });
    renderPagina(<Convocatorias />);
    await screen.findByText("Actual");
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "2028/2029" } });
    fireEvent.change(screen.getByLabelText("Fecha de inicio"), { target: { value: "2028-09-01" } });
    fireEvent.change(screen.getByLabelText("Fecha de fin"), { target: { value: "2029-06-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear convocatoria" }));
    expect(await screen.findByText(/se solapan/)).toBeInTheDocument();
    respuesta = { id_convocatoria: 8 };
    fireEvent.click(screen.getByRole("button", { name: "Crear convocatoria" }));
    await waitFor(() => expect(screen.getByLabelText("Nombre")).toHaveValue(""));
    expect(llamadas.filter((l) => l.method === "POST").at(-1).body).toEqual({ nombre: "2028/2029", fecha_inicio: "2028-09-01", fecha_fin: "2029-06-30" });
  });

  test("editing a future convocatoria sends the dates without time", async () => {
    const { llamadas } = simularApi({ "GET /convocatorias": CONVOCATORIAS, "PUT /convocatorias/7": {} });
    renderPagina(<Convocatorias />);
    await screen.findByText("Actual");
    fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    expect(screen.getByLabelText("Fecha inicio")).toHaveValue(futura);
    fireEvent.change(screen.getByDisplayValue("Próxima"), { target: { value: "Próxima 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(llamadas.some((l) => l.method === "PUT")).toBe(true));
    expect(llamadas.find((l) => l.method === "PUT").body).toMatchObject({ nombre: "Próxima 2", fecha_inicio: futura });
  });
});

// ── Dashboard ───────────────────────────────────────────────────────────────

const RESUMEN = {
  convocatoria: { id_convocatoria: 6, nombre: "2026/2027", activa: 1 },
  convocatorias: [{ id_convocatoria: 6, nombre: "2026/2027", activa: 1 }, { id_convocatoria: 5, nombre: "2025/2026", activa: 0 }],
  contadores: {
    solicitudes_alumno_pendientes: 3, solicitudes_empresa_pendientes: 0, documentos_accion_centro: 1, cambios_empresa_pendientes: 2,
    reservas: { revisar: 1, listas: 0, sinTipo: 2, firmas: 0, documento: 4 },
  },
};

describe("dashboard", () => {
  test("each task links to its list already filtered; empty ones say «Al día»", async () => {
    simularApi({ "GET /panel/resumen": RESUMEN });
    renderPagina(<Panel />);
    const alumnos = await screen.findByRole("link", { name: /3 solicitudes de alumnos por revisar/ });
    expect(alumnos).toHaveAttribute("href", "/alumnos?convocatoria=2026%2F2027&estado=PENDIENTE");
    expect(screen.getByRole("link", { name: /1 documento espera al centro/ })).toHaveAttribute("href", "/documentos?convocatoria=6&accionPendiente=CENTRO");
    expect(screen.getAllByText("Al día").length).toBeGreaterThan(0);
  });

  test("changing convocatoria asks for its counts; a failure can be retried", async () => {
    let fallos = 1;
    const { llamadas } = simularApi({ "GET /panel/resumen": () => (fallos-- > 0 ? { status: 500, body: { error: "Caída" } } : RESUMEN) });
    renderPagina(<Panel />);
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    await screen.findByRole("link", { name: /3 solicitudes de alumnos/ });
    fireEvent.change(screen.getByLabelText("Convocatoria"), { target: { value: "5" } });
    await waitFor(() => expect(llamadas.at(-1).url).toBe("/panel/resumen?convocatoria=5"));
  });

  test("without any convocatoria it says so; only an administrator gets the link to create one", async () => {
    iniciarSesion({ id: 1, rol: "ADMINISTRADOR" });
    simularApi({ "GET /panel/resumen": { convocatoria: null, convocatorias: [] } });
    const { unmount } = renderPagina(<Panel />);
    expect(await screen.findByText("Todavía no hay ninguna convocatoria.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Convocatorias" })).toHaveAttribute("href", "/configuracion/convocatorias");
    unmount();

    iniciarSesion({ id: 2, rol: "COORDINADOR" });
    simularApi({ "GET /panel/resumen": { convocatoria: null, convocatorias: [] } });
    renderPagina(<Panel />);
    expect(await screen.findByText("Un administrador tiene que crearla.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ir a Convocatorias" })).toBeNull();
  });
});
