// The «Alumnos» page as each role sees it: staff review applications
// (validate only with the required documents validated, reject with a reason,
// reopen), book students for companies and filter; a company sees why it
// cannot book yet, books choosing beca or contrato, and cancels its own
// pending booking.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import LinkStudents from "./index.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";

vi.mock("../../hooks/useConvocatoriaEstado.js", () => ({
  useConvocatoriaEstado: () => ({ status: "ready", data: { activa: { nombre: "2026/2027" } }, error: null }),
}));

beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(); return 0; });
});

const doc = (clave, nombre, estado, extra) => ({
  id_documento: clave === "CV" ? 1 : 2, clave, nombre, estado_validacion: estado, requerido_para_validar: true, ...extra,
});
const sol = (id, extra) => ({
  id_solicitud_alumno: id, nombre: `Alumno ${id}`, dni: `0000000${id}Z`, email: `a${id}@x.test`, telalumno: "600000000",
  especialidad: "Joyería", id_especialidad: 5, convocatoria: "2026/2027", convocatoria_activa: 1,
  estado_validacion: "VALIDADO", reservas: [], documentos: [], ...extra,
});

const tarjeta = (nombre) => screen.getByText(nombre).closest("div.grid").parentElement;

describe("staff", () => {
  beforeEach(() => iniciarSesion({ id: 2, rol: "COORDINADOR", nombre: "Coord" }));

  test("loading error shows a retry that reloads", async () => {
    let fallar = true;
    simularApi({
      "GET /solicitudes/alumno": () => (fallar ? { status: 500, body: { error: "Servidor caído" } } : [sol(1)]),
    });
    renderPagina(<LinkStudents />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los datos.");
    expect(screen.getByRole("alert")).toHaveTextContent("Servidor caído");
    fallar = false;
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Alumno 1")).toBeInTheDocument();
  });

  test("an empty list says there are no applications yet", async () => {
    simularApi({ "GET /solicitudes/alumno": [] });
    renderPagina(<LinkStudents />);
    expect(await screen.findByText("Todavía no hay solicitudes de alumnos.")).toBeInTheDocument();
  });

  test("only older convocatorias: offers to show them all", async () => {
    simularApi({ "GET /solicitudes/alumno": [sol(1, { convocatoria: "2025/2026" })] });
    renderPagina(<LinkStudents />);
    expect(await screen.findByText("No hay solicitudes en la convocatoria activa.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver todas las convocatorias" }));
    expect(await screen.findByText("Alumno 1")).toBeInTheDocument();
  });

  test("a search with no match offers to clear the filters", async () => {
    simularApi({ "GET /solicitudes/alumno": [sol(1), sol(2)] });
    renderPagina(<LinkStudents />, { ruta: "/alumnos?q=nadie" });
    expect(await screen.findByText("No hay alumnos que coincidan con la búsqueda o los filtros.")).toBeInTheDocument();
    const vacio = screen.getByText("No hay alumnos que coincidan con la búsqueda o los filtros.").parentElement;
    fireEvent.click(within(vacio).getByRole("button", { name: "Quitar filtros" }));
    expect(await screen.findByText("Alumno 2")).toBeInTheDocument();
  });

  test("header shows pending changes, the confirmed company and other bookings (+N beyond three)", async () => {
    const reservas = [
      { id_reserva: 1, estado_reserva: "CONFIRMADA", empresa: "ACME" },
      { id_reserva: 2, estado_reserva: "CANCELADA", empresa: "Beta" },
      { id_reserva: 3, estado_reserva: "CANCELADA", empresa: "Gamma" },
      { id_reserva: 4, estado_reserva: "CANCELADA", empresa: "Delta" },
      { id_reserva: 5, estado_reserva: "CANCELADA", empresa: "Epsilon" },
    ];
    simularApi({ "GET /solicitudes/alumno": [sol(1, { id_cambio_pendiente: 9, reservas, turno: "VESPERTINO" })] });
    renderPagina(<LinkStudents />);
    await screen.findByText("Alumno 1");
    expect(screen.getByText("Cambios pendientes")).toBeInTheDocument();
    expect(screen.getByText("Confirmada: ACME")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText(/· VESPERTINO/)).toBeInTheDocument();
  });

  test("validate is blocked until the required documents are validated, and says which ones", async () => {
    simularApi({
      "GET /solicitudes/alumno": [
        sol(1, { estado_validacion: "PENDIENTE", documentos: [doc("CV", "CV", "VALIDADO"), doc("ANEXO_DGA", "Anexo DGA", "PENDIENTE")] }),
        sol(2, { estado_validacion: "PENDIENTE", documentos: [doc("CV", "CV", "RECHAZADO"), doc("ANEXO_DGA", "Anexo DGA", "VALIDADO")] }),
        sol(3, { estado_validacion: "PENDIENTE", documentos: [] }),
      ],
    });
    renderPagina(<LinkStudents />);
    await screen.findByText("Alumno 1");
    expect(within(tarjeta("Alumno 1")).getByText("Para validar al alumno, primero valida: Anexo DGA.")).toBeInTheDocument();
    expect(within(tarjeta("Alumno 2")).getByText("Hay documentación rechazada: CV.")).toBeInTheDocument();
    expect(within(tarjeta("Alumno 3")).getByText("No hay documentos configurados para validar la solicitud.")).toBeInTheDocument();
    for (const b of screen.getAllByRole("button", { name: "Validar alumno" })) expect(b).toBeDisabled();
  });

  test("validate asks first (it emails the student), then posts and reloads", async () => {
    let estado = "PENDIENTE";
    const { llamadas } = simularApi({
      "GET /solicitudes/alumno": () => [sol(1, { estado_validacion: estado, documentos: [doc("CV", "CV", "VALIDADO"), doc("ANEXO_DGA", "Anexo DGA", "VALIDADO")] })],
      "POST /solicitudes/alumno/1/validar": () => { estado = "VALIDADO"; return {}; },
    });
    renderPagina(<LinkStudents />);
    await screen.findByText("Documentación completa");
    fireEvent.click(screen.getByRole("button", { name: "Validar alumno" }));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("recibirá un correo");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Validar y avisar" }));
    expect(await screen.findByText("Solicitud validada.")).toBeInTheDocument();
    expect(llamadas.filter((l) => l.path === "/solicitudes/alumno").length).toBe(2);
    expect(screen.queryByRole("button", { name: "Validar alumno" })).toBeNull();
  });

  test("cancelling the validate confirmation sends nothing", async () => {
    const { llamadas } = simularApi({
      "GET /solicitudes/alumno": [sol(1, { estado_validacion: "PENDIENTE", documentos: [doc("CV", "CV", "VALIDADO")] })],
    });
    renderPagina(<LinkStudents />);
    await screen.findByText("Documentación completa");
    fireEvent.click(screen.getByRole("button", { name: "Validar alumno" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(llamadas.some((l) => l.method === "POST")).toBe(false);
  });

  test("a refused validation shows the server's reason", async () => {
    simularApi({
      "GET /solicitudes/alumno": [sol(1, { estado_validacion: "PENDIENTE", documentos: [doc("CV", "CV", "VALIDADO")] })],
      "POST /solicitudes/alumno/1/validar": { status: 400, body: { error: "Para validar al alumno faltan por validar: CV, Anexo DGA." } },
    });
    renderPagina(<LinkStudents />);
    await screen.findByText("Documentación completa");
    fireEvent.click(screen.getByRole("button", { name: "Validar alumno" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Validar y avisar" }));
    expect(await screen.findByText("Para validar al alumno faltan por validar: CV, Anexo DGA.")).toBeInTheDocument();
  });

  test("reject needs a reason and sends it", async () => {
    const { llamadas } = simularApi({
      "GET /solicitudes/alumno": [sol(1, { estado_validacion: "PENDIENTE" })],
      "POST /solicitudes/alumno/1/rechazar": {},
    });
    renderPagina(<LinkStudents />);
    await screen.findByText("Alumno 1");
    fireEvent.click(screen.getByRole("button", { name: "Rechazar solicitud" }));
    const dialogo = await screen.findByRole("dialog");
    const enviar = within(dialogo).getByRole("button", { name: "Rechazar solicitud" });
    expect(enviar).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText(/Motivo del rechazo/), { target: { value: "   " } });
    expect(enviar).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText(/Motivo del rechazo/), { target: { value: "  CV ilegible " } });
    fireEvent.click(enviar);
    expect(await screen.findByText("Solicitud rechazada.")).toBeInTheDocument();
    expect(llamadas.find((l) => l.method === "POST").body).toEqual({ motivo: "CV ilegible" });
  });

  test("a rejected application shows its reason and can be reopened without one", async () => {
    const { llamadas } = simularApi({
      "GET /solicitudes/alumno": [sol(1, { estado_validacion: "RECHAZADO", motivo: "Falta el DGA" }), sol(2, { estado_validacion: "RECHAZADO", motivo: null })],
      "POST /solicitudes/alumno/1/reabrir": {},
    });
    renderPagina(<LinkStudents />);
    await screen.findByText("Alumno 1");
    expect(within(tarjeta("Alumno 1")).getByText("Falta el DGA")).toBeInTheDocument();
    expect(within(tarjeta("Alumno 2")).getByText("Sin motivo indicado.")).toBeInTheDocument();
    fireEvent.click(within(tarjeta("Alumno 1")).getByRole("button", { name: "Reabrir solicitud" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reabrir solicitud" }));
    expect(await screen.findByText(/Solicitud reabierta/)).toBeInTheDocument();
    const post = llamadas.find((l) => l.method === "POST");
    expect(post.path).toBe("/solicitudes/alumno/1/reabrir");
    expect(post.body).toEqual({});
  });

  test("Reservas tab: books the student in an eligible offer after confirming", async () => {
    const { llamadas } = simularApi({
      "GET /solicitudes/alumno": [sol(1)],
      "GET /reservas/ofertas-elegibles": [
        { id_solicitud_empresa_especialidad: 30, empresa: "ACME", especialidad: "Joyería", plazas_disponibles: 2 },
        { id_solicitud_empresa_especialidad: 31, empresa: "Beta", especialidad: "Joyería", plazas_disponibles: 1 },
      ],
      "POST /reservas/admin": {},
    });
    renderPagina(<LinkStudents />);
    await screen.findByText("Alumno 1");
    fireEvent.click(screen.getByRole("tab", { name: /Reservas/ }));
    expect(screen.getByText("Este alumno no tiene reservas.")).toBeInTheDocument();
    const select = await screen.findByLabelText("Oferta");
    expect(select).toHaveValue("30");
    fireEvent.change(select, { target: { value: "31" } });
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("¿Crear una reserva pendiente con Beta?");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Crear reserva" }));
    expect(await screen.findByText("Reserva creada.")).toBeInTheDocument();
    expect(llamadas.find((l) => l.path === "/reservas/admin").body).toEqual({ id_solicitud_alumno: 1, id_solicitud_empresa_especialidad: 31 });
  });

  test("Reservas tab: a refused booking shows the reason (e.g. already confirmed elsewhere)", async () => {
    simularApi({
      "GET /solicitudes/alumno": [sol(1)],
      "GET /reservas/ofertas-elegibles": [{ id_solicitud_empresa_especialidad: 30, empresa: "ACME", especialidad: "Joyería", plazas_disponibles: 2 }],
      "POST /reservas/admin": { status: 400, body: { error: "El alumno ya tiene una reserva confirmada." } },
    });
    renderPagina(<LinkStudents />);
    await screen.findByText("Alumno 1");
    fireEvent.click(screen.getByRole("tab", { name: /Reservas/ }));
    await screen.findByLabelText("Oferta");
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Crear reserva" }));
    expect(await screen.findByText("El alumno ya tiene una reserva confirmada.")).toBeInTheDocument();
  });

  test("Reservas tab: lists bookings with contract, tutor and (cancelled) reason; no offers explains why", async () => {
    simularApi({
      "GET /solicitudes/alumno": [sol(1, { reservas: [
        { id_reserva: 7, estado_reserva: "CONFIRMADA", empresa: "ACME", tipo_contrato: "BECA", tutor_nombre: "Tutor T" },
        { id_reserva: 8, estado_reserva: "CANCELADA", empresa: "Beta", motivo: "No se presentó" },
      ] })],
      "GET /reservas/ofertas-elegibles": [],
    });
    renderPagina(<LinkStudents />);
    await screen.findByText("Alumno 1");
    fireEvent.click(screen.getByRole("tab", { name: /Reservas/ }));
    expect(screen.getByText(/Contrato: Beca · Tutor: Tutor T/)).toBeInTheDocument();
    expect(screen.getByText("Motivo: No se presentó")).toBeInTheDocument();
    expect(await screen.findByText(/No hay ofertas elegibles/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Gestionar reserva" })).toHaveLength(2);
  });

  test("Reservas tab: an error loading offers is shown", async () => {
    simularApi({
      "GET /solicitudes/alumno": [sol(1)],
      "GET /reservas/ofertas-elegibles": { status: 500, body: { error: "Fallo ofertas" } },
    });
    renderPagina(<LinkStudents />);
    await screen.findByText("Alumno 1");
    fireEvent.click(screen.getByRole("tab", { name: /Reservas/ }));
    expect(await screen.findByText("Fallo ofertas")).toBeInTheDocument();
  });

  test("quick data shows contact and mobility", async () => {
    simularApi({ "GET /solicitudes/alumno": [sol(1, { carnetDeConducir: 1, tieneCoche: 0, telalumno: null })] });
    renderPagina(<LinkStudents />);
    await screen.findByText("Alumno 1");
    expect(screen.getByText("a1@x.test")).toBeInTheDocument();
    expect(screen.getByText("Carnet").className).toMatch(/green/);
    expect(screen.getByText("Vehículo").className).toMatch(/red/);
    expect(screen.getByText("Sin documentos de solicitud.")).toBeInTheDocument();
  });
});

describe("company", () => {
  beforeEach(() => iniciarSesion({ id: 5, rol: "EMPRESA", nombre: "ACME" }));

  test.each([
    [{ status: 404, body: { error: "x", code: "SIN_SOLICITUD" } }, "Tu empresa no tiene solicitud en la convocatoria activa", true],
    [{ estado_validacion: "PENDIENTE" }, "Tu solicitud está pendiente de validación", false],
    [{ estado_validacion: "RECHAZADO" }, "Tu solicitud ha sido rechazada", true],
  ])("cannot book yet: %j", async (mia, titulo, conEnlace) => {
    const { llamadas } = simularApi({ "GET /solicitudes/empresa/mia": mia });
    renderPagina(<LinkStudents />);
    expect(await screen.findByText(titulo)).toBeInTheDocument();
    expect(Boolean(screen.queryByRole("link", { name: "Ir a mi portal" }))).toBe(conEnlace);
    expect(llamadas.some((l) => l.path === "/alumnos/disponibles")).toBe(false);
  });

  test("an error reading its application is an error, not «not validated»", async () => {
    simularApi({ "GET /solicitudes/empresa/mia": { status: 500, body: { error: "Caído" } } });
    renderPagina(<LinkStudents />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los datos.");
    expect(screen.queryByText(/pendiente de validación/)).toBeNull();
  });

  test("validated: no students available", async () => {
    simularApi({ "GET /solicitudes/empresa/mia": { estado_validacion: "VALIDADO" }, "GET /alumnos/disponibles": [], "GET /cupos/empresa": [] });
    renderPagina(<LinkStudents />);
    expect(await screen.findByText("No hay alumnos validados disponibles para tus ciclos en este momento.")).toBeInTheDocument();
  });

  test("book with a contract type, cancel its own booking, and the locked and no-places cases", async () => {
    const TIPOS = [{ id_tipo_contrato: 1, nombre: "BECA", nombre_mostrar: "Beca" }];
    const { llamadas } = simularApi({
      "GET /solicitudes/empresa/mia": { estado_validacion: "VALIDADO" },
      "GET /alumnos/disponibles": [
        sol(1),
        sol(2, { mi_reserva_id: 44 }),
        sol(3, { reservas: [{ id_reserva: 9, estado_reserva: "CONFIRMADA", empresa: "Otra" }] }),
        sol(4, { id_especialidad: 99 }),
      ],
      "GET /cupos/empresa": [{ id_especialidad: 5, plazas_disponibles: 1, id_solicitud_empresa_especialidad: 30 }],
      "GET /tiposContrato": TIPOS,
      "POST /reservas": {},
      "POST /reservas/44/cancelar": {},
    });
    renderPagina(<LinkStudents />);
    await screen.findByText("Alumno 1");
    expect(screen.getByText(/Una reserva no es definitiva/)).toBeInTheDocument();
    expect(within(tarjeta("Alumno 3")).getByText("Plaza confirmada en otra empresa")).toBeInTheDocument();
    expect(within(tarjeta("Alumno 4")).getByText("Sin plazas disponibles")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Reservas/ })).toBeNull();

    fireEvent.click(within(tarjeta("Alumno 1")).getByRole("button", { name: "Reservar alumno" }));
    let dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByRole("option", { name: "Beca" });
    fireEvent.change(within(dialogo).getByLabelText("Tipo de contrato"), { target: { value: "1" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reservar" }));
    expect(await screen.findByText("Reserva creada.")).toBeInTheDocument();
    expect(llamadas.find((l) => l.path === "/reservas").body).toEqual({ id_solicitud_alumno: 1, id_solicitud_empresa_especialidad: 30, id_tipo_contrato: 1 });

    fireEvent.click(within(tarjeta("Alumno 2")).getByRole("button", { name: "Cancelar reserva" }));
    dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la cancelación/), { target: { value: "Ya no" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar reserva" }));
    expect(await screen.findByText("Reserva cancelada correctamente.")).toBeInTheDocument();
    expect(llamadas.find((l) => l.path === "/reservas/44/cancelar").body).toEqual({ motivo: "Ya no" });
  });

  test("a refused cancellation stays in the dialog", async () => {
    simularApi({
      "GET /solicitudes/empresa/mia": { estado_validacion: "VALIDADO" },
      "GET /alumnos/disponibles": [sol(2, { mi_reserva_id: 44 })],
      "GET /cupos/empresa": [],
      "POST /reservas/44/cancelar": { status: 400, body: { error: "Solo puede cancelar una reserva pendiente propia." } },
    });
    renderPagina(<LinkStudents />);
    await screen.findByText("Alumno 2");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la cancelación/), { target: { value: "x" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar reserva" }));
    expect(await within(dialogo).findByText("Solo puede cancelar una reserva pendiente propia.")).toBeInTheDocument();
  });
});
