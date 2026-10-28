// Student data editing: the shared form (DNI read-only), the admin panel (ciclo locked by reservations, approval with
// conflict) and the student's request.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../components/feedback/ToastProvider.jsx";
import AlumnoDatosActions from "../LinkStudents/components/student-card/AlumnoDatosActions.jsx";
import MisDatos from "./MisDatos.jsx";
import { getJSON, postJSON, publicJSON, putJSON } from "../../utils/api.js";

jest.mock("../../utils/api.js", () => ({
  getJSON: jest.fn(),
  postJSON: jest.fn(),
  putJSON: jest.fn(),
  publicJSON: jest.fn(),
}));

const datos = {
  nombre: "Ana Pérez", fechaNacimiento: "2005-03-04", nacionalidad: "Española", sexo: "Mujer",
  tutorLegal: null, dniTutorLegal: null, email: "ana@example.com", emailColegio: null,
  telalumno: "600000000", telfamilia: "", domicilio: "C/ Mayor 1", cp: "50001", localidad: "Zaragoza",
  carnetDeConducir: 1, tieneCoche: 0, idiomasConocidos: "Inglés B2", numeroSS: null, situacionLaboral: null,
  id_especialidad: 1,
};

const pendingDiff = {
  id_cambio: 4,
  propuesta: { cp: "50002" },
  diff: [{ field: "cp", label: "Código postal", actual: "50001", solicitado: "50002" }],
  conflictos: [],
};

beforeEach(() => {
  publicJSON.mockImplementation((url) =>
    Promise.resolve(
      url === "/especialidades" ? [{ id_especialidad: 1, nombre: "DAM" }, { id_especialidad: 2, nombre: "DAW" }] : [],
    ),
  );
});
afterEach(() => jest.clearAllMocks());

function adminPanel({ reservas = [], cambio = { pending: null, ultimo: null }, pendiente = null } = {}) {
  getJSON.mockImplementation((url) =>
    Promise.resolve(
      url.endsWith("/datos")
        ? { dni: "12345678Z", editable: true, datos, reservas_activas: reservas }
        : cambio,
    ),
  );
  render(
    <ToastProvider>
      <AlumnoDatosActions
        r={{ id_solicitud_alumno: 10, nombre: "Ana Pérez", especialidad: "DAM", id_cambio_pendiente: pendiente }}
        editSignal={1}
      />
    </ToastProvider>,
  );
}

test("direct edit: the DNI is read-only and the ciclo is locked by active reservations", async () => {
  adminPanel({ reservas: [{ id_reserva: 7, estado_reserva: "PENDIENTE", empresa: "ACME", especialidad: "DAM" }] });
  await screen.findByRole("dialog");
  expect(screen.getByText("12345678Z")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("12345678Z")).toBeNull();
  expect(screen.getByLabelText(/^Ciclo/)).toBeDisabled();
  expect(screen.getByText(/ACME/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeInTheDocument();
});

test("edit dialog: saving needs a change, and closing with changes asks first", async () => {
  adminPanel();
  await screen.findByRole("dialog");
  const guardar = screen.getByRole("button", { name: "Guardar cambios" });
  expect(guardar).toBeDisabled();
  expect(screen.getByText("Sin cambios")).toBeInTheDocument();
  fireEvent.change(document.getElementById("campo-cp"), { target: { value: "50002" } });
  expect(guardar).toBeEnabled();
  expect(screen.getByText("1 campo modificado")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  fireEvent.click(await screen.findByRole("button", { name: "Seguir editando" }));
  expect(document.getElementById("campo-cp")).toHaveValue("50002");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
  await waitFor(() => expect(document.getElementById("campo-cp")).toBeNull());
});

test("direct edit: a new ciclo is sent and the DNI is never sent", async () => {
  adminPanel();
  putJSON.mockResolvedValue({});
  await screen.findByRole("dialog");
  await screen.findByRole("option", { name: "DAW" });
  expect(screen.getByLabelText(/^Ciclo/)).toHaveValue("1");
  fireEvent.change(screen.getByLabelText(/^Ciclo/), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  // Changing the ciclo asks for confirmation first.
  fireEvent.click(await screen.findByRole("button", { name: "Cambiar ciclo" }));
  await waitFor(() => expect(putJSON).toHaveBeenCalled());
  const [url, body] = putJSON.mock.calls[0];
  expect(url).toBe("/solicitudes/alumno/10/datos");
  expect(body.dni).toBeUndefined();
  expect(body.id_especialidad).toBe(2);
  expect(body.preferencias).toBeUndefined();
});

test("pending request: approval asks again when staff changed the same field", async () => {
  adminPanel({ cambio: { pending: pendingDiff, ultimo: null }, pendiente: 4 });
  await screen.findByText("El alumno ha pedido corregir sus datos");
  postJSON.mockRejectedValueOnce(Object.assign(new Error("Los datos actuales han cambiado"), {
    status: 409,
    body: {
      error: "Los datos actuales han cambiado",
      requires_confirm: true,
      conflictos: [{ field: "cp", label: "Código postal", original: "50001", actual: "50009", solicitado: "50002" }],
    },
  }));
  fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
  expect(await screen.findByText(/ahora «50009»/)).toBeInTheDocument();
  postJSON.mockResolvedValueOnce({});
  fireEvent.click(screen.getByRole("button", { name: "Aplicar igualmente" }));
  await waitFor(() => expect(postJSON).toHaveBeenLastCalledWith(
    "/solicitudes/alumno/10/cambios/4/aprobar", { confirmar_conflicto: true },
  ));
});

test("student: sends a correction for review and sees it pending", async () => {
  getJSON.mockResolvedValueOnce({ dni: "12345678Z", editable: true, datos, pending: null, ultimo: null });
  render(
    <ToastProvider>
      <MisDatos solicitud={{ nombre: "Ana Pérez", dni: "12345678Z", especialidad: "DAM", estado_validacion: "VALIDADO" }} />
    </ToastProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Solicitar corrección" }));
  fireEvent.change(document.getElementById("campo-cp"), { target: { value: "50002" } });
  postJSON.mockResolvedValueOnce({ message: "Hemos recibido tu petición." });
  getJSON.mockResolvedValueOnce({ dni: "12345678Z", editable: true, datos, pending: pendingDiff, ultimo: null });
  fireEvent.click(screen.getByRole("button", { name: "Enviar para revisión" }));
  await waitFor(() => expect(postJSON).toHaveBeenCalled());
  const [url, body] = postJSON.mock.calls[0];
  expect(url).toBe("/solicitudes/alumno/mia/cambios");
  expect(body.cp).toBe("50002");
  expect(body.dni).toBeUndefined();
  expect(await screen.findByText("Corrección enviada para revisión")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cambiar mi corrección" })).toBeInTheDocument();
});
