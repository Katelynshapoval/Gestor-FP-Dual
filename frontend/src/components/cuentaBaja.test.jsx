// «Cuenta» tab of a student or company card: account state, password reset,
// and «Dar de baja» / «Reactivar» (Administración only); the places-reduction
// dialog that asks which pending bookings to cancel.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CuentaPanel from "./CuentaPanel.jsx";
import CupoReductionDialog from "./CupoReductionDialog.jsx";
import { ToastProvider } from "./feedback/ToastProvider.jsx";
import { iniciarSesion, simularApi } from "../testUtils";

beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(); return 0; });
  iniciarSesion({ id: 1, rol: "ADMINISTRADOR" });
});

const panel = (props) => render(
  <ToastProvider>
    <CuentaPanel tipo="alumno" idSolicitud={10} usuario="12345678Z" idUsuario={7} cuentaActiva={1} nombre="Ana" isAdmin
      s={{ estado_validacion: "VALIDADO" }} {...props} />
  </ToastProvider>,
);

describe("CuentaPanel", () => {
  test("coordinators see the account read-only", () => {
    panel({ isAdmin: false, s: { estado_validacion: "BAJA", motivo_baja: "Abandona" } });
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("Dada de baja. Motivo: Abandona.")).toBeInTheDocument();
    expect(screen.getByText(/lo hace Administración/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("no account / deactivated account: no password reset", () => {
    const { unmount } = panel({ idUsuario: null });
    expect(screen.getByText("Sin cuenta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contraseña/i })).toBeNull();
    unmount();
    panel({ cuentaActiva: 0 });
    expect(screen.getByText("Desactivada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contraseña/i })).toBeNull();
  });

  test("baja: lists the bookings that will be cancelled, needs a reason, reports the result", async () => {
    const onChanged = vi.fn();
    const { llamadas } = simularApi({
      "GET /solicitudes/alumno/10/baja": { reservas: [
        { id_reserva: 1, empresa: "ACME", especialidad: "Joyería", estado_reserva: "CONFIRMADA" },
        { id_reserva: 2, empresa: "Beta", estado_reserva: "PENDIENTE" },
      ] },
      "POST /solicitudes/alumno/10/baja": { message: "Baja registrada. Se han cancelado 2 reservas." },
    });
    panel({ onChanged });
    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    const dialogo = await screen.findByRole("dialog", { name: "Dar de baja al alumno" });
    expect(await within(dialogo).findByText("ACME")).toBeInTheDocument();
    expect(within(dialogo).getByText(/se avisa a cada empresa por correo/)).toBeInTheDocument();
    const boton = within(dialogo).getByRole("button", { name: "Dar de baja" });
    expect(boton).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la baja/), { target: { value: "Abandona el ciclo" } });
    fireEvent.click(boton);
    expect(await screen.findByText("Baja registrada. Se han cancelado 2 reservas.")).toBeInTheDocument();
    expect(llamadas.find((l) => l.method === "POST").body).toEqual({ motivo: "Abandona el ciclo" });
    expect(onChanged).toHaveBeenCalled();
  });

  test("baja of a company with no active bookings; preview error blocks nothing but is shown", async () => {
    simularApi({ "GET /solicitudes/empresa/3/baja": { reservas: [] } });
    panel({ tipo: "empresa", idSolicitud: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    const dialogo = await screen.findByRole("dialog", { name: "Dar de baja a la empresa" });
    expect(await within(dialogo).findByText("No tiene reservas activas.")).toBeInTheDocument();
  });

  test("baja preview failing shows the error and keeps the button disabled", async () => {
    simularApi({ "GET /solicitudes/alumno/10/baja": { status: 500, body: { error: "Sin conexión" } } });
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    const dialogo = await screen.findByRole("dialog");
    expect(await within(dialogo).findByText("Sin conexión")).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la baja/), { target: { value: "x" } });
    expect(within(dialogo).getByRole("button", { name: "Dar de baja" })).toBeDisabled();
  });

  test("a refused baja stays in the dialog with the reason", async () => {
    simularApi({
      "GET /solicitudes/alumno/10/baja": { reservas: [] },
      "POST /solicitudes/alumno/10/baja": { status: 400, body: { error: "La solicitud ya está dada de baja." } },
    });
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByText("No tiene reservas activas.");
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la baja/), { target: { value: "x" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Dar de baja" }));
    expect(await within(dialogo).findByText("La solicitud ya está dada de baja.")).toBeInTheDocument();
  });

  test("a withdrawn application shows date and reason and can be reactivated without a reason", async () => {
    const { llamadas } = simularApi({ "POST /solicitudes/alumno/10/reactivar": { message: "Solicitud reactivada: vuelve a Validada." } });
    panel({ s: { estado_validacion: "BAJA", fecha_baja: "2026-11-02", motivo_baja: "Abandona" } });
    expect(screen.getByText(/Dada de baja el/)).toBeInTheDocument();
    expect(screen.getByText(/Motivo: Abandona\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reactivar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Reactivar la solicitud del alumno" });
    expect(dialogo).toHaveTextContent("Las reservas canceladas no se recuperan");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reactivar" }));
    expect(await screen.findByText("Solicitud reactivada: vuelve a Validada.")).toBeInTheDocument();
    expect(llamadas[0].body).toEqual({});
  });
});

describe("CupoReductionDialog", () => {
  const PEND = [
    { id_reserva: 1, alumno: "Ana", dni_alumno: "1Z" },
    { id_reserva: 2, alumno: "Luis" },
    { id_reserva: 3, alumno: "Eva" },
  ];
  const dialog = (props) => render(
    <CupoReductionDialog open desde={5} hasta={3} pendientes={PEND} requiredCount={2} onCancel={() => {}} onConfirm={() => {}} {...props} />,
  );

  test("closed: renders nothing", () => {
    const { container } = dialog({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  test("exactly the required number must be chosen; then no more can be ticked", () => {
    const onConfirm = vi.fn();
    dialog({ onConfirm });
    expect(screen.getByText(/hay que cancelar 2 reservas pendientes/)).toBeInTheDocument();
    const enviar = screen.getByRole("button", { name: "Reducir plazas" });
    expect(enviar).toBeDisabled();
    const [a, b, c] = screen.getAllByRole("checkbox");
    fireEvent.click(a);
    fireEvent.click(b);
    expect(screen.getByText("Seleccionadas 2 de 2")).toBeInTheDocument();
    expect(c).toBeDisabled();
    fireEvent.click(a);
    expect(c).not.toBeDisabled();
    fireEvent.click(c);
    fireEvent.click(enviar);
    expect(onConfirm).toHaveBeenCalledWith([2, 3]);
  });

  test("singular wording and busy state", () => {
    dialog({ requiredCount: 1, busy: true });
    expect(screen.getByText(/hay que cancelar 1 reserva pendiente\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    for (const c of screen.getAllByRole("checkbox")) expect(c).toBeDisabled();
  });

  test("«Volver» cancels", () => {
    const onCancel = vi.fn();
    dialog({ onCancel });
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("password reset from the panel", () => {
  test("asks first, shows the temporary password, «Ocultar» hides it", async () => {
    const { llamadas } = simularApi({ "POST /usuarios/7/resetPassword": { newPassword: "temporal-123456" } });
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Resetear contraseña" }));
    const dialogo = await screen.findByRole("dialog", { name: "Resetear contraseña" });
    expect(dialogo).toHaveTextContent("contraseña temporal para Ana");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Resetear contraseña" }));
    expect(await screen.findByText("temporal-123456")).toBeInTheDocument();
    expect(llamadas[0].body).toEqual({});
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(screen.queryByText("temporal-123456")).toBeNull();
  });

  test("cancelling sends nothing; a refusal is shown", async () => {
    const { llamadas } = simularApi({ "POST /usuarios/7/resetPassword": { status: 403, body: { error: "Solo Administración." } } });
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Resetear contraseña" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(llamadas).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Resetear contraseña" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Resetear contraseña" }));
    expect(await screen.findByText("Solo Administración.")).toBeInTheDocument();
  });
});
