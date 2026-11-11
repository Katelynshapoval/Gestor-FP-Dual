// Staff document tracking («Documentos › Seguimiento»): filters and search
// sent to the server and kept in the address, paging, empty and error states,
// and each row's actions (validate, reject with a reason, sign, generate,
// regenerate after confirming, go to templates).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import Seguimiento from "./Seguimiento.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";

const item = (extra) => ({
  clave: "CV", nombre: "CV", contexto: "solicitud_alumno", id_documento: 1, id_solicitud_alumno: 40,
  alumno: "Ana Ruiz", especialidad: "Joyería", estado_operativo: "PENDIENTE_VALIDACION",
  estado_operativo_label: "Pendiente de validar", accion_pendiente_de: ["CENTRO"], firmas: [],
  puede_ver: false, puede_revisar: false, puede_firmar: false, puede_generar: false, puede_regenerar: false, ...extra,
});
const pagina = (items, extra = {}) => ({
  items,
  pagination: { page: 1, pageSize: 10, totalItems: items.length, totalPages: items.length ? 1 : 0 },
  summary: { total: items.length },
  filtros: {
    convocatorias: [{ value: "6", label: "2026/2027" }],
    documentos: [{ value: "CV", label: "CV" }, { value: "CONVENIO", label: "Convenio" }],
    estados: [{ value: "PENDIENTE_VALIDACION", label: "Pendiente de validar", count: 3 }],
    acciones: [{ value: "CENTRO", label: "Centro" }],
  },
  ...extra,
});

beforeEach(() => iniciarSesion({ id: 1, rol: "ADMINISTRADOR" }));

const peticiones = (llamadas) => llamadas.filter((l) => l.path === "/documentos/seguimiento").map((l) => new URL(l.url, "http://x").searchParams);

test("lists the documents with who must act; filters and search reach the server", async () => {
  const { llamadas } = simularApi({ "GET /documentos/seguimiento": pagina([item({ puede_revisar: true })]) });
  renderPagina(<Seguimiento />);
  expect(await screen.findByText("Ana Ruiz", { exact: false })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Pendiente de validar (3)" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Documento"), { target: { value: "CONVENIO" } });
  await waitFor(() => expect(peticiones(llamadas).at(-1).get("documento")).toBe("CONVENIO"));
  fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "  ruiz " } });
  await waitFor(() => expect(peticiones(llamadas).at(-1).get("search")).toBe("ruiz"), { timeout: 2000 });
  expect(peticiones(llamadas).at(-1).get("page")).toBe("1");
});

test("filters come from the address, so links from the dashboard open them already applied", async () => {
  const { llamadas } = simularApi({ "GET /documentos/seguimiento": pagina([]) });
  renderPagina(<Seguimiento />, { ruta: "/documentos?convocatoria=6&accionPendiente=CENTRO", patron: "/documentos" });
  await waitFor(() => expect(peticiones(llamadas).length).toBeGreaterThan(0));
  const p = peticiones(llamadas)[0];
  expect([p.get("convocatoria"), p.get("accionPendiente")]).toEqual(["6", "CENTRO"]);
  expect(await screen.findByText("No se han encontrado documentos con estos filtros.")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Limpiar filtros" }).at(-1));
  await waitFor(() => expect(peticiones(llamadas).at(-1).get("convocatoria")).toBeNull());
});

test("no documents at all, and a failed load with retry", async () => {
  let fallos = 1;
  simularApi({ "GET /documentos/seguimiento": () => (fallos-- > 0 ? { status: 500, body: { error: "Caída" } } : pagina([])) });
  renderPagina(<Seguimiento />);
  expect(await screen.findByText("No se pudieron cargar los documentos.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText("No hay documentos para esta convocatoria.")).toBeInTheDocument();
});

test("validate and sign act on that document and reload the list", async () => {
  const { llamadas } = simularApi({
    "GET /documentos/seguimiento": pagina([item({ puede_revisar: true }), item({ clave: "ANEXO_II", nombre: "Anexo II", id_documento: 2, id_reserva: 8, contexto: "reserva", puede_firmar: true })]),
    "POST /documentos/1/validar": { message: "Documento validado correctamente." },
    "POST /documentos/2/firmar": {},
  });
  renderPagina(<Seguimiento />);
  fireEvent.click(await screen.findByRole("button", { name: "Validar" }));
  expect(await screen.findByText("Documento validado correctamente.")).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Firmar" }));
  expect(await screen.findByText("Firma registrada.")).toBeInTheDocument();
  await waitFor(() => expect(peticiones(llamadas).length).toBe(3));
  expect(await screen.findByRole("button", { name: "Gestionar reserva" })).toBeInTheDocument();
});

test("rejecting needs a reason, which is sent", async () => {
  const { llamadas } = simularApi({
    "GET /documentos/seguimiento": pagina([item({ puede_revisar: true })]),
    "POST /documentos/1/rechazar": {},
  });
  renderPagina(<Seguimiento />);
  fireEvent.click(await screen.findByRole("button", { name: "Rechazar" }));
  const dialogo = await screen.findByRole("dialog", { name: "Rechazar CV" });
  fireEvent.change(within(dialogo).getByLabelText(/Motivo del rechazo/), { target: { value: "Falta la firma" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Rechazar documento" }));
  expect(await screen.findByText("Documento rechazado.")).toBeInTheDocument();
  expect(llamadas.find((l) => l.path.endsWith("/rechazar")).body).toEqual({ motivo: "Falta la firma" });
});

test("generate sends the document and its parent; regenerate asks first; a missing template links to templates", async () => {
  const plantillas = jest.fn();
  const { llamadas } = simularApi({
    "GET /documentos/seguimiento": pagina([
      item({ clave: "CONVENIO", nombre: "Convenio", id_documento: null, id_solicitud_empresa: 10, contexto: "solicitud_empresa", empresa: "ACME", alumno: null, puede_generar: true }),
      item({ clave: "ANEXO_II", nombre: "Anexo II", id_documento: 3, id_reserva: 8, contexto: "reserva", puede_regenerar: true }),
      item({ clave: "ANEXO_III", nombre: "Anexo III", id_documento: null, id_reserva: 9, contexto: "reserva", falta_plantilla: true }),
    ]),
    "POST /documentos/generar": { message: "Generado." },
  });
  renderPagina(<Seguimiento onOpenTemplates={plantillas} />);
  fireEvent.click(await screen.findByRole("button", { name: "Generar" }));
  await screen.findByText("Generado.");
  expect(llamadas.find((l) => l.path === "/documentos/generar").body).toEqual({ clave: "CONVENIO", id_solicitud_empresa: 10, regenerar: false });

  fireEvent.click(await screen.findByRole("button", { name: "Regenerar" }));
  const dialogo = await screen.findByRole("dialog", { name: "Regenerar Anexo II" });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(llamadas.filter((l) => l.path === "/documentos/generar")).toHaveLength(1);
  await waitFor(() => expect(screen.getByRole("button", { name: "Regenerar" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Regenerar" }));
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Regenerar Anexo II" })).getByRole("button", { name: "Regenerar" }));
  await waitFor(() => expect(llamadas.filter((l) => l.path === "/documentos/generar")).toHaveLength(2));
  expect(llamadas.filter((l) => l.path === "/documentos/generar")[1].body).toMatchObject({ id_reserva: 8, regenerar: true });

  fireEvent.click(await screen.findByRole("button", { name: "Ir a plantillas" }));
  expect(plantillas).toHaveBeenCalled();
});

test("a failed action shows the server's message", async () => {
  simularApi({
    "GET /documentos/seguimiento": pagina([item({ puede_revisar: true })]),
    "POST /documentos/1/validar": { status: 400, body: { error: "Faltan firmas." } },
  });
  renderPagina(<Seguimiento />);
  fireEvent.click(await screen.findByRole("button", { name: "Validar" }));
  expect(await screen.findByText("Faltan firmas.")).toBeInTheDocument();
});

test("paging asks for the next page and the page size", async () => {
  const items = Array.from({ length: 10 }, (_, i) => item({ id_documento: i + 1, alumno: `Alumno ${i + 1}` }));
  const { llamadas } = simularApi({
    "GET /documentos/seguimiento": (req) => {
      const page = Number(new URL(req.url, "http://x").searchParams.get("page") || 1);
      return pagina(items, { pagination: { page, pageSize: 10, totalItems: 25, totalPages: 3 } });
    },
  });
  renderPagina(<Seguimiento />);
  await screen.findAllByText(/Alumno 1\b/);
  fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
  await waitFor(() => expect(peticiones(llamadas).at(-1).get("page")).toBe("2"));
});
