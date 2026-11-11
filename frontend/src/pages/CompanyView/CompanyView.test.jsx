// The company portal: only for companies, what it loads, what it asks the
// company to do, failed sections with retry, re-applying in a new
// convocatoria and sending a data change request (never the CIF).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import CompanyView from "./index.js";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";

const MIA = { id_solicitud_empresa: 10, convocatoria_activa: true, convocatoria: "2026/2027", estado_validacion: "PENDIENTE" };
const DATOS = {
  id_solicitud_empresa: 10, empresa: "Talleres Ebro", razonSocial: "Talleres Ebro", cif: "B12345674", convocatoria: "2026/2027",
  convocatoria_activa: true, estado_validacion: "PENDIENTE", emailCoordinador: "l@ebro.test", nombreCoordinador: "Luis",
  telefonoCoordinador: "600", descripcion_puesto: "Taller", domicilioLegal: "C/ Mayor 1", cpLegal: "50001",
  provinciaLegal: "Zaragoza", localidadLegal: "Zaragoza", municipioLegal: "Zaragoza", transportes: [],
  especialidades: [{ id_especialidad: 2, nombre: "Joyería", cantidad_alumnos: 2 }],
};

function api(extra = {}) {
  return simularApi({
    "GET /especialidades": [{ id_especialidad: 2, nombre: "Joyería" }, { id_especialidad: 3, nombre: "Desarrollo web" }],
    "GET /transportes": [{ id_transporte: 1, nombre_mostrar: "Autobús" }],
    "GET /solicitudes/empresa/mia": MIA,
    "GET /solicitudes/empresa/10": DATOS,
    "GET /solicitudes/empresa/10/documentos": [],
    "GET /solicitudes/empresa/10/especialidades": [{ id_solicitud_empresa_especialidad: 5, id_especialidad: 2, nombre: "Joyería", cantidad_alumnos: 2, plazas_ocupadas: 0 }],
    "GET /solicitudes/empresa/10/cambios": { pending: null, ultimo: null },
    "GET /reservas/empresa": [],
    "GET /documentos/empresa": { items: [] },
    "GET /tutores/empresa": [],
    ...extra,
  });
}

beforeEach(() => iniciarSesion({ id: 3, rol: "EMPRESA", nombre: "ACME", cif: "B12345674" }));

test("only companies: anyone else is sent to the login", () => {
  iniciarSesion({ id: 1, rol: "ALUMNO" });
  api();
  renderPagina(<CompanyView />, { ruta: "/companyMain", patron: "/companyMain" });
  expect(screen.getByTestId("ruta")).toHaveTextContent("/login");
});

test("loads the company and tells it what it is waiting for", async () => {
  api();
  renderPagina(<CompanyView />);
  expect(await screen.findByRole("heading", { name: "Talleres Ebro" })).toBeInTheDocument();
  expect(screen.getByText(/B12345674 · Convocatoria 2026\/2027/)).toBeInTheDocument();
  expect(screen.getByText(/El centro validará vuestra solicitud cuando el convenio esté firmado/)).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Datos de la empresa" })).toHaveAttribute("aria-selected", "true");
});

test("a validated company with reservations is pointed to the student list", async () => {
  api({
    "GET /solicitudes/empresa/mia": { ...MIA, estado_validacion: "VALIDADO" },
    "GET /solicitudes/empresa/10": { ...DATOS, estado_validacion: "VALIDADO" },
    "GET /reservas/empresa": [{ id_reserva: 8, alumno: "Ana", estado_reserva: "PENDIENTE", documentos_resumen: { anexo: { clave: "ANEXO_II", estado_operativo: "PENDIENTE_FIRMA", firmas_pendientes: ["EMPRESA"], id_documento: 4 } } }],
  });
  renderPagina(<CompanyView />);
  expect(await screen.findByText("Tenéis 1 reserva activa.")).toBeInTheDocument();
  expect(screen.getByText(/Reserva de Ana: firmar el Anexo II/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ver alumnos disponibles" }));
  expect(screen.getByTestId("ruta")).toHaveTextContent("/alumnos");
});

test("a company without any application is told so", async () => {
  api({ "GET /solicitudes/empresa/mia": { status: 404, body: { error: "No hay solicitud", code: "SIN_SOLICITUD" } } });
  renderPagina(<CompanyView />);
  expect(await screen.findByText("Vuestra empresa no tiene ninguna solicitud registrada.")).toBeInTheDocument();
});

test("a section that fails to load says so and can be retried", async () => {
  let fallos = 1;
  api({ "GET /documentos/empresa": () => (fallos-- > 0 ? { status: 500, body: {} } : { items: [] }) });
  renderPagina(<CompanyView />);
  await screen.findByRole("heading", { name: "Talleres Ebro" });
  fireEvent.click(screen.getByRole("tab", { name: "Documentos" }));
  await screen.findByText("No se pudieron cargar los datos.");
  const alerta = screen.getAllByRole("alert").find((a) => a.textContent.includes("No se pudieron cargar los datos."));
  fireEvent.click(within(alerta).getByRole("button", { name: "Reintentar" }));
  await waitFor(() => expect(screen.queryByText("No se pudieron cargar los datos.")).toBeNull());
});

test("re-applying in a new convocatoria: needs a ciclo, sends the chosen ones, explains refusals", async () => {
  const anterior = { ...MIA, convocatoria_activa: false, convocatoria: "2025/2026", puede_reaplicar: true, convocatoria_abierta: { nombre: "2026/2027" } };
  let respuesta = { status: 409, body: { error: "x", code: "SOLICITUD_EXISTENTE" } };
  const { llamadas } = api({
    "GET /solicitudes/empresa/mia": anterior,
    "GET /solicitudes/empresa/10": { ...DATOS, convocatoria_activa: false },
    "POST /solicitudes/empresa/reapply": () => respuesta,
  });
  renderPagina(<CompanyView />);
  expect(await screen.findByText(/todavía no participa en la convocatoria 2026\/2027/)).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Participar" })[0]);
  const enviar = await screen.findByRole("button", { name: "Enviar reaplicación" });

  fireEvent.click(screen.getByLabelText(/Joyería/));
  fireEvent.click(enviar);
  expect(await screen.findByText("Selecciona al menos un ciclo.")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText(/Desarrollo web/));
  fireEvent.change(screen.getByLabelText("Teléfono coordinador principal"), { target: { value: "611" } });
  fireEvent.click(enviar);
  expect(await screen.findByText("Ya existe una solicitud para la convocatoria activa.")).toBeInTheDocument();
  const body = llamadas.find((l) => l.path.endsWith("/reapply")).body;
  expect(body).toMatchObject({ telefonoCoordinador: "611", especialidades: [{ idEspecialidad: 3, cantidadAlumnos: 1 }] });

  respuesta = { status: 409, body: { error: "x", code: "SIN_CONVOCATORIA" } };
  fireEvent.click(enviar);
  expect(await screen.findByText("No hay ninguna convocatoria abierta en este momento.")).toBeInTheDocument();
});

test("a data change request is sent for review, without the CIF", async () => {
  const { llamadas } = api({ "POST /solicitudes/empresa/10/cambios": { message: "Cambios enviados para revisión", cambio: {} } });
  renderPagina(<CompanyView />);
  await screen.findByRole("heading", { name: "Talleres Ebro" });
  fireEvent.click(screen.getByRole("button", { name: "Editar datos" }));
  const dialogo = await screen.findByRole("dialog");
  expect(within(dialogo).getByText("El CIF no se puede modificar.")).toBeInTheDocument();
  fireEvent.change(within(dialogo).getByLabelText(/^Web/), { target: { value: "https://ebro.test" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Enviar para revisión" }));
  expect(await screen.findByText("Cambios enviados para revisión")).toBeInTheDocument();
  const body = llamadas.find((l) => l.path.endsWith("/cambios") && l.method === "POST").body;
  expect(body.web).toBe("https://ebro.test");
  expect("cif" in body).toBe(false);
});

test("a pending change request is shown and edited, not duplicated", async () => {
  api({ "GET /solicitudes/empresa/10/cambios": { pending: { id_cambio: 4, proposed: { web: "https://n.test" }, diff: [{ field: "web", label: "Web", actual: "—", solicitado: "https://n.test" }] }, ultimo: { estado: "RECHAZADO", motivo: "Datos falsos" } } });
  renderPagina(<CompanyView />);
  expect(await screen.findByText("Cambios enviados para revisión")).toBeInTheDocument();
  expect(screen.getByText("https://n.test")).toBeInTheDocument();
  expect(screen.getByText(/Vuestros cambios de datos están pendientes/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Modificar solicitud pendiente" }));
  const dialogo = await screen.findByRole("dialog");
  expect(within(dialogo).getByLabelText(/^Web/)).toHaveValue("https://n.test");
  expect(within(dialogo).getByRole("button", { name: "Actualizar solicitud de cambios" })).toBeInTheDocument();
});
