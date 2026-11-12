// The public student application form: school email, ciclo, personal data
// (with a legal guardian for minors), contact, Social Security number, PDFs,
// password, and exactly what is uploaded.
import { fireEvent, screen, within } from "@testing-library/react";
import AddDualStudent from "./index.js";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";

jest.mock("../../hooks/useConvocatoriaEstado.js", () => ({
  useConvocatoriaEstado: () => ({ status: "ready", data: { abierta: true, activa: { nombre: "2026/2027" } }, error: null }),
  loadConvocatoriaEstado: async () => ({ abierta: true }),
}));

const ESP = [{ id_especialidad: 2, nombre: "Joyería", turno: "DIURNO" }, { id_especialidad: 3, nombre: "Desarrollo web", turno: null }];
const escribir = (label, valor) => fireEvent.change(screen.getByLabelText(new RegExp(`^${label.replace(/[()/]/g, "\\$&")}`)), { target: { value: valor } });
const siguiente = () => fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
const errores = () => (screen.queryAllByRole("alert").map((e) => e.textContent).join(" "));
const pdf = (name = "cv.pdf") => new File(["%PDF-1.4"], name, { type: "application/pdf" });
const ETIQUETA_ARCHIVO = { "campo-cv": /^Currículum \(PDF\)/, "campo-anexoDga": /^Anexo DGA \(PDF\)/ };
const subir = (id, file) => fireEvent.change(screen.getAllByLabelText(ETIQUETA_ARCHIVO[id])[0], { target: { files: [file] } });

beforeEach(() => iniciarSesion(null));

async function pasoCiclo() {
  escribir("Email del centro", " ana.ruiz@zaragoza.salesianos.edu ");
  await screen.findByRole("option", { name: "Joyería (diurno)" });
  fireEvent.change(screen.getByLabelText(/^Ciclo \(especialidad\)/), { target: { value: "2" } });
  siguiente();
  await screen.findByRole("heading", { name: "Datos personales" });
}
function pasoPersonales({ nacimiento = "2000-05-01" } = {}) {
  escribir("DNI / NIE", "12345678z");
  escribir("Nombre y apellidos", "Ana Ruiz Gil");
  escribir("Fecha de nacimiento", nacimiento);
  escribir("Nacionalidad", "Española");
  fireEvent.click(screen.getByLabelText("Mujer"));
}
function pasoContacto() {
  escribir("Email personal", "ana@example.test");
  escribir("Teléfono", "600123456");
  escribir("Domicilio", "C/ Sol 2");
  escribir("Código postal", "50002");
  escribir("Localidad", "Zaragoza");
  fireEvent.click(within(screen.getByRole("group", { name: /carnet de conducir/ })).getByLabelText("Sí"));
  fireEvent.click(within(screen.getByRole("group", { name: /vehículo/ })).getByLabelText("No"));
  escribir("Idiomas y nivel", "Inglés B2");
}

test("ciclo step: only the school email, and a ciclo must be chosen", async () => {
  simularApi({ "GET /especialidades": ESP });
  renderPagina(<AddDualStudent />);
  escribir("Email del centro", "ana@gmail.com");
  siguiente();
  expect(errores()).toMatch(/@zaragoza\.salesianos\.edu/);
  expect(errores()).toMatch(/Elige tu ciclo/);
  expect(await screen.findByRole("option", { name: "Joyería (diurno)" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Desarrollo web" })).toBeInTheDocument();
});

test("ciclo list can be retried after a failure", async () => {
  let fallos = 1;
  simularApi({ "GET /especialidades": () => (fallos-- > 0 ? { status: 500, body: {} } : ESP) });
  renderPagina(<AddDualStudent />);
  fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
  expect(await screen.findByRole("option", { name: "Joyería (diurno)" })).toBeInTheDocument();
});

test("personal data: a real DNI/NIE; a minor needs the legal guardian", async () => {
  simularApi({ "GET /especialidades": ESP });
  renderPagina(<AddDualStudent />);
  await pasoCiclo();
  pasoPersonales();
  escribir("DNI / NIE", "12345678A");
  siguiente();
  expect(errores()).toMatch(/No es un DNI\/NIE válido/);

  const hoy = new Date();
  const menor = `${hoy.getFullYear() - 16}-01-15`;
  pasoPersonales({ nacimiento: menor });
  siguiente();
  expect(errores()).toMatch(/Nombre del tutor legal/);
  escribir("Nombre del tutor legal", "Pedro Ruiz");
  escribir("DNI/NIE del tutor legal", "X1234567A");
  siguiente();
  expect(errores()).toMatch(/DNI\/NIE del tutor legal: No es un DNI\/NIE válido/);
  escribir("DNI/NIE del tutor legal", "x1234567l");
  siguiente();
  expect(await screen.findByRole("heading", { name: "Contacto y movilidad" })).toBeInTheDocument();
});

test("contact: 9-digit phone, 5-digit postal code, choices answered, a valid Social Security number if given", async () => {
  simularApi({ "GET /especialidades": ESP });
  renderPagina(<AddDualStudent />);
  await pasoCiclo();
  pasoPersonales();
  siguiente();
  await screen.findByRole("heading", { name: "Contacto y movilidad" });
  siguiente();
  expect(errores()).toMatch(/Carnet de conducir: Elige una opción/);
  pasoContacto();
  escribir("Teléfono", "600 12");
  escribir("Código postal", "5000");
  escribir("Nº de la Seguridad Social", "123456789012");
  siguiente();
  expect(errores()).toMatch(/teléfono de 9 cifras/);
  expect(errores()).toMatch(/5 cifras del código postal/);
  expect(errores()).toMatch(/12 cifras y ser un número válido/);
  escribir("Teléfono", "600123456");
  escribir("Código postal", "50002");
  const numero = "2812345678";
  escribir("Nº de la Seguridad Social", `${numero}${String(Number(numero) % 97).padStart(2, "0")}`);
  siguiente();
  expect(await screen.findByRole("heading", { name: "Documentos" })).toBeInTheDocument();
});

test("documents must be PDFs; the whole application is uploaded once with both files", async () => {
  const { llamadas } = simularApi({ "GET /especialidades": ESP, "POST /solicitudes/alumno": { message: "ok", cuenta_existente: true } });
  renderPagina(<AddDualStudent />);
  await pasoCiclo();
  pasoPersonales();
  siguiente();
  pasoContacto();
  siguiente();
  await screen.findByRole("heading", { name: "Documentos" });
  siguiente();
  expect(errores()).toMatch(/Adjunta tu currículum/);
  subir("campo-cv", new File(["x"], "cv.docx", { type: "application/msword" }));
  subir("campo-anexoDga", pdf("dga.pdf"));
  siguiente();
  expect(errores()).toMatch(/debe ser un PDF/);
  subir("campo-cv", pdf("cv.pdf"));
  siguiente();
  escribir("Contraseña", "secreta1");
  escribir("Repetir contraseña", "secreta1");
  siguiente();
  await screen.findByRole("heading", { name: "Revisión y envío" });
  fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
  expect(await screen.findByText("Solicitud enviada")).toBeInTheDocument();
  expect(screen.getByText(/la contraseña que ya tenías/)).toBeInTheDocument();

  const envio = llamadas.filter((l) => l.method === "POST");
  expect(envio).toHaveLength(1);
  const fd = envio[0].body;
  expect(fd.get("dni")).toBe("12345678Z");
  expect(fd.get("emailColegio")).toBe("ana.ruiz@zaragoza.salesianos.edu");
  expect(fd.get("id_especialidad_dual")).toBe("2");
  expect(fd.get("carnetDeConducir")).toBe("1");
  expect(fd.get("tieneCoche")).toBe("0");
  expect(fd.get("tutorLegal")).toBe("", "adults send no guardian");
  expect(fd.get("cv").name).toBe("cv.pdf");
  expect(fd.get("anexoDga").name).toBe("dga.pdf");
  expect(fd.get("password")).toBe("secreta1");

  fireEvent.click(screen.getByRole("button", { name: "Presentar otra solicitud" }));
  expect(await screen.findByRole("heading", { name: "Ciclo" })).toBeInTheDocument();
  expect(screen.getByLabelText(/^Email del centro/)).toHaveValue("");
});

test("a refusal from the server is shown and nothing is lost", async () => {
  simularApi({ "GET /especialidades": ESP, "POST /solicitudes/alumno": { status: 401, body: { error: "No se ha podido verificar tu identidad." } } });
  renderPagina(<AddDualStudent />);
  await pasoCiclo();
  pasoPersonales();
  siguiente();
  pasoContacto();
  siguiente();
  await screen.findByRole("heading", { name: "Documentos" });
  subir("campo-cv", pdf("cv.pdf"));
  subir("campo-anexoDga", pdf("dga.pdf"));
  siguiente();
  escribir("Contraseña", "secreta1");
  escribir("Repetir contraseña", "secreta1");
  siguiente();
  await screen.findByRole("heading", { name: "Revisión y envío" });
  fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
  expect(await screen.findByText("No se ha podido verificar tu identidad.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Revisión y envío" })).toBeInTheDocument();
});
