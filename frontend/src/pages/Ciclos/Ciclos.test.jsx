// Configuración › Ciclos: active and switched-off ciclos with their use, adding
// one (code in capitals, shift required), editing (code and shift fixed while
// in use) and switching off after a confirmation.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import Ciclos from "./Ciclos.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";

const ciclo = (extra) => ({
  id_especialidad: 4, codigo: "DAM", nombre: "Desarrollo de Aplicaciones Multiplataforma", turno: 0,
  turno_nombre: "DIURNO", activa: true, solicitudes: 0, ofertas: 0, alumnos: 0, en_uso: false, ...extra,
});
const CICLOS = {
  ciclos: [
    ciclo({ solicitudes: 3, ofertas: 1, en_uso: true }),
    ciclo({ id_especialidad: 5, codigo: "SMR", nombre: "Sistemas Microinformáticos y Redes", turno: 1, turno_nombre: "VESPERTINO" }),
    ciclo({ id_especialidad: 6, codigo: "ASIR", nombre: "Administración de Sistemas", activa: false }),
  ],
};

beforeEach(() => iniciarSesion({ id: 1, rol: "ADMINISTRADOR", nombre: "Admin" }));

const abrir = () => renderPagina(<Ciclos />, { ruta: "/configuracion/ciclos" });

test("active and switched-off ciclos, each with code, shift and use", async () => {
  simularApi({ "GET /especialidades/todas": CICLOS });
  abrir();
  const activos = await screen.findByRole("region", { name: "Activos" });
  expect(within(activos).getByText("Desarrollo de Aplicaciones Multiplataforma")).toBeInTheDocument();
  expect(within(activos).getByText("3 solicitudes · 1 oferta")).toBeInTheDocument();
  expect(within(activos).getByText("Vespertino")).toBeInTheDocument();
  expect(within(activos).getByText("Sin uso todavía")).toBeInTheDocument();
  const off = screen.getByRole("region", { name: "Desactivados" });
  expect(within(off).getByText("Administración de Sistemas")).toBeInTheDocument();
  expect(within(off).getByRole("button", { name: "Activar" })).toBeInTheDocument();
  expect(screen.getByText("2 activos")).toBeInTheDocument();
});

test("with no active ciclo, a warning says nobody can apply", async () => {
  simularApi({ "GET /especialidades/todas": { ciclos: [] } });
  abrir();
  expect(await screen.findByText(/nadie puede presentar una solicitud/)).toBeInTheDocument();
});

test("adding: checks the form, sends the code in capitals and the shift as a number", async () => {
  const { llamadas } = simularApi({
    "GET /especialidades/todas": CICLOS,
    "POST /especialidades": { message: "Ciclo «Desarrollo Web» añadido." },
  });
  abrir();
  fireEvent.click(await screen.findByRole("button", { name: /Nuevo ciclo/ }));
  const dialog = screen.getByRole("dialog", { name: "Nuevo ciclo" });

  fireEvent.click(within(dialog).getByRole("button", { name: "Añadir ciclo" }));
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Escribe el código");
  fireEvent.change(within(dialog).getByLabelText("Código"), { target: { value: " daw " } });
  fireEvent.change(within(dialog).getByLabelText("Nombre"), { target: { value: "  Desarrollo   Web " } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Añadir ciclo" }));
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Elige el turno");

  fireEvent.click(within(dialog).getByRole("radio", { name: "Vespertino" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Añadir ciclo" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(llamadas.find((l) => l.method === "POST").body).toEqual({ codigo: "DAW", nombre: "Desarrollo Web", turno: 1 });
  expect(await screen.findByText("Ciclo «Desarrollo Web» añadido.")).toBeInTheDocument();
});

test("editing a ciclo in use: code and shift locked, only the name is sent; a refusal stays in the dialog", async () => {
  const { llamadas } = simularApi({
    "GET /especialidades/todas": CICLOS,
    "PUT /especialidades/:id": { status: 409, body: { error: "Ya existe un ciclo con ese código en ese turno." } },
  });
  abrir();
  const activos = await screen.findByRole("region", { name: "Activos" });
  fireEvent.click(within(activos).getAllByRole("button", { name: "Editar" })[0]);
  const dialog = screen.getByRole("dialog", { name: /Editar «Desarrollo de Aplicaciones/ });
  expect(within(dialog).getByText(/su código y su turno no se pueden cambiar/)).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Código")).toBeDisabled();
  expect(within(dialog).getByRole("radio", { name: "Diurno" })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Nombre"), { target: { value: "DAM (nuevo plan)" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Ya existe un ciclo con ese código en ese turno.");
  expect(llamadas.find((l) => l.method === "PUT")).toMatchObject({ path: "/especialidades/4", body: { nombre: "DAM (nuevo plan)" } });
});

test("editing an unused ciclo can change code and shift", async () => {
  const { llamadas } = simularApi({ "GET /especialidades/todas": CICLOS, "PUT /especialidades/:id": { message: "Ciclo guardado." } });
  abrir();
  const activos = await screen.findByRole("region", { name: "Activos" });
  fireEvent.click(within(activos).getAllByRole("button", { name: "Editar" })[1]);
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Código"), { target: { value: "smr-b" } });
  fireEvent.click(within(dialog).getByRole("radio", { name: "Diurno" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(llamadas.find((l) => l.method === "PUT")).toMatchObject({
    path: "/especialidades/5",
    body: { codigo: "SMR-B", nombre: "Sistemas Microinformáticos y Redes", turno: 0 },
  });
});

test("switching off asks first and sends only the switch; switching on does not ask", async () => {
  const { llamadas } = simularApi({ "GET /especialidades/todas": CICLOS, "PUT /especialidades/:id": { message: "Ciclo guardado." } });
  abrir();
  const activos = await screen.findByRole("region", { name: "Activos" });
  fireEvent.click(within(activos).getAllByRole("button", { name: "Desactivar" })[0]);
  const pregunta = await screen.findByRole("dialog", { name: /Desactivar «Desarrollo de Aplicaciones/ });
  expect(llamadas.some((l) => l.method === "PUT")).toBe(false);
  fireEvent.click(within(pregunta).getByRole("button", { name: "Desactivar" }));
  await waitFor(() => expect(llamadas.some((l) => l.method === "PUT")).toBe(true));
  expect(llamadas.find((l) => l.method === "PUT")).toMatchObject({ path: "/especialidades/4", body: { activa: false } });

  llamadas.length = 0;
  fireEvent.click(within(screen.getByRole("region", { name: "Desactivados" })).getByRole("button", { name: "Activar" }));
  await waitFor(() => expect(llamadas.some((l) => l.method === "PUT")).toBe(true));
  expect(llamadas.find((l) => l.method === "PUT")).toMatchObject({ path: "/especialidades/6", body: { activa: true } });
});
