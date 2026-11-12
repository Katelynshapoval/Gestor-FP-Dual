// The header (menu per role, sign out, mobile menu) and the document card
// used in the portals (upload only PDFs to the right endpoint, sign, review,
// generate and regenerate after confirming).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import Header from "./layout/Header/Header.jsx";
import DocumentoItem from "./DocumentoItem.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../testUtils";

// ── Header ──────────────────────────────────────────────────────────────────

describe("header", () => {
  test("a visitor gets the public menu and a way in", () => {
    iniciarSesion(null);
    simularApi();
    renderPagina(<Header />);
    const nav = screen.getAllByRole("navigation", { name: "Navegación principal" })[0];
    expect(within(nav).getByRole("link", { name: /Solicitud de empresa/ })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: /Configuración/ })).toBeNull();
  });

  test("an administrator gets the management menu; signing out ends the session", async () => {
    iniciarSesion({ id: 1, rol: "ADMINISTRADOR", nombre: "Admin" });
    simularApi();
    renderPagina(<Header />, { ruta: "/panel" });
    const nav = screen.getAllByRole("navigation", { name: "Navegación principal" })[0];
    for (const name of [/Panel/, /Alumnos/, /Empresas/, /Configuración/]) {
      expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
    }
    fireEvent.click(screen.getAllByRole("button", { name: /Salir/ })[0]);
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("/login"));
    expect(localStorage.getItem("user")).toBeNull();
  });

  test("a company only gets its portal, the student list and help", () => {
    iniciarSesion({ id: 3, rol: "EMPRESA", nombre: "ACME" });
    simularApi();
    renderPagina(<Header />);
    const nav = screen.getAllByRole("navigation", { name: "Navegación principal" })[0];
    const enlaces = within(nav).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(enlaces).toEqual(expect.arrayContaining(["/companyMain", "/alumnos", "/ayuda"]));
    expect(enlaces).not.toContain("/panel");
    expect(enlaces).not.toContain("/configuracion");
  });

  test("the mobile menu opens as a dialog and closes with Escape; the sidebar collapse is remembered", async () => {
    iniciarSesion({ id: 4, rol: "ALUMNO", nombre: "Ana" });
    simularApi();
    const plegar = vi.fn();
    renderPagina(<Header onSidebarToggle={plegar} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    const menu = screen.getByRole("dialog", { name: "Menú" });
    await waitFor(() => expect(menu).not.toHaveClass("invisible"));
    expect(within(menu).getByRole("link", { name: /Ayuda/ })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(menu).toHaveClass("invisible"));
    const boton = screen.getByRole("button", { name: "Contraer menú lateral" });
    expect(boton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(boton);
    expect(plegar).toHaveBeenCalledTimes(1);
  });

  test("a collapsed sidebar offers to expand it", () => {
    iniciarSesion({ id: 4, rol: "ALUMNO", nombre: "Ana" });
    simularApi();
    renderPagina(<Header sidebarCollapsed onSidebarToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "Expandir menú lateral" })).toHaveAttribute("aria-expanded", "false");
  });
});

// ── Document card ───────────────────────────────────────────────────────────

const doc = (extra) => ({
  clave: "CALENDARIO", nombre: "Calendario", id_documento: null, id_reserva: 8, estado_operativo: "PENDIENTE_SUBIDA",
  estado_operativo_label: "Pendiente de subir", firmas: [], puede_subir: true, puede_reemplazar: false,
  puede_firmar: false, puede_revisar: false, puede_generar: false, puede_regenerar: false, puede_ver: false, ...extra,
});
const pdf = (name = "doc.pdf") => new File(["%PDF"], name, { type: "application/pdf" });

describe("document card", () => {
  beforeEach(() => iniciarSesion({ id: 3, rol: "EMPRESA" }));

  test("only PDFs; uploads with the document's type and parent", async () => {
    const onRefresh = vi.fn();
    const { llamadas } = simularApi({ "POST /documentos/subir": { message: "Documento enviado." } });
    renderPagina(<DocumentoItem doc={doc()} onRefresh={onRefresh} />);
    const input = screen.getByLabelText("Archivo PDF de Calendario");
    expect(screen.getByRole("button", { name: "Subir" })).toBeDisabled();
    fireEvent.change(input, { target: { files: [new File(["x"], "foto.png", { type: "image/png" })] } });
    expect(screen.getByText("El archivo debe ser un PDF.")).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [pdf()] } });
    fireEvent.click(screen.getByRole("button", { name: "Subir" }));
    expect(await screen.findByText("Documento enviado.")).toBeInTheDocument();
    const fd = llamadas[0].body;
    expect([fd.get("clave"), fd.get("id_reserva"), fd.get("archivo").name]).toEqual(["CALENDARIO", "8", "doc.pdf"]);
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  test("the contract annex goes to its own endpoint and replaces the current file", async () => {
    const { llamadas } = simularApi({ "POST /documentos/reserva/8/anexo": {} });
    renderPagina(<DocumentoItem doc={doc({ clave: "ANEXO_II", nombre: "Anexo II", id_documento: 5, puede_subir: false, puede_reemplazar: true, firmas: [{ rol: "EMPRESA", estado: "PENDIENTE" }] })} onRefresh={vi.fn()} />);
    expect(screen.getByText(/declaras que lleva tu firma/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Archivo PDF de Anexo II"), { target: { files: [pdf("anexo.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "Reemplazar" }));
    expect(await screen.findByText("Documento reemplazado.")).toBeInTheDocument();
    expect(llamadas[0].path).toBe("/documentos/reserva/8/anexo");
  });

  test("sign, and a refusal keeps the server's message", async () => {
    let respuesta = { status: 409, body: { error: "Solo se firma la versión actual del documento." } };
    simularApi({ "POST /documentos/5/firmar": () => respuesta });
    renderPagina(<DocumentoItem doc={doc({ id_documento: 5, puede_subir: false, puede_firmar: true })} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Firmar" }));
    expect(await screen.findByText("Solo se firma la versión actual del documento.")).toBeInTheDocument();
    respuesta = {};
    fireEvent.click(screen.getByRole("button", { name: "Firmar" }));
    expect(await screen.findByText("Firma registrada.")).toBeInTheDocument();
  });

  test("staff review: validate, or reject with a reason", async () => {
    iniciarSesion({ id: 1, rol: "ADMINISTRADOR" });
    const { llamadas } = simularApi({ "POST /documentos/5/validar": {}, "POST /documentos/5/rechazar": {} });
    renderPagina(<DocumentoItem doc={doc({ id_documento: 5, puede_subir: false, puede_revisar: true })} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Validar" }));
    expect(await screen.findByText("Documento validado.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "Ilegible" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: /Rechazar/ }));
    expect(await screen.findByText("Documento rechazado.")).toBeInTheDocument();
    expect(llamadas.find((l) => l.path.endsWith("/rechazar")).body).toEqual({ motivo: "Ilegible" });
  });

  test("generate, and regenerate only after confirming", async () => {
    iniciarSesion({ id: 1, rol: "ADMINISTRADOR" });
    const { llamadas } = simularApi({ "POST /documentos/generar": { message: "Generado." } });
    const { unmount } = renderPagina(<DocumentoItem doc={doc({ clave: "ANEXO_II", nombre: "Anexo II", puede_subir: false, puede_generar: true })} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Generar/ }));
    await screen.findByText("Generado.");
    expect(llamadas[0].body).toMatchObject({ clave: "ANEXO_II", id_reserva: 8, regenerar: false });
    unmount();
    renderPagina(<DocumentoItem doc={doc({ clave: "ANEXO_II", nombre: "Anexo II", id_documento: 5, puede_subir: false, puede_regenerar: true })} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Regenerar/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Regenerar" }));
    await waitFor(() => expect(llamadas).toHaveLength(2));
    expect(llamadas[1].body).toMatchObject({ regenerar: true });
  });
});
