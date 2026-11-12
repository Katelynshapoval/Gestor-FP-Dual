// The «Correos» editor: list and selection, editing with variables, live
// preview and its errors, saving (and the 409 when someone else saved),
// discarding, history and restore, test email, and the attachments panel.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import Correos from "./Correos.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";

const correo = (extra = {}) => ({
  clave: "reserva_confirmada_alumno", grupo: "RESERVAS", nombre: "Plaza confirmada", destinatario: "Alumno",
  cuando: "Cuando el centro confirma.", asunto: "Tu plaza", cuerpo: "Hola {{alumno}}.", activa: true,
  lleva_adjuntos: false, admite_adjuntos: true, desactivable: true, version: 1, actualizado_en: null, actualizado_por: null,
  variables: [
    { variable: "alumno", tipo: "TEXTO", etiqueta: "Nombre del alumno", descripcion: "Nombre", ejemplo: "Ana", fragmento: "{{alumno}}", opcional: false, obligatoria: false },
    { variable: "motivo", tipo: "TEXTO", etiqueta: "Motivo", descripcion: "Motivo", ejemplo: "x", fragmento: "{{#motivo}}Motivo: {{motivo}}{{/motivo}}", opcional: true, obligatoria: false },
  ],
  adjuntos: [], documentos_disponibles: [{ documento: "ANEXO_II", nombre: "Anexo II", adjunto: false, plantilla_activa: { version: 2, nombre_archivo: "a2.docx" } }],
  limites: { max_archivos: 5, max_bytes: 5 * 1024 * 1024 },
  historial: [
    { version: 2, asunto: "Tu plaza", cuerpo: "Hola {{alumno}}.", activa: true, lleva_adjuntos: false, adjuntos: null, creado_en: "2026-11-10T10:00:00Z", usuario: "Admin" },
    { version: 1, asunto: "Original", cuerpo: "Texto original", activa: true, lleva_adjuntos: false, adjuntos: null, creado_en: "2026-11-01T10:00:00Z", usuario: null },
  ],
  problemas: [], avisos_adjuntos: [], ...extra,
});
const LISTA = {
  correos: [
    { clave: "reserva_confirmada_alumno", grupo: "RESERVAS", nombre: "Plaza confirmada", destinatario: "Alumno", asunto: "Tu plaza", activa: true, lleva_adjuntos: false, n_adjuntos: 0, editado: true, problemas: [] },
    { clave: "pie", grupo: "GENERAL", nombre: "Pie de todos los correos", destinatario: "Todos", asunto: "Pie", activa: true, lleva_adjuntos: false, n_adjuntos: 0, editado: false, problemas: ["Error"] },
  ],
  faltan: [],
};

function api(extra = {}) {
  return simularApi({
    "GET /correos": LISTA,
    "GET /correos/:clave": (req) => (req.path.endsWith("/pie") ? correo({ clave: "pie", nombre: "Pie de todos los correos", admite_adjuntos: false, desactivable: false }) : correo()),
    "POST /correos/:clave/vista-previa": (req) => ({ asunto: req.body.asunto, html: `<p>${req.body.cuerpo}</p>`, adjuntos: [] }),
    ...extra,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  iniciarSesion({ id: 1, rol: "ADMINISTRADOR", nombre: "Admin" });
});
afterEach(() => {
  act(() => vi.runOnlyPendingTimers());
  vi.useRealTimers();
});

async function abrir(extra) {
  const sim = api(extra);
  renderPagina(<Correos />, { ruta: "/correos", patron: "/correos" });
  await screen.findByRole("heading", { name: "Plaza confirmada" });
  return sim;
}
const asunto = () => screen.getByLabelText("Asunto");
const cuerpo = () => screen.getByLabelText("Texto del correo");
const guardar = () => screen.getByRole("button", { name: "Guardar cambios" });
const previa = () => act(() => vi.advanceTimersByTime(400));

test("lists the emails by group and opens the first one, with its text and variables", async () => {
  await abrir();
  const nav = screen.getByRole("navigation", { name: "Correos" });
  expect(within(nav).getByText("Reservas")).toBeInTheDocument();
  expect(within(nav).getByText("· Editado")).toBeInTheDocument();
  expect(within(nav).getByTitle("Tiene errores: no se envía")).toBeInTheDocument();
  expect(asunto()).toHaveValue("Tu plaza");
  expect(cuerpo()).toHaveValue("Hola {{alumno}}.");
  expect(screen.getByRole("button", { name: /Nombre del alumno/ })).toBeInTheDocument();
  expect(guardar()).toBeDisabled();
});

test("editing marks the email unsaved; the preview follows the draft", async () => {
  const { llamadas } = await abrir();
  fireEvent.change(asunto(), { target: { value: "Plaza confirmada, {{alumno}}" } });
  expect(screen.getAllByText("Sin guardar").length).toBeGreaterThan(0);
  expect(guardar()).toBeEnabled();
  previa();
  await waitFor(() => expect(llamadas.some((l) => l.path.endsWith("/vista-previa") && l.body.asunto === "Plaza confirmada, {{alumno}}")).toBe(true));
});

test("a variable chip inserts its fragment where the cursor was", async () => {
  await abrir();
  const area = cuerpo();
  area.setSelectionRange(5, 5);
  fireEvent.select(area);
  fireEvent.focus(area);
  fireEvent.click(screen.getByRole("button", { name: /Motivo/ }));
  expect(cuerpo()).toHaveValue("Hola {{#motivo}}Motivo: {{motivo}}{{/motivo}}{{alumno}}.");
});

test("errors from the preview are listed and block saving", async () => {
  await abrir({ "POST /correos/:clave/vista-previa": { errores: ["La variable «{{nope}}» no existe en este correo."] } });
  fireEvent.change(cuerpo(), { target: { value: "Hola {{nope}}" } });
  previa();
  expect(await screen.findByText(/no existe en este correo/)).toBeInTheDocument();
  expect(guardar()).toBeDisabled();
});

test("saving sends the draft with its version and the attachments switch", async () => {
  const { llamadas } = await abrir({
    "PUT /correos/:clave": (req) => ({ message: "Correo guardado.", correo: correo({ ...req.body, version: 2 }) }),
  });
  fireEvent.change(asunto(), { target: { value: "Nuevo asunto" } });
  fireEvent.click(screen.getByRole("switch", { name: /Lleva adjuntos/ }));
  fireEvent.click(guardar());
  expect(await screen.findByText("Correo guardado.")).toBeInTheDocument();
  const put = llamadas.find((l) => l.method === "PUT");
  expect(put.body).toEqual({ asunto: "Nuevo asunto", cuerpo: "Hola {{alumno}}.", activa: true, lleva_adjuntos: true, version: 1 });
  await waitFor(() => expect(guardar()).toBeDisabled());
});

test("if someone else saved meanwhile, the editor says so and can load their version", async () => {
  let cargas = 0;
  const { llamadas } = await abrir({
    "PUT /correos/:clave": { status: 409, body: { error: "Otra persona ha guardado este correo.", code: "VERSION_CAMBIADA" } },
    "GET /correos/:clave": () => { cargas += 1; return correo({ asunto: cargas > 1 ? "Su asunto" : "Tu plaza", version: cargas }); },
  });
  fireEvent.change(asunto(), { target: { value: "Mi asunto" } });
  fireEvent.click(guardar());
  expect(await screen.findByText(/mientras lo editabas/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cargar su versión" }));
  await waitFor(() => expect(asunto()).toHaveValue("Su asunto"));
  expect(llamadas.filter((l) => l.method === "GET" && l.path === "/correos/reserva_confirmada_alumno").length).toBe(2);
});

test("discarding asks first and restores the saved text", async () => {
  await abrir();
  fireEvent.change(asunto(), { target: { value: "Borrador" } });
  fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
  const dialogo = await screen.findByRole("dialog");
  fireEvent.click(within(dialogo).getByRole("button", { name: "Descartar" }));
  await waitFor(() => expect(asunto()).toHaveValue("Tu plaza"));
});

test("switching off shows the warning; a mandatory email has no switch", async () => {
  await abrir();
  fireEvent.click(screen.getByRole("switch", { name: /Activo/ }));
  expect(screen.getByText(/este correo no se envía\s+a nadie/)).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Correos" })).getByText("Pie de todos los correos"));
  fireEvent.click(await screen.findByRole("button", { name: "Descartar y cambiar" }));
  await screen.findByRole("heading", { name: "Pie de todos los correos" });
  expect(screen.getByText("Siempre activo")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Adjuntos" })).toBeNull();
});

test("history: restoring a version asks and posts it", async () => {
  const { llamadas } = await abrir({
    "GET /correos/:clave": correo({ version: 2 }),
    "POST /correos/:clave/restaurar": { message: "Restaurado el texto de la versión 1.", correo: correo({ asunto: "Original", version: 3 }) },
  });
  fireEvent.click(screen.getByRole("button", { name: "Historial" }));
  const dialogo = await screen.findByRole("dialog", { name: "Historial de cambios" });
  expect(within(dialogo).getAllByRole("button", { name: "Restaurar" })).toHaveLength(1, "the current version has no restore button");
  fireEvent.click(within(dialogo).getByRole("button", { name: "Restaurar" }));
  const confirmar = await screen.findByRole("dialog", { name: /Restaurar el texto original/ });
  expect(confirmar).toHaveTextContent("Los adjuntos no cambian.");
  fireEvent.click(within(confirmar).getByRole("button", { name: "Restaurar" }));
  await waitFor(() => expect(asunto()).toHaveValue("Original"));
  expect(llamadas.find((l) => l.path.endsWith("/restaurar")).body).toEqual({ desde: 1, version: 2 });});

test("sending a test email: the draft goes and the server's message is shown", async () => {
  const { llamadas } = await abrir({ "POST /correos/:clave/prueba": { enviado: true, message: "Correo de prueba enviado a admin@centro.test." } });
  fireEvent.change(asunto(), { target: { value: "Prueba" } });
  fireEvent.click(screen.getByRole("button", { name: /Enviarme una prueba/ }));
  expect(await screen.findByText(/Correo de prueba enviado/)).toBeInTheDocument();
  expect(llamadas.find((l) => l.path.endsWith("/prueba")).body).toMatchObject({ asunto: "Prueba", lleva_adjuntos: false });
});

test("attachments: adding a generated document saves at once and keeps the draft text", async () => {
  const { llamadas } = await abrir({
    "POST /correos/:clave/adjuntos": {
      message: "«Anexo II» se adjuntará a este correo.",
      correo: correo({ version: 2, lleva_adjuntos: true, adjuntos: [{ id: 9, tipo: "DOCUMENTO", documento: "ANEXO_II", nombre: "Anexo II" }], documentos_disponibles: [{ documento: "ANEXO_II", nombre: "Anexo II", adjunto: true, plantilla_activa: { version: 2, nombre_archivo: "a2.docx" } }] }),
    },
  });
  fireEvent.change(asunto(), { target: { value: "Borrador sin guardar" } });
  fireEvent.click(screen.getByRole("button", { name: /Adjuntar Anexo II/ }));
  expect(await screen.findByText(/generado con la plantilla activa \(versión 2, a2\.docx\)/)).toBeInTheDocument();
  expect(llamadas.find((l) => l.path.endsWith("/adjuntos")).body).toEqual({ documento: "ANEXO_II", version: 1 });
  expect(asunto()).toHaveValue("Borrador sin guardar");
  expect(screen.getByRole("switch", { name: /Lleva adjuntos/ })).toBeChecked();
});

test("attachments: removing one asks first and sends the current version", async () => {
  const conAdjunto = correo({ lleva_adjuntos: true, adjuntos: [{ id: 9, tipo: "ARCHIVO", nombre: "Guía.pdf", tamano: 2048, subido_por: "Admin" }] });
  const { llamadas } = await abrir({
    "GET /correos/:clave": conAdjunto,
    "DELETE /correos/:clave/adjuntos/:id": { message: "«Guía.pdf» ya no se adjuntará.", correo: correo({ version: 2, lleva_adjuntos: true }) },
  });
  expect(screen.getByText(/PDF subido, el mismo para todos · 2 KB · Admin/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Quitar Guía.pdf" }));
  const dialogo = await screen.findByRole("dialog");
  expect(dialogo).toHaveTextContent("se borrará el PDF subido");
  fireEvent.click(within(dialogo).getByRole("button", { name: "Quitar" }));
  await screen.findByText("«Guía.pdf» ya no se adjuntará.");
  expect(llamadas.find((l) => l.method === "DELETE").url).toBe("/correos/reserva_confirmada_alumno/adjuntos/9?version=1");
});

test("missing templates are reported", async () => {
  api({ "GET /correos": { ...LISTA, faltan: ["nuevo_correo"] } });
  renderPagina(<Correos />, { ruta: "/correos", patron: "/correos" });
  expect(await screen.findByText(/Faltan plantillas en la base de datos \(nuevo_correo\)/)).toBeInTheDocument();
});
