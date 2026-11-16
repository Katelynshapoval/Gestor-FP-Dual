// Places per ciclo of a company application (EspecialidadCuposEditor): input
// checks, never below the confirmed students, choosing which pending bookings
// to cancel when places go down, adding a ciclo, the validated-application
// rule (only reduce). And the staff state box of a company application
// (EstadoSolicitudEmpresa): validate only with a validated convenio, reject
// with a reason, reopen in the active convocatoria only.
import { fireEvent, screen, within } from "@testing-library/react";
import EspecialidadCuposEditor from "./EspecialidadCuposEditor.jsx";
import EstadoSolicitudEmpresa from "../AdminCompanyView/components/EstadoSolicitudEmpresa.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";

beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(); return 0; });
  iniciarSesion({ id: 3, rol: "EMPRESA" });
});

const OFERTA = {
  id_solicitud_empresa_especialidad: 5, id_especialidad: 2, nombre: "Joyería", cantidad_alumnos: 4,
  plazas_ocupadas: 3, plazas_confirmadas: 1, plazas_disponibles: 1,
};
const CATALOGO = [{ id_especialidad: 2, nombre: "Joyería" }, { id_especialidad: 3, nombre: "Desarrollo web" }];

function editor(props = {}) {
  const onUpdated = vi.fn();
  renderPagina(<EspecialidadCuposEditor solicitudId={10} especialidades={[OFERTA]} catalogo={CATALOGO} onUpdated={onUpdated} {...props} />);
  return { onUpdated, input: screen.queryByLabelText("Alumnos", { selector: "#cupo-5" }) };
}

describe("EspecialidadCuposEditor", () => {
  test("nothing to show", () => {
    renderPagina(<EspecialidadCuposEditor solicitudId={10} especialidades={[]} catalogo={[]} />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
  });

  test("read-only: shows the places, no inputs", () => {
    editor({ canEdit: false });
    expect(screen.getByText("Ocupadas 3 · Confirmadas 1 · Disponibles 1")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button", { name: "Añadir ciclo" })).toBeNull();
  });

  test("Guardar appears only when the number changed", () => {
    const { input } = editor();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    fireEvent.change(input, { target: { value: "5" } });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "4" } });
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
  });

  test.each([["", /número entero/], ["2.5", /número entero/], ["-1", /número entero/], ["0", /por debajo de los alumnos ya confirmados/]])(
    "«%s» is refused before sending", (valor, error) => {
      const { llamadas } = simularApi({});
      const { input } = editor();
      fireEvent.change(input, { target: { value: valor } });
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      expect(screen.getByText(error)).toBeInTheDocument();
      expect(llamadas).toHaveLength(0);
    },
  );

  test("raising places saves and reloads", async () => {
    const { llamadas } = simularApi({ "PUT /solicitudes/empresa/10/especialidades/5/cantidad": { message: "Número de plazas actualizado." } });
    const { input, onUpdated } = editor();
    fireEvent.change(input, { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Número de plazas actualizado.")).toBeInTheDocument();
    expect(llamadas[0].body).toEqual({ cantidad: 6, confirmar_cancelaciones: false, ids_reservas_cancelar: [] });
    expect(onUpdated).toHaveBeenCalled();
  });

  test("reducing below the pending bookings asks which to cancel, then sends them", async () => {
    let paso = 0;
    const { llamadas } = simularApi({
      "PUT /solicitudes/empresa/10/especialidades/5/cantidad": () => (paso++ === 0
        ? { status: 409, body: { requires_selection: true, cantidad_actual: 4, cantidad_nueva: 2, cancelar_pendientes: 1, pendientes: [{ id_reserva: 70, alumno: "Ana" }, { id_reserva: 71, alumno: "Luis" }] } }
        : { message: "Plazas reducidas.", canceladas: [{ id_reserva: 71, alumno: "Luis" }] }),
    });
    const { input } = editor();
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Elegir reservas a cancelar" });
    fireEvent.click(within(dialogo).getByLabelText(/Luis/));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reducir plazas" }));
    expect(await screen.findByText("Plazas reducidas. (#71 Luis)")).toBeInTheDocument();
    expect(llamadas[1].body).toEqual({ cantidad: 2, confirmar_cancelaciones: true, ids_reservas_cancelar: [71] });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("«Volver» in the picker cancels the reduction", async () => {
    const { llamadas } = simularApi({
      "PUT /solicitudes/empresa/10/especialidades/5/cantidad": { status: 409, body: { requires_selection: true, cantidad_actual: 4, cantidad_nueva: 2, cancelar_pendientes: 1, pendientes: [{ id_reserva: 70, alumno: "Ana" }] } },
    });
    const { input } = editor();
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Volver" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(llamadas).toHaveLength(1);
  });

  test("a refusal from the server is shown (e.g. over 20 places)", async () => {
    simularApi({ "PUT /solicitudes/empresa/10/especialidades/5/cantidad": { status: 400, body: { error: "Como máximo se pueden ofrecer 20 plazas por ciclo." } } });
    const { input } = editor();
    fireEvent.change(input, { target: { value: "21" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Como máximo se pueden ofrecer 20 plazas por ciclo.")).toBeInTheDocument();
  });

  test("adding a ciclo: only missing ones offered, at least one student, the renewal warning shown", async () => {
    const { llamadas } = simularApi({ "POST /solicitudes/empresa/10/especialidades": { convenio_renovado: true, message: "Ciclo añadido. Se ha generado un convenio nuevo para firmar." } });
    editor({ avisoConvenio: "Añadir un ciclo genera un convenio nuevo que hay que firmar." });
    fireEvent.click(screen.getByRole("button", { name: "Añadir ciclo" }));
    expect(screen.getByText("Añadir un ciclo genera un convenio nuevo que hay que firmar.")).toBeInTheDocument();
    const select = screen.getByLabelText("Ciclo");
    expect(within(select).queryByRole("option", { name: /Joyería/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Alumnos", { selector: "#nuevo-ciclo-alumnos" }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText("Selecciona un ciclo que aún no esté en la solicitud.")).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Alumnos", { selector: "#nuevo-ciclo-alumnos" }), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText("Indica al menos un alumno para añadir el ciclo.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Alumnos", { selector: "#nuevo-ciclo-alumnos" }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Ciclo añadido. Se ha generado un convenio nuevo para firmar.")).toBeInTheDocument();
    expect(llamadas[0].body).toEqual({ id_especialidad: 3, cantidad: 2 });
  });

  test("cancelling the new ciclo form discards it", () => {
    editor();
    fireEvent.click(screen.getByRole("button", { name: "Añadir ciclo" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText("Ciclo")).toBeNull();
  });

  test("validated application: may reduce but not add ciclos", () => {
    editor({ soloReducir: true });
    expect(screen.getByText(/Tu solicitud ya está validada: puedes reducir plazas/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Añadir ciclo" })).toBeNull();
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
  });
});

describe("EstadoSolicitudEmpresa", () => {
  beforeEach(() => iniciarSesion({ id: 1, rol: "COORDINADOR" }));
  const caja = (empresa) => {
    const onUpdated = vi.fn();
    renderPagina(<EstadoSolicitudEmpresa empresa={{ id_solicitud_empresa: 10, razonSocial: "ACME", convocatoria_activa: 1, ...empresa }} onUpdated={onUpdated} />);
    return onUpdated;
  };

  test("pending without a validated convenio: only reject, with the hint", () => {
    caja({ estado_validacion: "PENDIENTE", convenio_validado: 0 });
    expect(screen.getByText("Se valida al validar su convenio firmado.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validar solicitud" })).toBeNull();
    expect(screen.getByRole("button", { name: "Rechazar solicitud" })).toBeInTheDocument();
  });

  test("pending with a validated convenio: validate", async () => {
    const { llamadas } = simularApi({ "POST /solicitudes/empresa/10/validar": {} });
    const onUpdated = caja({ estado_validacion: "PENDIENTE", convenio_validado: 1 });
    expect(screen.getByText("El convenio está validado: ya se puede validar la solicitud.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Validar solicitud" }));
    expect(await screen.findByText("Solicitud validada.")).toBeInTheDocument();
    expect(llamadas[0].path).toBe("/solicitudes/empresa/10/validar");
    expect(onUpdated).toHaveBeenCalled();
  });

  test("a refused validation is shown", async () => {
    simularApi({ "POST /solicitudes/empresa/10/validar": { status: 400, body: { error: "Validar una empresa sin ofertas no es posible." } } });
    caja({ estado_validacion: "PENDIENTE", convenio_validado: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Validar solicitud" }));
    expect(await screen.findByText("Validar una empresa sin ofertas no es posible.")).toBeInTheDocument();
  });

  test("reject with a reason", async () => {
    const { llamadas } = simularApi({ "POST /solicitudes/empresa/10/rechazar": {} });
    caja({ estado_validacion: "PENDIENTE" });
    fireEvent.click(screen.getByRole("button", { name: "Rechazar solicitud" }));
    const dialogo = await screen.findByRole("dialog", { name: "Rechazar solicitud de empresa" });
    expect(dialogo).toHaveTextContent("ACME");
    fireEvent.change(within(dialogo).getByLabelText(/Motivo del rechazo/), { target: { value: "Datos falsos" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Rechazar solicitud" }));
    expect(await screen.findByText("Solicitud rechazada.")).toBeInTheDocument();
    expect(llamadas[0].body).toEqual({ motivo: "Datos falsos" });
  });

  test("rejected: shows the reason; reopen only in the active convocatoria", async () => {
    const { llamadas } = simularApi({ "POST /solicitudes/empresa/10/reabrir": {} });
    caja({ estado_validacion: "RECHAZADO", motivo: "Datos falsos" });
    expect(screen.getByText("Datos falsos")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reabrir solicitud" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la reapertura/), { target: { value: "Corregido" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reabrir solicitud" }));
    expect(await screen.findByText(/Solicitud reabierta/)).toBeInTheDocument();
    expect(llamadas[0].body).toEqual({ motivo: "Corregido" });
  });

  test("rejected in a past convocatoria, or validated: no actions", () => {
    caja({ estado_validacion: "RECHAZADO", convocatoria_activa: 0 });
    expect(screen.getByText("Sin motivo indicado.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
