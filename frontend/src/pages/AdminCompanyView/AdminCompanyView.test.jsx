// Staff company list: active convocatoria by default, filter chips, search,
// load errors, the convenio viewer (validate / reject with a reason), company
// change requests (approve, conflict confirmation, reject with a reason) and
// assigning a student to a company's ciclo.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import AdminCompanyView from "./AdminCompanyView.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";

vi.mock("../../hooks/useConvocatoriaEstado.js", () => ({
  useConvocatoriaEstado: () => ({ status: "ready", data: { abierta: true, activa: { id_convocatoria: 6, nombre: "2026/2027" } }, error: null }),
  loadConvocatoriaEstado: async () => ({ abierta: true }),
}));

const empresa = (extra) => ({
  id_solicitud_empresa: 10, id_empresa: 100, empresa: "ACME", razonSocial: "ACME", cif: "B12345674", convocatoria: "2026/2027",
  convocatoria_activa: true, estado_validacion: "PENDIENTE", fechaPeticion: "2026-10-01", especialidades: [{ id_solicitud_empresa_especialidad: 5, id_especialidad: 2, nombre: "Joyería", cantidad_alumnos: 2 }],
  transportes: [], tieneConvenio: 1, convenio_validado: 0, convenio_estado: "PENDIENTE", id_documento_convenio: 70,
  cambio_pendiente: 0, nombreCoordinador: "Luis", emailCoordinador: "l@acme.test", ...extra,
});
const EMPRESAS = [
  empresa(),
  empresa({ id_solicitud_empresa: 11, empresa: "Beta", razonSocial: "Beta", cif: "A58818501", tieneConvenio: 0, convenio_estado: null, id_documento_convenio: null, cambio_pendiente: 1, fechaPeticion: "2026-10-05" }),
  empresa({ id_solicitud_empresa: 9, empresa: "Antigua", razonSocial: "Antigua", convocatoria: "2025/2026", convocatoria_activa: false }),
];

function api(extra = {}) {
  return simularApi({
    "GET /solicitudes/empresa/todas": EMPRESAS,
    "GET /reservas": [],
    "GET /transportes": [],
    "GET /especialidades": [],
    "GET /documentos/:id/descargar": {},
    ...extra,
  });
}

beforeEach(() => iniciarSesion({ id: 1, rol: "ADMINISTRADOR" }));

const tarjetas = () => screen.getAllByRole("button", { name: /^Mostrar el detalle de / }).map((b) => b.getAttribute("aria-label").replace("Mostrar el detalle de ", ""));

test("shows the active convocatoria's companies, newest first, with convenio counters", async () => {
  api();
  renderPagina(<AdminCompanyView />);
  await screen.findByRole("heading", { name: "Empresas" });
  await waitFor(() => expect(tarjetas()).toEqual(["Beta", "ACME"]));
  expect(screen.getByRole("button", { name: /1 por validar/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /1 sin convenio/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /1 cambio pendiente/ })).toBeInTheDocument();
});

test("chips and search filter the list; clearing shows everything again", async () => {
  api();
  renderPagina(<AdminCompanyView />);
  await waitFor(() => expect(tarjetas()).toHaveLength(2));
  fireEvent.click(screen.getByRole("button", { name: /1 sin convenio/ }));
  await waitFor(() => expect(tarjetas()).toEqual(["Beta"]));
  fireEvent.click(screen.getByRole("button", { name: /1 sin convenio/ }));
  await waitFor(() => expect(tarjetas()).toHaveLength(2));
  const buscar = (texto) => {
    const input = screen.getByPlaceholderText("Empresa, CIF, coordinador o municipio");
    fireEvent.change(input, { target: { value: texto } });
    fireEvent.keyDown(input, { key: "Enter" });
  };
  buscar("b12345674");
  await waitFor(() => expect(tarjetas()).toEqual(["ACME"]));
  buscar("nadie");
  expect(await screen.findByText("No hay empresas que coincidan con la búsqueda o los filtros.")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Quitar filtros" })[0]);
  await waitFor(() => expect(tarjetas()).toHaveLength(2));
});

test("a load failure can be retried", async () => {
  let fallos = 1;
  api({ "GET /solicitudes/empresa/todas": () => (fallos-- > 0 ? { status: 500, body: { error: "Caída" } } : EMPRESAS) });
  renderPagina(<AdminCompanyView />);
  fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
  await waitFor(() => expect(tarjetas()).toHaveLength(2));
});

test("the convenio is reviewed from its viewer: validate, or reject with a reason", async () => {
  const { llamadas } = api({
    "POST /documentos/70/validar": { message: "Convenio y empresa validados correctamente." },
    "POST /documentos/70/rechazar": {},
  });
  renderPagina(<AdminCompanyView />);
  fireEvent.click(await screen.findByRole("button", { name: "Mostrar el detalle de ACME" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ver convenio" }));
  fireEvent.click(await screen.findByRole("button", { name: "Validar convenio" }));
  expect(await screen.findByText("Convenio y empresa validados correctamente.")).toBeInTheDocument();
  expect(llamadas.some((l) => l.path === "/documentos/70/validar")).toBe(true);

  fireEvent.click(await screen.findByRole("button", { name: "Ver convenio" }));
  fireEvent.click(await screen.findByRole("button", { name: "Rechazar convenio" }));
  const dialogo = await screen.findByRole("dialog", { name: "Rechazar convenio" });
  fireEvent.change(within(dialogo).getByLabelText(/Motivo del rechazo/), { target: { value: "Falta la firma" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Rechazar convenio" }));
  await screen.findByText("Convenio rechazado. La empresa debe subir uno nuevo.");
  expect(llamadas.find((l) => l.path === "/documentos/70/rechazar").body).toEqual({ motivo: "Falta la firma" });
});

const CAMBIO = { pending: { id_cambio: 4, diff: [{ field: "web", label: "Web", actual: "—", solicitado: "https://beta.test" }] }, ultimo: null };

test("change request: approving asks to confirm when the data changed meanwhile", async () => {
  let intentos = 0;
  const { llamadas } = api({
    "GET /solicitudes/empresa/11/cambios": CAMBIO,
    "POST /solicitudes/empresa/11/cambios/4/aprobar": (req) => {
      intentos += 1;
      return req.body.confirmar_conflicto
        ? { message: "ok" }
        : { status: 409, body: { error: "Los datos actuales han cambiado.", requires_confirm: true, conflictos: [{ field: "web", label: "Web", actual: "https://otra.test", solicitado: "https://beta.test" }] } };
    },
  });
  renderPagina(<AdminCompanyView />);
  fireEvent.click(await screen.findByRole("button", { name: "Mostrar el detalle de Beta" }));
  expect(await screen.findByText("La empresa ha solicitado cambios")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
  expect(await screen.findByText("Los datos actuales han cambiado.")).toBeInTheDocument();
  expect(screen.getByText(/https:\/\/otra\.test/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Aplicar igualmente" }));
  expect(await screen.findByText("Cambios aprobados y aplicados.")).toBeInTheDocument();
  expect(intentos).toBe(2);
  expect(llamadas.filter((l) => l.path.endsWith("/aprobar")).map((l) => l.body.confirmar_conflicto)).toEqual([false, true]);
});

test("change request: rejecting needs a reason", async () => {
  const { llamadas } = api({ "GET /solicitudes/empresa/11/cambios": CAMBIO, "POST /solicitudes/empresa/11/cambios/4/rechazar": {} });
  renderPagina(<AdminCompanyView />);
  fireEvent.click(await screen.findByRole("button", { name: "Mostrar el detalle de Beta" }));
  await screen.findByText("La empresa ha solicitado cambios");
  fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
  expect(await screen.findByText("Indica el motivo del rechazo.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Motivo del rechazo"), { target: { value: " Datos falsos " } });
  fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
  expect(await screen.findByText("Solicitud de cambio rechazada.")).toBeInTheDocument();
  expect(llamadas.find((l) => l.path.endsWith("/rechazar")).body).toEqual({ motivo: "Datos falsos" });
});

test("assigning a student: pick a ciclo with places, then a student, then confirm", async () => {
  const { llamadas } = api({
    "GET /solicitudes/empresa/10/especialidades": [
      { id_solicitud_empresa_especialidad: 5, nombre: "Joyería", plazas_disponibles: 1 },
      { id_solicitud_empresa_especialidad: 6, nombre: "Desarrollo web", plazas_disponibles: 0 },
    ],
    "GET /reservas/alumnos-elegibles": [{ id_solicitud_alumno: 40, nombre: "Ana Ruiz", dni: "12345678Z" }, { id_solicitud_alumno: 41, nombre: "Luis Gil", dni: "87654321X" }],
    "POST /reservas/admin": { id_reserva: 77 },
  });
  renderPagina(<AdminCompanyView />);
  fireEvent.click(await screen.findByRole("button", { name: "Mostrar el detalle de ACME" }));
  fireEvent.click((await screen.findAllByRole("button", { name: "Reservas" }))[1]);
  fireEvent.click(screen.getByRole("button", { name: "Asignar alumno" }));
  const modal = await screen.findByRole("dialog", { name: "Asignar alumno" });
  const ciclo = await within(modal).findByLabelText("Ciclo");
  expect(within(ciclo).getByRole("option", { name: /Desarrollo web · 0 plazas/ })).toBeDisabled();
  fireEvent.change(ciclo, { target: { value: "5" } });
  fireEvent.change(await within(modal).findByLabelText("Buscar alumno por nombre o DNI"), { target: { value: "8765" } });
  fireEvent.click(await within(modal).findByLabelText(/Luis Gil/));
  fireEvent.click(within(modal).getByRole("button", { name: "Asignar alumno" }));
  await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2));
  const confirmar = screen.getAllByRole("dialog").at(-1);
  expect(confirmar).toHaveTextContent("Se creará una reserva pendiente de Luis Gil");
  fireEvent.click(within(confirmar).getByRole("button", { name: "Asignar alumno" }));
  expect(await screen.findByText("Alumno asignado a la empresa.")).toBeInTheDocument();
  expect(llamadas.find((l) => l.path === "/reservas/admin").body).toEqual({ id_solicitud_alumno: 41, id_solicitud_empresa_especialidad: 5 });
  expect(llamadas.find((l) => l.path === "/reservas/alumnos-elegibles").url).toContain("id_solicitud_empresa_especialidad=5");
});
