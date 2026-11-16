// Staff «Reservas»: the list grouped by what each booking needs next, its
// filters, and the shared ReservaDetalle panel where a booking is managed:
// contract type (beca → Anexo III, locked once an annex of one family is under
// review), tutor, confirm (with confirmation), cancel (with a reason),
// reassign (to a new pending attempt) and linked attempts.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import Reservas from "./Reservas.jsx";
import { grupoDe } from "./ReservasLista.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";

vi.mock("../../hooks/useConvocatoriaEstado.js", () => ({
  useConvocatoriaEstado: () => ({ status: "ready", data: { activa: { nombre: "2026/2027" } }, error: null }),
}));

beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(); return 0; });
  iniciarSesion({ id: 2, rol: "COORDINADOR", nombre: "Coord" });
});

const anexo = (estado_operativo) => ({ anexo: { estado_operativo } });
const fila = (id, extra) => ({
  id_reserva: id, alumno: `Alumno ${id}`, dni_alumno: `${id}Z`, empresa: "ACME", especialidad: "Joyería",
  convocatoria: "2026/2027", convocatoria_activa: 1, estado_reserva: "PENDIENTE", documentos_resumen: null, ...extra,
});

test("grupoDe: each booking falls in the group of what it needs next", () => {
  expect(grupoDe(fila(1, { estado_reserva: "CONFIRMADA" }))).toBe("definitivas");
  expect(grupoDe(fila(1, { estado_reserva: "CANCELADA" }))).toBe("canceladas");
  expect(grupoDe(fila(1))).toBe("sinTipo");
  expect(grupoDe(fila(1, { documentos_resumen: anexo("VALIDADO") }))).toBe("listas");
  expect(grupoDe(fila(1, { documentos_resumen: anexo("PENDIENTE_VALIDACION") }))).toBe("revisar");
  expect(grupoDe(fila(1, { documentos_resumen: anexo("PENDIENTE_FIRMA") }))).toBe("firmas");
  expect(grupoDe(fila(1, { documentos_resumen: anexo("RECHAZADO") }))).toBe("documento");
  expect(grupoDe(fila(1, { documentos_resumen: anexo("PENDIENTE_SUBIDA") }))).toBe("documento");
});

describe("list", () => {
  test("load error with retry", async () => {
    let fallar = true;
    simularApi({ "GET /reservas": () => (fallar ? { status: 500, body: { error: "Caído" } } : [fila(1)]) });
    renderPagina(<Reservas />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Caído");
    fallar = false;
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Alumno 1")).toBeInTheDocument();
  });

  test("no bookings at all", async () => {
    simularApi({ "GET /reservas": [] });
    renderPagina(<Reservas />);
    expect(await screen.findByText("Todavía no hay reservas.")).toBeInTheDocument();
  });

  test("groups in a fixed order with counts; past convocatorias hidden until asked", async () => {
    simularApi({
      "GET /reservas": [
        fila(1, { estado_reserva: "CONFIRMADA" }),
        fila(2, { documentos_resumen: anexo("PENDIENTE_VALIDACION") }),
        fila(3, { documentos_resumen: anexo("PENDIENTE_VALIDACION") }),
        fila(4, { convocatoria: "2025/2026", convocatoria_activa: 0, estado_reserva: "CANCELADA" }),
      ],
    });
    renderPagina(<Reservas />);
    await screen.findByText("Alumno 1");
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual(["Anexo pendiente de validar (2)", "Confirmadas (1)"]);
    expect(screen.queryByText("Alumno 4")).toBeNull();
    fireEvent.change(screen.getByLabelText("Convocatoria"), { target: { value: "todas" } });
    expect(await screen.findByText("Alumno 4")).toBeInTheDocument();
  });

  test("a search with no match offers to clear the filters", async () => {
    simularApi({ "GET /reservas": [fila(1)] });
    renderPagina(<Reservas />, { ruta: "/reservas?q=zzz" });
    const vacio = await screen.findByText("No hay reservas que coincidan con la búsqueda o los filtros.");
    fireEvent.click(within(vacio).getByRole("button", { name: "Quitar filtros" }));
    expect(await screen.findByText("Alumno 1")).toBeInTheDocument();
  });

  test("with no booking in the active convocatoria every booking shows", async () => {
    simularApi({ "GET /reservas": [fila(1, { convocatoria_activa: 0, convocatoria: "2025/2026" })] });
    renderPagina(<Reservas />);
    expect(await screen.findByText("Alumno 1")).toBeInTheDocument();
  });

  test("the dashboard link ?grupo= filters by group; search covers the tutor", async () => {
    simularApi({
      "GET /reservas": [
        fila(1, { documentos_resumen: anexo("PENDIENTE_FIRMA"), tutor_nombre: "Rosa Tutora" }),
        fila(2),
      ],
    });
    renderPagina(<Reservas />, { ruta: "/reservas?grupo=firmas" });
    expect(await screen.findByText("Alumno 1")).toBeInTheDocument();
    expect(screen.queryByText("Alumno 2")).toBeNull();
    expect(screen.getByText(/Tutor: Rosa Tutora/)).toBeInTheDocument();
  });
});

// ── The booking panel ───────────────────────────────────────────────────

const TIPOS = [
  { id_tipo_contrato: 1, nombre: "BECA", nombre_mostrar: "Beca" },
  { id_tipo_contrato: 2, nombre: "CONTRATO_DE_FORMACION_EN_ALTERNANCIA", nombre_mostrar: "Contrato de formación en alternancia" },
];
const reserva = (extra) => ({
  id_reserva: 1, id_solicitud_alumno: 10, alumno: "Alumno 1", dni: "1Z", empresa: "ACME", id_empresa: 100,
  especialidad: "Joyería", convocatoria: "2026/2027", convocatoria_activa: 1, estado_reserva: "PENDIENTE",
  id_tipo_contrato: null, tipo_contrato: null, anexo_clave: null, id_empresa_tutor: null, tutor_nombre: null, ...extra,
});
const detalle = (r, acciones = {}, extra = {}) => ({ reserva: reserva(r), acciones, documentos: [], historial: [], relacionadas: [], ...extra });
const TODO = {
  confirmar: { permitido: true }, cancelar: { permitido: true, via: "cancelar-admin" }, reasignar: { permitido: true },
  cambiar_tipo: { permitido: true }, asignar_tutor: { permitido: true },
};

async function abrir(rutas) {
  const api = simularApi({ "GET /reservas": [fila(1)], "GET /tiposContrato": TIPOS, "GET /tutores/empresa/:id": [], ...rutas });
  renderPagina(<Reservas />);
  fireEvent.click(await screen.findByRole("button", { name: "Gestionar la reserva de Alumno 1 en ACME" }));
  const panel = await screen.findByRole("dialog", { name: "Alumno 1 · ACME" });
  return { ...api, panel };
}

describe("panel", () => {
  test.each([
    [403, "No tienes acceso a esta reserva.", false],
    [404, "No se pudo cargar la reserva.", false],
    [500, "No se pudo cargar la reserva.", true],
  ])("panel load error %i: «%s», retry offered: %s", async (status, texto, reintentar) => {
    simularApi({ "GET /reservas": [fila(1)], "GET /reservas/:id/detalle": { status, body: { error: "x" } } });
    renderPagina(<Reservas />);
    fireEvent.click(await screen.findByRole("button", { name: "Gestionar la reserva de Alumno 1 en ACME" }));
    const panel = await screen.findByRole("dialog", { name: "Reserva" });
    expect(await within(panel).findByText(texto)).toBeInTheDocument();
    expect(Boolean(within(panel).queryByRole("button", { name: "Reintentar" }))).toBe(reintentar);
  });

  test("without a contract type: explains the annex appears later; read-only roles see «Sin indicar»", async () => {
    const { panel } = await abrir({ "GET /reservas/:id/detalle": detalle({}, {}) });
    expect(within(panel).getByText("El Anexo II o III aparece cuando se indica el tipo de contrato.")).toBeInTheDocument();
    expect(within(panel).getByText("Sin indicar")).toBeInTheDocument();
    expect(within(panel).getByText(/El centro indicará el tipo de contrato/)).toBeInTheDocument();
    expect(within(panel).getByText("Sin tutor asignado")).toBeInTheDocument();
    expect(within(panel).getByText("No hay documentos visibles para tu perfil.")).toBeInTheDocument();
    for (const b of ["Confirmar reserva", "Cancelar reserva", "Reasignar"]) {
      expect(within(panel).queryByRole("button", { name: b })).toBeNull();
    }
  });

  test("setting the contract type saves it and reloads; a refusal puts the old value back", async () => {
    let n = 0;
    const { llamadas, panel } = await abrir({
      "GET /reservas/:id/detalle": () => detalle({ id_tipo_contrato: n ? 1 : null, tipo_contrato: n ? "BECA" : null }, TODO),
      "POST /reservas/1/tipo-contrato": () => (n++ === 0 ? {} : { status: 400, body: { error: "Hay que rechazar antes ese documento." } }),
    });
    const select = within(panel).getByLabelText("Tipo de contrato");
    await within(panel).findByRole("option", { name: "Beca" });
    fireEvent.change(select, { target: { value: "1" } });
    expect(await screen.findByText(/Tipo de contrato guardado/)).toBeInTheDocument();
    expect(llamadas.find((l) => l.path === "/reservas/1/tipo-contrato").body).toEqual({ id_tipo_contrato: 1 });
    await waitFor(() => expect(select).toHaveValue("1"));
    fireEvent.change(select, { target: { value: "2" } });
    expect(await screen.findByText("Hay que rechazar antes ese documento.")).toBeInTheDocument();
    await waitFor(() => expect(select).toHaveValue("1"));
  });

  test("an annex under review locks the other family", async () => {
    const { panel } = await abrir({
      "GET /reservas/:id/detalle": detalle(
        { id_tipo_contrato: 1, tipo_contrato: "BECA", anexo_clave: "ANEXO_III" },
        { ...TODO, cambio_familia: { permitido: false, motivo: "El Anexo III está en revisión: recházalo antes de cambiar de familia." } },
      ),
    });
    const otra = await within(panel).findByRole("option", { name: /Contrato de formación en alternancia \(no disponible\)/ });
    expect(otra).toBeDisabled();
    expect(within(panel).getByRole("option", { name: "Beca" })).not.toBeDisabled();
    expect(within(panel).getByText(/recházalo antes de cambiar de familia/)).toBeInTheDocument();
  });

  test("tutor: active tutors offered, an inactive current one shown disabled; assign and remove", async () => {
    const { llamadas, panel } = await abrir({
      "GET /reservas/:id/detalle": detalle({ id_empresa_tutor: 9, tutor_nombre: "Antiguo" }, TODO),
      "GET /tutores/empresa/:id": [{ id_empresa_tutor: 3, nombre: "Rosa" }],
      "PATCH /reservas/1/tutor": {},
    });
    const select = within(panel).getByLabelText("Tutor de empresa");
    expect(await within(panel).findByRole("option", { name: "Rosa" })).toBeInTheDocument();
    expect(within(panel).getByRole("option", { name: "Antiguo (inactivo)" })).toBeDisabled();
    expect(llamadas.find((l) => l.path === "/tutores/empresa/100").url).toContain("activo=1");
    fireEvent.change(select, { target: { value: "3" } });
    expect(await screen.findByText("Tutor asignado.")).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "" } });
    expect(await screen.findByText("Tutor retirado de la reserva.")).toBeInTheDocument();
    const patches = llamadas.filter((l) => l.method === "PATCH").map((l) => l.body);
    expect(patches).toEqual([{ id_empresa_tutor: 3 }, { id_empresa_tutor: null }]);
  });

  test("a refused tutor change puts the old tutor back", async () => {
    const { panel } = await abrir({
      "GET /reservas/:id/detalle": detalle({}, TODO),
      "GET /tutores/empresa/:id": [{ id_empresa_tutor: 3, nombre: "Rosa" }],
      "PATCH /reservas/1/tutor": { status: 400, body: { error: "El tutor debe ser de la misma empresa." } },
    });
    const select = within(panel).getByLabelText("Tutor de empresa");
    await within(panel).findByRole("option", { name: "Rosa" });
    fireEvent.change(select, { target: { value: "3" } });
    expect(await screen.findByText("El tutor debe ser de la misma empresa.")).toBeInTheDocument();
    await waitFor(() => expect(select).toHaveValue(""));
  });

  test("confirm asks first, sends no contract type and reloads panel and list", async () => {
    const { llamadas, panel } = await abrir({
      "GET /reservas/:id/detalle": detalle({ tipo_contrato: "BECA", id_tipo_contrato: 1 }, TODO),
      "POST /reservas/1/confirmar": { message: "Reserva confirmada. Se han cancelado 2 reservas pendientes." },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Confirmar reserva" }));
    const pregunta = await screen.findByRole("dialog", { name: "Confirmar reserva" });
    expect(pregunta).toHaveTextContent("Sus otras reservas pendientes se cancelarán");
    fireEvent.click(within(pregunta).getByRole("button", { name: "Confirmar reserva" }));
    expect(await screen.findByText("Reserva confirmada. Se han cancelado 2 reservas pendientes.")).toBeInTheDocument();
    expect(llamadas.find((l) => l.path === "/reservas/1/confirmar").body).toEqual({});
    await waitFor(() => expect(llamadas.filter((l) => l.path === "/reservas").length).toBe(2));
  });

  test("a refused confirmation (missing signatures) shows the reason", async () => {
    const { panel } = await abrir({
      "GET /reservas/:id/detalle": detalle({}, TODO),
      "POST /reservas/1/confirmar": { status: 400, body: { error: "Falta validar el Anexo II." } },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Confirmar reserva" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Confirmar reserva" })).getByRole("button", { name: "Confirmar reserva" }));
    expect(await screen.findByText("Falta validar el Anexo II.")).toBeInTheDocument();
  });

  test("a confirmed booking offers no confirm button", async () => {
    const { panel } = await abrir({ "GET /reservas/:id/detalle": detalle({ estado_reserva: "CONFIRMADA" }, TODO) });
    expect(within(panel).queryByRole("button", { name: "Confirmar reserva" })).toBeNull();
    expect(within(panel).getByRole("button", { name: "Reasignar" })).toBeInTheDocument();
  });

  test("cancel needs a reason and uses the route the backend gives", async () => {
    const { llamadas, panel } = await abrir({
      "GET /reservas/:id/detalle": detalle({}, { cancelar: { permitido: true, via: "cancelar" } }),
      "POST /reservas/1/cancelar": {},
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Cancelar reserva" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cancelar reserva" });
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la cancelación/), { target: { value: "Renuncia" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar reserva" }));
    expect(await screen.findByText("Reserva cancelada.")).toBeInTheDocument();
    expect(llamadas.find((l) => l.path === "/reservas/1/cancelar").body).toEqual({ motivo: "Renuncia" });
  });

  test("a cancelled booking is read-only and shows its reason", async () => {
    const { panel } = await abrir({ "GET /reservas/:id/detalle": detalle({ estado_reserva: "CANCELADA", motivo: "No se presentó" }, {}) });
    expect(within(panel).getByText("La reserva está cancelada: sus documentos solo se pueden consultar.")).toBeInTheDocument();
    expect(within(panel).getByText("No se presentó")).toBeInTheDocument();
  });

  test("reassign: picks a destination, needs a reason, then shows the new attempt", async () => {
    const { llamadas, panel } = await abrir({
      "GET /reservas/:id/detalle": (req) => (req.path === "/reservas/1/detalle"
        ? detalle({ estado_reserva: "CONFIRMADA" }, TODO)
        : detalle({ id_reserva: 2, empresa: "Beta", estado_reserva: "PENDIENTE" }, TODO, {
          relacionadas: [{ id_reserva: 1, relacion: "REASIGNADA_DESDE", empresa: "ACME", estado_reserva: "CANCELADA" }],
        })),
      "GET /reservas/ofertas-elegibles": [
        { id_solicitud_empresa_especialidad: 30, empresa: "Beta", especialidad: "Joyería", plazas_disponibles: 1 },
        { id_solicitud_empresa_especialidad: 31, empresa: "Gamma", especialidad: "Joyería", plazas_disponibles: 3 },
      ],
      "POST /reservas/1/reasignar": { id_reserva: 2, message: "Alumno reasignado a Beta." },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Reasignar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Reasignar alumno" });
    expect(dialogo).toHaveTextContent("La plaza confirmada se cancelará");
    expect(await within(dialogo).findByRole("option", { name: "Beta · Joyería (1 plaza)" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("option", { name: "Gamma · Joyería (3 plazas)" })).toBeInTheDocument();
    expect(llamadas.find((l) => l.path === "/reservas/ofertas-elegibles").url).toContain("reasignar_desde=1");
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la reasignación/), { target: { value: "Cambio" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reasignar" }));
    expect(await screen.findByText("Alumno reasignado a Beta.")).toBeInTheDocument();
    expect(llamadas.find((l) => l.path === "/reservas/1/reasignar").body).toEqual({ id_solicitud_empresa_especialidad: 30, motivo: "Cambio" });
    expect(await screen.findByRole("dialog", { name: "Alumno 1 · Beta" })).toBeInTheDocument();
    expect(screen.getByText("Reasignada desde")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver la reserva de ACME (Reasignada desde)" }));
    expect(await screen.findByRole("dialog", { name: "Alumno 1 · ACME" })).toBeInTheDocument();
  });

  test("reassign with no destination cannot be sent", async () => {
    const { panel } = await abrir({
      "GET /reservas/:id/detalle": detalle({}, TODO),
      "GET /reservas/ofertas-elegibles": [],
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Reasignar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Reasignar alumno" });
    expect(await within(dialogo).findByText(/No hay otras ofertas/)).toBeInTheDocument();
    expect(dialogo).toHaveTextContent("Esta reserva se cancelará");
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la reasignación/), { target: { value: "x" } });
    expect(within(dialogo).getByRole("button", { name: "Reasignar" })).toBeDisabled();
  });

  test("document history lists earlier and legacy versions", async () => {
    const { panel } = await abrir({
      "GET /reservas/:id/detalle": detalle({}, {}, {
        historial: [
          { id_documento: 50, nombre: "Anexo II", motivo_historial: "LEGACY", estado_validacion: "VALIDADO", tiene_archivo: true },
          { id_documento: 51, nombre: "Anexo III", estado_validacion: "RECHAZADO", tiene_archivo: false },
        ],
      }),
    });
    expect(within(panel).getByText("Documento del procedimiento anterior")).toBeInTheDocument();
    expect(within(panel).getByText("Versión anterior, ya no vigente")).toBeInTheDocument();
    expect(within(panel).getAllByRole("button", { name: "Ver" })).toHaveLength(1);
  });
});
