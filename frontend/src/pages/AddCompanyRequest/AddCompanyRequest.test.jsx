// The public company application form, step by step: closed outside a
// convocatoria, every step checked before moving on, the catalogue retry, and
// exactly what is sent (trimmed, uppercased, only the work address entered).
import { fireEvent, screen, within } from "@testing-library/react";
import AddCompanyRequest from "./index.js";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";

let mockEstadoConvocatoria = { abierta: true, activa: { nombre: "2026/2027" }, proxima: null };
jest.mock("../../hooks/useConvocatoriaEstado.js", () => ({
  useConvocatoriaEstado: () => ({ status: "ready", data: mockEstadoConvocatoria, error: null }),
  loadConvocatoriaEstado: async () => mockEstadoConvocatoria,
}));

const ESPECIALIDADES = [
  { id_especialidad: 2, nombre: "Joyería", codigo: "JOY", turno: 0 },
  { id_especialidad: 3, nombre: "Desarrollo web", codigo: "DAW", turno: 1 },
];
const TRANSPORTES = [{ id_transporte: 1, nombre: "bus", nombre_mostrar: "Autobús" }, { id_transporte: 4, nombre: "tren", nombre_mostrar: "Tren" }];

const escribir = (label, valor) => fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value: valor } });
const siguiente = () => fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
const errores = () => screen.queryByRole("alert") ? screen.getAllByRole("alert").map((e) => e.textContent).join(" ") : "";

beforeEach(() => {
  iniciarSesion(null);
  mockEstadoConvocatoria = { abierta: true, activa: { nombre: "2026/2027" }, proxima: null };
});

function rellenarEmpresa() {
  escribir("Razón social", "  Talleres Ebro S.L. ");
  escribir("CIF", "b1234 5674");
  escribir("Dirección fiscal", "C/ Mayor 1");
  escribir("Municipio", "Zaragoza");
  escribir("Provincia", "Zaragoza");
  escribir("Código postal", "50001");
}
function rellenarRepresentante() {
  escribir("Nombre y apellidos", "Ana López");
  escribir("DNI/NIE", "12345678z");
  escribir("Cargo", "Gerente");
  escribir("Email", "ana@ebro.test");
  escribir("Teléfono", "600 000 000");
}
function rellenarCoordinador() {
  escribir("Nombre y apellidos", "Luis Pérez");
  escribir("DNI/NIE", "x1234567l");
  escribir("Email", "luis@ebro.test");
  escribir("Teléfono", "611111111");
}

test("closed outside a convocatoria: no form, links to the portal", () => {
  mockEstadoConvocatoria = { abierta: false, activa: null, proxima: null };
  simularApi({ "GET /especialidades": ESPECIALIDADES, "GET /transportes": TRANSPORTES });
  renderPagina(<AddCompanyRequest />);
  expect(screen.getByText(/Ahora no se pueden presentar solicitudes de empresas/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Siguiente →" })).toBeNull();
  expect(screen.getByRole("link", { name: "Acceder al portal" })).toHaveAttribute("href", "/login");
});

test("each step is checked before moving on, with field-level messages", async () => {
  simularApi({ "GET /especialidades": ESPECIALIDADES, "GET /transportes": TRANSPORTES });
  renderPagina(<AddCompanyRequest />);
  siguiente();
  expect(await screen.findByRole("heading", { name: "Datos de la empresa" })).toBeInTheDocument();
  expect(errores()).toMatch(/Razón social: Este campo es obligatorio/);

  rellenarEmpresa();
  escribir("CIF", "B12345675");
  escribir("Código postal", "500");
  escribir("Teléfono de la empresa", "12");
  siguiente();
  expect(errores()).toMatch(/No es un CIF válido/);
  expect(errores()).toMatch(/5 cifras del código postal/);
  expect(errores()).toMatch(/teléfono válido/);
  expect(screen.getByLabelText(/^CIF/)).toHaveValue("B12345675", "uppercased and without spaces as typed");

  escribir("CIF", "B12345674");
  escribir("Código postal", "50001");
  escribir("Teléfono de la empresa", "");
  siguiente();
  expect(await screen.findByRole("heading", { name: "Responsable legal" })).toBeInTheDocument();

  escribir("DNI/NIE", "12345678A");
  escribir("Email", "no-es-email");
  siguiente();
  expect(errores()).toMatch(/No es un DNI\/NIE válido/);
  expect(errores()).toMatch(/email válido/);
});

test("ciclos: at least one, with at least one student each; the catalogue can be retried", async () => {
  let fallos = 1;
  simularApi({
    "GET /especialidades": () => (fallos-- > 0 ? { status: 500, body: {} } : ESPECIALIDADES),
    "GET /transportes": TRANSPORTES,
  });
  renderPagina(<AddCompanyRequest />);
  rellenarEmpresa(); siguiente();
  rellenarRepresentante(); siguiente();
  rellenarCoordinador(); siguiente();
  await screen.findByRole("heading", { name: "Puesto y ciclos" });
  fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
  expect(await screen.findByLabelText(/Joyería/)).toBeInTheDocument();

  escribir("Descripción del puesto", "Montaje");
  siguiente();
  expect(errores()).toMatch(/Marca al menos un ciclo/);
  fireEvent.click(screen.getByLabelText(/Joyería/));
  fireEvent.change(screen.getByLabelText("Alumnos"), { target: { value: "0" } });
  siguiente();
  expect(errores()).toMatch(/al menos un alumno en cada ciclo/);

  fireEvent.click(screen.getByLabelText(/El alumno trabajará en la dirección fiscal/));
  fireEvent.change(screen.getByLabelText("Alumnos"), { target: { value: "2" } });
  siguiente();
  expect(errores()).toMatch(/Dirección del lugar de trabajo/);
});

test("a complete application is sent once, cleaned, and the success page is shown", async () => {
  const { llamadas } = simularApi({
    "GET /especialidades": ESPECIALIDADES,
    "GET /transportes": TRANSPORTES,
    "POST /solicitudes/empresa": { message: "ok", id_solicitud_empresa: 9 },
  });
  renderPagina(<AddCompanyRequest />);
  rellenarEmpresa(); siguiente();
  rellenarRepresentante(); siguiente();
  rellenarCoordinador(); siguiente();
  await screen.findByLabelText(/Joyería/);
  escribir("Descripción del puesto", "  Montaje y mantenimiento ");
  fireEvent.click(screen.getByLabelText(/Joyería/));
  fireEvent.change(screen.getByLabelText("Alumnos"), { target: { value: "3" } });
  fireEvent.click(screen.getByLabelText("Tren"));
  siguiente();

  escribir("Contraseña", "secreta1");
  escribir("Repetir contraseña", "secreta2");
  siguiente();
  expect(errores()).toMatch(/no coinciden/);
  escribir("Repetir contraseña", "secreta1");
  siguiente();

  const revision = await screen.findByRole("heading", { name: "Revisión y envío" });
  expect(revision).toBeInTheDocument();
  expect(screen.getByText("Talleres Ebro S.L.", { exact: false })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
  expect(await screen.findByText("Solicitud enviada")).toBeInTheDocument();

  const envios = llamadas.filter((l) => l.method === "POST");
  expect(envios).toHaveLength(1);
  expect(envios[0].body).toEqual({
    cif: "B12345674", empresa: "Talleres Ebro S.L.", telefonoEmpresa: "", domicilioLegal: "C/ Mayor 1", cpLegal: "50001",
    provinciaLegal: "Zaragoza", localidadLegal: "Zaragoza", municipioLegal: "Zaragoza", mismoLugarTrabajo: true,
    dniRepresentante: "12345678Z", nombreRepresentante: "Ana López", emailRepresentante: "ana@ebro.test",
    telefonoRepresentante: "600 000 000", cargoRepresentante: "Gerente",
    dniCoordinador: "X1234567L", nombreCoordinador: "Luis Pérez", emailCoordinador: "luis@ebro.test",
    telefonoCoordinador: "611111111", cargoCoordinador: "COORDINADOR DUAL",
    descripcion_puesto: "Montaje y mantenimiento", especialidades: [{ idEspecialidad: 2, cantidadAlumnos: 3 }],
    transportes: [4], passwordCoordinador: "secreta1",
  });
});

test("a separate work address is sent only when entered; a server refusal keeps the data", async () => {
  const { llamadas } = simularApi({
    "GET /especialidades": ESPECIALIDADES,
    "GET /transportes": TRANSPORTES,
    "POST /solicitudes/empresa": { status: 409, body: { error: "Esta empresa ya está registrada." } },
  });
  renderPagina(<AddCompanyRequest />);
  rellenarEmpresa(); siguiente();
  rellenarRepresentante(); siguiente();
  rellenarCoordinador(); siguiente();
  await screen.findByLabelText(/Joyería/);
  escribir("Descripción del puesto", "Montaje");
  fireEvent.click(screen.getByLabelText(/Joyería/));
  fireEvent.click(screen.getByLabelText(/El alumno trabajará en la dirección fiscal/));
  escribir("Dirección del lugar de trabajo", "Pol. Norte 3");
  escribir("Municipio del lugar de trabajo", "Utebo");
  escribir("Provincia del lugar de trabajo", "Zaragoza");
  escribir("Código postal del lugar de trabajo", "50180");
  siguiente();
  escribir("Contraseña", "secreta1");
  escribir("Repetir contraseña", "secreta1");
  siguiente();
  await screen.findByRole("heading", { name: "Revisión y envío" });
  fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
  expect(await screen.findByText("Esta empresa ya está registrada.")).toBeInTheDocument();
  const body = llamadas.find((l) => l.method === "POST").body;
  expect(body).toMatchObject({
    mismoLugarTrabajo: false, domicilioTrabajo: "Pol. Norte 3", cpTrabajo: "50180",
    provinciaTrabajo: "Zaragoza", localidadTrabajo: "Utebo", municipioTrabajo: "Utebo",
  });
  expect(screen.getByRole("heading", { name: "Revisión y envío" })).toBeInTheDocument();
  const nav = screen.getByRole("navigation", { name: "Pasos del formulario" });
  expect(within(nav).getAllByRole("button").length).toBeGreaterThan(0);
});
