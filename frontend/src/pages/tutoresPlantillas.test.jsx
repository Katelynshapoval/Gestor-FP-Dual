// The company's tutors tab (add, edit, deactivate; the principal coordinator
// is never edited here) and the staff templates tab (DOCX only, the convenio
// warning and generating the missing convenios).
import { fireEvent, screen, within } from "@testing-library/react";
import TutoresEmpresa from "./CompanyView/TutoresEmpresa.jsx";
import Plantillas from "./AdminDocumentsView/Plantillas.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../testUtils";

// ── Tutors ──────────────────────────────────────────────────────────────────

const TUTORES = [
  { id_empresa_tutor: 1, nombre: "Luis", email: "l@acme.test", telefono: "600", cargo: "Coordinador", activo: 1, es_coordinador: 1 },
  { id_empresa_tutor: 2, nombre: "Pepe", email: "p@acme.test", telefono: "611", cargo: "Tutor", dni: "", activo: 1, es_coordinador: 0 },
];

describe("tutors", () => {
  beforeEach(() => iniciarSesion({ id: 3, rol: "EMPRESA" }));

  test("the principal coordinator is shown but can only be changed through «Editar datos»", async () => {
    simularApi({ "GET /tutores/empresa": TUTORES });
    renderPagina(<TutoresEmpresa />);
    expect(await screen.findByText("Coordinador principal")).toBeInTheDocument();
    expect(screen.getByText(/Datos de la empresa › Editar datos/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Editar" })).toHaveLength(1, "only Pepe");
    expect(screen.getAllByRole("button", { name: "Desactivar" })).toHaveLength(1);
  });

  test("adding a tutor: name, email and phone needed; sends the form and reloads; a refusal is shown", async () => {
    let respuesta = { status: 409, body: { error: "Este contacto ya está registrado como tutor de la empresa." } };
    const { llamadas } = simularApi({ "GET /tutores/empresa": TUTORES, "POST /tutores/empresa": () => respuesta });
    renderPagina(<TutoresEmpresa />);
    fireEvent.click(await screen.findByRole("button", { name: "Añadir tutor" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Eva" } });
    fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "622" } });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "eva@acme.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Este contacto ya está registrado como tutor de la empresa.")).toBeInTheDocument();
    respuesta = { id_empresa_tutor: 3 };
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Tutor añadido.")).toBeInTheDocument();
    expect(llamadas.filter((l) => l.method === "POST").at(-1).body).toMatchObject({ nombre: "Eva", email: "eva@acme.test", telefono: "622" });
    expect(llamadas.filter((l) => l.path === "/tutores/empresa" && l.method === "GET").length).toBe(2);
  });

  test("editing sends the changed data", async () => {
    const { llamadas } = simularApi({ "GET /tutores/empresa": TUTORES, "PATCH /tutores/2": {} });
    renderPagina(<TutoresEmpresa />);
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByDisplayValue("Tutor"), { target: { value: "Jefe de taller" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Tutor actualizado.")).toBeInTheDocument();
    expect(llamadas.find((l) => l.method === "PATCH").body).toEqual({ nombre: "Pepe", dni: "", email: "p@acme.test", telefono: "611", cargo: "Jefe de taller" });
  });

  test("deactivating asks first", async () => {
    const { llamadas } = simularApi({ "GET /tutores/empresa": TUTORES, "POST /tutores/2/desactivar": {} });
    renderPagina(<TutoresEmpresa />);
    fireEvent.click(await screen.findByRole("button", { name: "Desactivar" }));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("¿Desactivar a Pepe?");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Desactivar" }));
    expect(await screen.findByText("Tutor desactivado.")).toBeInTheDocument();
    expect(llamadas.some((l) => l.path === "/tutores/2/desactivar")).toBe(true);
  });
});

// ── Templates ───────────────────────────────────────────────────────────────

const TIPOS = [
  { clave: "CONVENIO", nombre: "Convenio", activa: null, versiones: [] },
  { clave: "ANEXO_II", nombre: "Anexo II", activa: { id_plantilla: 4, version: 2, nombre_archivo: "a2.docx" }, versiones: [{ id_plantilla: 4, version: 2, es_activa: true }] },
];

describe("templates", () => {
  beforeEach(() => iniciarSesion({ id: 1, rol: "ADMINISTRADOR" }));

  test("without a convenio template the waiting applications are counted", async () => {
    simularApi({ "GET /documentos/plantillas": { tipos: TIPOS, convenio: { plantilla_activa: false, solicitudes_sin_convenio: 3, convocatoria: "2026/2027" } } });
    renderPagina(<Plantillas />);
    expect(await screen.findByText(/3 solicitudes de empresa esperan su convenio en la convocatoria 2026\/2027/)).toBeInTheDocument();
    expect(screen.getByText("Sin plantilla")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reemplazar" })).toBeInTheDocument();
  });

  test("upload: a file is required and must be DOCX; then it is sent with its type", async () => {
    const { llamadas } = simularApi({
      "GET /documentos/plantillas": { tipos: TIPOS, convenio: { plantilla_activa: true, solicitudes_sin_convenio: 0 } },
      "POST /documentos/plantillas": { message: "Plantilla de Convenio actualizada." },
    });
    renderPagina(<Plantillas />);
    const subir = await screen.findByRole("button", { name: "Subir plantilla" });
    fireEvent.click(subir);
    expect(await screen.findByText("Selecciona un archivo DOCX.")).toBeInTheDocument();
    const input = screen.getByLabelText("Plantilla DOCX para Convenio");
    fireEvent.change(input, { target: { files: [new File(["x"], "convenio.pdf")] } });
    fireEvent.click(subir);
    expect(await screen.findByText("La plantilla tiene que ser un archivo DOCX.")).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [new File(["PK"], "convenio.docx")] } });
    fireEvent.click(subir);
    expect(await screen.findByText("Plantilla de Convenio actualizada.")).toBeInTheDocument();
    const fd = llamadas.find((l) => l.method === "POST").body;
    expect(fd.get("clave")).toBe("CONVENIO");
    expect(fd.get("archivo").name).toBe("convenio.docx");
  });

  test("missing convenios are generated after confirming; failures are listed", async () => {
    const { llamadas } = simularApi({
      "GET /documentos/plantillas": { tipos: TIPOS, convenio: { plantilla_activa: true, solicitudes_sin_convenio: 2, convocatoria: "2026/2027" } },
      "POST /documentos/convenios/generar-pendientes": { message: "1 de 2 convenios generados.", fallidos: [{ id_solicitud_empresa: 11, empresa: "Beta", error: "Faltan datos" }] },
    });
    renderPagina(<Plantillas />);
    fireEvent.click(await screen.findByRole("button", { name: "Generar convenios pendientes" }));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("2 solicitudes de empresa");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Generar" }));
    expect(await screen.findByText("Beta: Faltan datos", { exact: false })).toBeInTheDocument();
    expect(llamadas.some((l) => l.path === "/documentos/convenios/generar-pendientes")).toBe(true);
  });

  test("a load failure can be retried", async () => {
    let fallos = 1;
    simularApi({ "GET /documentos/plantillas": () => (fallos-- > 0 ? { status: 500, body: { error: "Caída" } } : { tipos: TIPOS, convenio: null }) });
    renderPagina(<Plantillas />);
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Anexo II")).toBeInTheDocument();
  });
});
