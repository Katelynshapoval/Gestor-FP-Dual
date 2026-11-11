// The student list behind «Alumnos» (useLinkStudents): staff get every
// application of the active convocatoria with filters; a company only sees
// students once its application is validated, and errors are never shown as
// "not validated". Actions reload the list.
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { User } from "../../context/UserContext";
import { ToastProvider } from "../../components/feedback/ToastProvider.jsx";
import { situacionReserva, useLinkStudents } from "./hooks/useLinkStudents.js";
import { iniciarSesion, simularApi } from "../../testUtils";

jest.mock("../../hooks/useConvocatoriaEstado.js", () => ({
  useConvocatoriaEstado: () => ({ status: "ready", data: { activa: { nombre: "2026/2027" } }, error: null }),
}));

function montar(ruta = "/alumnos") {
  const wrapper = ({ children }) => (
    <MemoryRouter initialEntries={[ruta]}>
      <User><ToastProvider>{children}</ToastProvider></User>
    </MemoryRouter>
  );
  return renderHook(() => useLinkStudents(), { wrapper });
}

const sol = (id, extra) => ({ id_solicitud_alumno: id, nombre: `Alumno ${id}`, dni: `${id}Z`, email: `a${id}@x.test`, especialidad: "Joyería", convocatoria: "2026/2027", estado_validacion: "VALIDADO", reservas: [], ...extra });
const SOLICITUDES = [
  sol(1, { reservas: [{ estado_reserva: "CONFIRMADA", empresa: "ACME" }] }),
  sol(2, { reservas: [{ estado_reserva: "CANCELADA" }, { estado_reserva: "PENDIENTE", empresa: "Beta" }] }),
  sol(3, { estado_validacion: "PENDIENTE", especialidad: "Desarrollo web" }),
  sol(4, { convocatoria: "2025/2026" }),
];

test("reservation situation: confirmed wins, cancelled ones do not count", () => {
  expect(situacionReserva(SOLICITUDES[0])).toBe("CONFIRMADA");
  expect(situacionReserva(SOLICITUDES[1])).toBe("PENDIENTE");
  expect(situacionReserva(sol(9, { reservas: [{ estado_reserva: "CANCELADA" }] }))).toBe("SIN_RESERVA");
  expect(situacionReserva({})).toBe("SIN_RESERVA");
});

describe("staff", () => {
  beforeEach(() => iniciarSesion({ id: 1, rol: "COORDINADOR" }));

  test("loads every application with reservations; the active convocatoria by default", async () => {
    const { llamadas } = simularApi({ "GET /solicitudes/alumno": SOLICITUDES });
    const { result } = montar();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(llamadas[0].url).toBe("/solicitudes/alumno?include=full");
    expect(result.current.filtered.map((r) => r.id_solicitud_alumno)).toEqual([1, 2, 3]);
    expect(result.current.specialities).toEqual(["Desarrollo web", "Joyería"]);
    expect(result.current.convocatorias).toEqual(["2026/2027", "2025/2026"]);
  });

  test("filters by convocatoria, state, ciclo, reservation and text (including the company)", async () => {
    simularApi({ "GET /solicitudes/alumno": SOLICITUDES });
    const ids = (r) => r.current.filtered.map((x) => x.id_solicitud_alumno);
    let view = montar("/alumnos?convocatoria=todas");
    await waitFor(() => expect(ids(view.result)).toEqual([1, 2, 3, 4]));
    view.unmount();
    view = montar("/alumnos?estado=PENDIENTE");
    await waitFor(() => expect(ids(view.result)).toEqual([3]));
    view.unmount();
    view = montar("/alumnos?reserva=SIN_RESERVA");
    await waitFor(() => expect(ids(view.result)).toEqual([3]));
    view.unmount();
    view = montar("/alumnos?especialidad=Joyer%C3%ADa&reserva=PENDIENTE");
    await waitFor(() => expect(ids(view.result)).toEqual([2]));
    view.unmount();
    view = montar("/alumnos?q=acme");
    await waitFor(() => expect(ids(view.result)).toEqual([1]));
    act(() => view.result.current.resetFilters());
    await waitFor(() => expect(ids(view.result)).toEqual([1, 2, 3]));
  });

  test("validate, reject and reopen post and reload", async () => {
    const { llamadas } = simularApi({
      "GET /solicitudes/alumno": SOLICITUDES,
      "POST /solicitudes/alumno/:id/validar": {},
      "POST /solicitudes/alumno/:id/rechazar": {},
      "POST /solicitudes/alumno/:id/reabrir": {},
      "POST /reservas/admin": {},
    });
    const { result } = montar();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(() => result.current.validateAlumno(3));
    await act(() => result.current.rejectSolicitud(3, "Falta DNI"));
    await act(() => result.current.reopenSolicitud(3, ""));
    await act(() => result.current.adminReserve(3, 5));
    const posts = llamadas.filter((l) => l.method === "POST");
    expect(posts.map((p) => [p.path, p.body])).toEqual([
      ["/solicitudes/alumno/3/validar", {}],
      ["/solicitudes/alumno/3/rechazar", { motivo: "Falta DNI" }],
      ["/solicitudes/alumno/3/reabrir", {}],
      ["/reservas/admin", { id_solicitud_alumno: 3, id_solicitud_empresa_especialidad: 5 }],
    ]);
    expect(llamadas.filter((l) => l.path === "/solicitudes/alumno")).toHaveLength(5);
    expect(result.current.status).toBe("ready", "later refreshes keep the list on screen");
  });

  test("a failed first load is an error with retry; a failed refresh keeps the list", async () => {
    let fallos = 1;
    simularApi({ "GET /solicitudes/alumno": () => (fallos-- > 0 ? { status: 500, body: { error: "Caída" } } : SOLICITUDES) });
    const { result } = montar();
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error.message).toBe("Caída");
    await act(() => result.current.fetchLinkRequests());
    expect(result.current.status).toBe("ready");
    fallos = 1;
    await act(() => result.current.fetchLinkRequests());
    expect(result.current.status).toBe("ready");
    expect(result.current.linkRequests).toHaveLength(4);
  });

  test("expanded cards collapse when a filter changes", async () => {
    simularApi({ "GET /solicitudes/alumno": SOLICITUDES });
    const { result } = montar();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.toggleCard(1));
    expect(result.current.expandedCards.has(1)).toBe(true);
    act(() => result.current.toggleCard(1));
    expect(result.current.expandedCards.has(1)).toBe(false);
    act(() => result.current.toggleCard(2));
    act(() => result.current.setFilter("estado", "VALIDADO"));
    await waitFor(() => expect(result.current.expandedCards.size).toBe(0));
  });
});

describe("company", () => {
  beforeEach(() => iniciarSesion({ id: 3, rol: "EMPRESA" }));

  test("a validated company gets the available students and its places", async () => {
    const { llamadas } = simularApi({
      "GET /solicitudes/empresa/mia": { estado_validacion: "VALIDADO" },
      "GET /alumnos/disponibles": [sol(1), sol(2, { especialidad: "Desarrollo web" })],
      "GET /cupos/empresa": [{ id_solicitud_empresa_especialidad: 5, plazas_disponibles: 1 }],
    });
    const { result } = montar("/alumnos?q=2z");
    await waitFor(() => expect(result.current.companyState).toBe("VALIDADO"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.companyOffers).toHaveLength(1);
    expect(result.current.filtered.map((r) => r.id_solicitud_alumno)).toEqual([2], "search by DNI");
    expect(llamadas.some((l) => l.path === "/solicitudes/alumno")).toBe(false, "never the staff list");
  });

  test.each([
    ["PENDIENTE", { estado_validacion: "PENDIENTE" }],
    ["SIN_SOLICITUD", { status: 404, body: { error: "No hay", code: "SIN_SOLICITUD" } }],
  ])("a %s company sees no students and nothing more is asked", async (estado, respuesta) => {
    const { llamadas } = simularApi({ "GET /solicitudes/empresa/mia": respuesta });
    const { result } = montar();
    await waitFor(() => expect(result.current.companyState).toBe(estado));
    expect(result.current.filtered).toEqual([]);
    expect(llamadas.some((l) => l.path === "/alumnos/disponibles")).toBe(false);
  });

  test("a failure checking the company is an error, not «not validated»", async () => {
    simularApi({ "GET /solicitudes/empresa/mia": { status: 500, body: { error: "Caída" } } });
    const { result } = montar();
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.companyState).toBe("error");
  });

  test("booking and cancelling a reservation", async () => {
    const { llamadas } = simularApi({
      "GET /solicitudes/empresa/mia": { estado_validacion: "VALIDADO" },
      "GET /alumnos/disponibles": [sol(1)],
      "GET /cupos/empresa": [],
      "POST /reservas": (req) => (req.body.id_solicitud_alumno === 9 ? { status: 409, body: { error: "Sin plazas." } } : { id_reserva: 8 }),
      "POST /reservas/8/cancelar": {},
    });
    const { result } = montar();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(() => result.current.reserveStudent(1, 5));
    await act(() => result.current.reserveStudent(9, 5));
    await act(() => result.current.cancelReservation(8, "Ya no"));
    const posts = llamadas.filter((l) => l.method === "POST");
    expect(posts.map((p) => [p.path, p.body])).toEqual([
      ["/reservas", { id_solicitud_alumno: 1, id_solicitud_empresa_especialidad: 5 }],
      ["/reservas", { id_solicitud_alumno: 9, id_solicitud_empresa_especialidad: 5 }],
      ["/reservas/8/cancelar", { motivo: "Ya no" }],
    ]);
  });
});

test("without a session the list sends to the login", async () => {
  iniciarSesion(null);
  simularApi();
  const ruta = [];
  const wrapper = ({ children }) => <MemoryRouter initialEntries={["/alumnos"]}><User><ToastProvider>{children}</ToastProvider></User></MemoryRouter>;
  const { result } = renderHook(() => { const h = useLinkStudents(); ruta.push(h.user); return h; }, { wrapper });
  expect(result.current.user).toBeNull();
  expect(global.fetch).not.toHaveBeenCalled();
});
