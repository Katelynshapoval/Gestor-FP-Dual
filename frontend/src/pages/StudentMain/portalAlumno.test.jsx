// The student portal: what it tells the student to do next (pendientesAlumno),
// loading and errors, the tabs with their counters, «Mis reservas» (confirmed,
// pending, cancelled history; the cancellation reason never shown) and
// «Mis documentos». Also the company's «Mis reservas» list.
import { fireEvent, render, screen, within } from "@testing-library/react";
import StudentMain, { pendientesAlumno } from "./index.jsx";
import MisReservasAlumno from "./MisReservas.jsx";
import MisReservasEmpresa from "../CompanyView/MisReservas.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";

beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(); return 0; });
});

const SOL = { estado_validacion: "VALIDADO", especialidad: "Joyería", convocatoria: "2026/2027" };
const titulos = (args) => pendientesAlumno({ reservas: [], documentos: [], irA: () => {}, abrirReserva: () => {}, ...args }).map((i) => i.title);

describe("pendientesAlumno", () => {
  test("no application", () => {
    expect(titulos({ solicitud: null })).toEqual(["No tienes ninguna solicitud de FP Dual."]);
  });

  test("pending review / validated without bookings / rejected with and without reason", () => {
    expect(titulos({ solicitud: { estado_validacion: "PENDIENTE" } })).toEqual(["El centro está revisando tu solicitud."]);
    expect(titulos({ solicitud: SOL })).toEqual(["Tu solicitud está validada."]);
    const rech = pendientesAlumno({ solicitud: { estado_validacion: "RECHAZADO", motivo: "CV ilegible" }, reservas: [], documentos: [] });
    expect(rech[0].text).toBe("Motivo: CV ilegible. Ponte en contacto con el centro.");
    const sinMotivo = pendientesAlumno({ solicitud: { estado_validacion: "RECHAZADO" }, reservas: [], documentos: [] });
    expect(sinMotivo[0].text).toBe("Ponte en contacto con el centro.");
  });

  test("documents waiting for the student; a rejected one asks for a corrected version with the reason", () => {
    const irA = vi.fn();
    const items = pendientesAlumno({
      solicitud: SOL, reservas: [], irA,
      documentos: [
        { clave: "CV", nombre: "CV", estado_operativo: "RECHAZADO", motivo: "Borroso", accion_pendiente_de: ["ALUMNO"] },
        { clave: "ANEXO_DGA", nombre: "Anexo DGA", estado_operativo: "PENDIENTE_FIRMA", accion_pendiente_de: ["ALUMNO"] },
        { clave: "OTRO", nombre: "Otro", estado_operativo: "PENDIENTE_FIRMA", accion_pendiente_de: ["EMPRESA"] },
      ],
    });
    expect(items[0].title).toBe("CV: rechazado, sube una versión corregida.");
    expect(items[0].text).toBe("Motivo: Borroso");
    expect(items[1].title).toMatch(/^Anexo DGA: /);
    expect(items.some((i) => i.title.startsWith("Otro"))).toBe(false);
    items[0].action.onClick();
    expect(irA).toHaveBeenCalledWith("documentos");
  });

  test("annex waiting for the student's signature; confirmed place; pending bookings counted; cancelled ignored", () => {
    const abrirReserva = vi.fn();
    const reservas = [
      { id_reserva: 1, empresa: "ACME", estado_reserva: "PENDIENTE", documentos_resumen: { anexo: { clave: "ANEXO_III", firmas_pendientes: ["alumno"] } } },
      { id_reserva: 2, empresa: "Beta", estado_reserva: "PENDIENTE" },
      { id_reserva: 3, empresa: "Gamma", estado_reserva: "CANCELADA", documentos_resumen: { anexo: { clave: "ANEXO_II", firmas_pendientes: ["ALUMNO"] } } },
    ];
    const items = pendientesAlumno({ solicitud: SOL, reservas, documentos: [], abrirReserva });
    expect(items.map((i) => i.title)).toEqual(["Firma el Anexo III de ACME.", "Tienes 2 reservas pendientes de confirmación."]);
    items[0].action.onClick();
    expect(abrirReserva).toHaveBeenCalledWith(1);
    expect(titulos({ solicitud: SOL, reservas: [reservas[1]] })).toEqual(["Tienes una reserva pendiente de confirmación."]);
    expect(titulos({ solicitud: SOL, reservas: [{ ...reservas[1], estado_reserva: "CONFIRMADA" }] })).toEqual(["Tu plaza en Beta está confirmada."]);
  });
});

describe("portal page", () => {
  const rutas = (extra) => ({
    "GET /solicitudes/alumno/mia": SOL,
    "GET /solicitudes/alumno/mia/datos": {},
    "GET /reservas/alumno": [],
    "GET /documentos/alumno/mios": { items: [] },
    "GET /documentos/pendientes-firma": { items: [] },
    "GET /firmas/mia": { firma: null },
    ...extra,
  });

  test("only students: anyone else goes to the login", () => {
    iniciarSesion({ id: 1, rol: "EMPRESA" });
    simularApi(rutas());
    renderPagina(<StudentMain />, { ruta: "/studentMain" });
    expect(screen.getByTestId("ruta")).toHaveTextContent("/login");
  });

  test("a student without an application (404 SIN_SOLICITUD) is not an error", async () => {
    iniciarSesion({ id: 4, rol: "ALUMNO", nombre: "Ana" });
    simularApi(rutas({ "GET /solicitudes/alumno/mia": { status: 404, body: { error: "x", code: "SIN_SOLICITUD" } } }));
    renderPagina(<StudentMain />);
    expect(await screen.findByText("No tienes ninguna solicitud de FP Dual.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a load error offers a retry", async () => {
    iniciarSesion({ id: 4, rol: "ALUMNO", nombre: "Ana" });
    let fallar = true;
    simularApi(rutas({ "GET /reservas/alumno": () => (fallar ? { status: 500, body: { error: "Caído" } } : []) }));
    renderPagina(<StudentMain />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Caído");
    fallar = false;
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Tu solicitud está validada.")).toBeInTheDocument();
  });

  test("header, tab counters and switching tabs", async () => {
    iniciarSesion({ id: 4, rol: "ALUMNO", nombre: "Ana López" });
    simularApi(rutas({
      "GET /reservas/alumno": [{ id_reserva: 1, empresa: "ACME", estado_reserva: "PENDIENTE" }, { id_reserva: 2, empresa: "Beta", estado_reserva: "CANCELADA" }],
      "GET /documentos/alumno/mios": { items: [{ clave: "CV", nombre: "CV", estado_operativo: "RECHAZADO", accion_pendiente_de: ["ALUMNO"], puede_reemplazar: true }] },
    }));
    renderPagina(<StudentMain />);
    expect(await screen.findByRole("heading", { name: "Ana López" })).toBeInTheDocument();
    expect(await screen.findByText("Joyería · Convocatoria 2026/2027")).toBeInTheDocument();
    const reservasTab = screen.getByRole("tab", { name: /Mis reservas/ });
    expect(reservasTab).toHaveTextContent("1");
    fireEvent.click(reservasTab);
    expect(await screen.findByText("ACME ha reservado tu candidatura. El proceso está pendiente de confirmación.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Mis documentos/ }));
    expect(await screen.findByRole("heading", { name: "Mis documentos" })).toBeInTheDocument();
  });
});

describe("Mis reservas (student)", () => {
  const montar = (reservas) => renderPagina(<MisReservasAlumno reservas={reservas} onChanged={() => {}} />);

  test("no bookings", () => {
    montar([]);
    expect(screen.getByText("Actualmente ninguna empresa ha reservado tu candidatura.")).toBeInTheDocument();
  });

  test("confirmed place with tutor; other pending ones are not the place; cancelled ones in the history without reason", () => {
    montar([
      { id_reserva: 1, empresa: "ACME", estado_reserva: "CONFIRMADA", especialidad: "Joyería", tipo_contrato: "BECA", tutor_nombre: "Rosa", tutor_email: "rosa@acme.test", tutor_telefono: "600" },
      { id_reserva: 2, empresa: "Beta", estado_reserva: "PENDIENTE" },
      { id_reserva: 3, empresa: "Gamma", estado_reserva: "CANCELADA", motivo: "SECRETO interno" },
    ]);
    expect(screen.getByText("Tu plaza con ACME está confirmada.")).toBeInTheDocument();
    expect(screen.getByText("Contrato: Beca")).toBeInTheDocument();
    expect(screen.getByText("rosa@acme.test")).toBeInTheDocument();
    expect(screen.getByText("Esta reserva no es la plaza definitiva.")).toBeInTheDocument();
    expect(screen.getByText("La reserva de Gamma fue cancelada.")).toBeInTheDocument();
    expect(screen.getByText("Esta reserva ya no está activa.")).toBeInTheDocument();
    expect(screen.queryByText(/SECRETO/)).toBeNull();
  });

  test("without a confirmed place a cancelled booking says the application stays open", () => {
    montar([{ id_reserva: 3, empresa: "Gamma", estado_reserva: "CANCELADA" }]);
    expect(screen.getByText(/Tu solicitud sigue abierta para otras empresas/)).toBeInTheDocument();
  });

  test("«Ver detalle y documentos» opens the booking panel", async () => {
    iniciarSesion({ id: 4, rol: "ALUMNO" });
    simularApi({
      "GET /reservas/:id/detalle": { reserva: { id_reserva: 2, alumno: "Ana", empresa: "Beta", estado_reserva: "PENDIENTE" }, acciones: {}, documentos: [], historial: [] },
    });
    montar([{ id_reserva: 2, empresa: "Beta", estado_reserva: "PENDIENTE" }]);
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle y documentos de la reserva de Beta" }));
    expect(await screen.findByRole("dialog", { name: "Ana · Beta" })).toBeInTheDocument();
  });
});

describe("Mis reservas (company)", () => {
  test("empty", () => {
    render(<MisReservasEmpresa reservations={[]} />);
    expect(screen.getByText("No tienes alumnos reservados todavía.")).toBeInTheDocument();
  });

  test("rows show contract, tutor and the reason of a cancelled booking; cancelled ones are view-only", () => {
    renderPagina(<MisReservasEmpresa reservations={[
      { id_reserva: 1, alumno: "Ana", especialidad: "Joyería", tipo_contrato: "BECA", tutor_nombre: "Rosa", estado_reserva: "PENDIENTE" },
      { id_reserva: 2, alumno: null, estado_reserva: "CANCELADA", motivo: "Renuncia" },
    ]} />);
    expect(screen.getByText("Joyería · Beca · Tutor: Rosa")).toBeInTheDocument();
    const filas = screen.getAllByRole("article");
    expect(within(filas[0]).getByRole("button", { name: "Ver y gestionar" })).toBeInTheDocument();
    expect(within(filas[1]).getByText("Alumno")).toBeInTheDocument();
    expect(within(filas[1]).getByText("Renuncia")).toBeInTheDocument();
    expect(within(filas[1]).getByRole("button", { name: "Ver detalle" })).toBeInTheDocument();
  });
});

describe("Mis documentos (student)", () => {
  test("empty list", async () => {
    const { default: MisDocumentos } = await import("./MisDocumentos.jsx");
    renderPagina(<MisDocumentos documentos={[]} onChange={() => {}} />);
    expect(screen.getByText("No hay documentos para mostrar.")).toBeInTheDocument();
  });
});
