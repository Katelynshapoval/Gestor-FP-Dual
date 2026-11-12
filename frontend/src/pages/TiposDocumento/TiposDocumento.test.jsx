// Configuración › Documentos: the types grouped by what they belong to, the
// system ones read-only, creating one (signers follow the parent, the contract
// family only for reservations), editing, and switching one off.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import TiposDocumento from "./TiposDocumento.jsx";
import { firmantesTexto } from "./tiposDocumentoTextos.js";
import { iniciarSesion, renderPagina, simularApi } from "../../testUtils";

const tipo = (extra) => ({
  clave: "ANEXO_IV", nombre: "Anexo IV", ambito: "reserva", generado: true,
  firma_empresa: true, firma_centro: true, firma_alumno: false, requerido: true, familia_contrato: "beca",
  activo: true, es_sistema: false, documentos: 0, plantilla: null, ...extra,
});
const TIPOS = {
  tipos: [
    tipo({ clave: "CV", nombre: "CV", ambito: "solicitud_alumno", generado: false, firma_empresa: false, firma_centro: false, familia_contrato: null, es_sistema: true }),
    tipo({ clave: "CONVENIO", nombre: "Convenio", ambito: "solicitud_empresa", firma_centro: false, familia_contrato: null, es_sistema: true, plantilla: { version: 3 } }),
    tipo(),
    tipo({ clave: "HOJA", nombre: "Hoja de ruta", requerido: false, familia_contrato: null, activo: false, documentos: 2, plantilla: { version: 1 } }),
  ],
  ambitos: [],
};

beforeEach(() => iniciarSesion({ id: 1, rol: "ADMINISTRADOR", nombre: "Admin" }));

const abrir = () => renderPagina(<TiposDocumento />, { ruta: "/configuracion/documentos" });

test("types grouped by what they belong to; system ones read-only; missing templates flagged", async () => {
  simularApi({ "GET /tipos-documento": TIPOS });
  abrir();
  const reserva = await screen.findByRole("region", { name: "Reserva" });
  expect(within(reserva).getByText("Anexo IV")).toBeInTheDocument();
  expect(within(reserva).getByText("Solo beca")).toBeInTheDocument();
  expect(within(reserva).getByText("Obligatorio")).toBeInTheDocument();
  expect(within(reserva).getByText("Desactivado")).toBeInTheDocument();
  expect(within(reserva).getByRole("link", { name: "Falta la plantilla" })).toHaveAttribute("href", "/documentos?vista=plantillas");
  expect(within(reserva).getByRole("button", { name: "Activar" })).toBeInTheDocument();

  const alumno = screen.getByRole("region", { name: "Solicitud del alumno" });
  expect(within(alumno).getByText("Se sube, no se genera")).toBeInTheDocument();
  expect(within(alumno).queryByRole("button")).toBeNull();
  const empresa = screen.getByRole("region", { name: "Solicitud de empresa" });
  expect(within(empresa).getByText(/Plantilla versión 3/)).toBeInTheDocument();
  expect(screen.getByText(/«Anexo IV» no tiene plantilla/)).toBeInTheDocument();
});

test("creating: signers follow the parent, the family only for reservations; the API gets the form", async () => {
  const { llamadas } = simularApi({
    "GET /tipos-documento": TIPOS,
    "POST /tipos-documento": { message: "Documento «Hoja de prácticas» creado." },
  });
  abrir();
  fireEvent.click(await screen.findByRole("button", { name: /Nuevo documento/ }));
  const dialog = screen.getByRole("dialog", { name: "Nuevo documento" });

  fireEvent.click(within(dialog).getByRole("button", { name: "Crear documento" }));
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Escribe el nombre");

  fireEvent.change(within(dialog).getByLabelText("Nombre"), { target: { value: "  Hoja de prácticas " } });
  expect(within(dialog).getByRole("checkbox", { name: "Empresa" })).toBeDisabled();

  fireEvent.click(within(dialog).getByRole("radio", { name: /Solicitud de empresa/ }));
  expect(within(dialog).getByRole("checkbox", { name: "Alumno" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Empresa" }));
  expect(within(dialog).queryByText("En qué reservas")).toBeNull();

  fireEvent.click(within(dialog).getByRole("radio", { name: /Reserva/ }));
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Alumno" }));
  fireEvent.click(within(dialog).getByRole("radio", { name: /Solo reservas con contrato/ }));
  fireEvent.click(within(dialog).getByRole("checkbox", { name: /Obligatorio/ }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Crear documento" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(llamadas.find((l) => l.method === "POST").body).toEqual({
    nombre: "Hoja de prácticas", ambito: "reserva", firma_empresa: true, firma_centro: false, firma_alumno: true,
    requerido: true, familia_contrato: "contrato",
  });
  expect(await screen.findByText("Documento «Hoja de prácticas» creado.")).toBeInTheDocument();
});

test("going back to the student's application drops the company signature", async () => {
  simularApi({ "GET /tipos-documento": TIPOS });
  abrir();
  fireEvent.click(await screen.findByRole("button", { name: /Nuevo documento/ }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("radio", { name: /Reserva/ }));
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Empresa" }));
  fireEvent.click(within(dialog).getByRole("radio", { name: /Solicitud del alumno/ }));
  expect(within(dialog).getByRole("checkbox", { name: "Empresa" })).not.toBeChecked();
});

test("editing: the parent is fixed once documents exist; a refusal stays in the dialog", async () => {
  const { llamadas } = simularApi({
    "GET /tipos-documento": TIPOS,
    "PUT /tipos-documento/:clave": { status: 409, body: { error: "Ya hay un documento con ese nombre." } },
  });
  abrir();
  const reserva = await screen.findByRole("region", { name: "Reserva" });
  fireEvent.click(within(reserva).getAllByRole("button", { name: "Editar" })[1]);
  const dialog = screen.getByRole("dialog", { name: "Editar «Hoja de ruta»" });
  expect(within(dialog).getByText(/Ya hay 2 documentos de este tipo/)).toBeInTheDocument();
  expect(within(dialog).getByRole("radio", { name: /Solicitud de empresa/ })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Ya hay un documento con ese nombre.");
  expect(llamadas.find((l) => l.method === "PUT").path).toBe("/tipos-documento/HOJA");
});

test("switching off asks first and sends only the switch", async () => {
  const { llamadas } = simularApi({ "GET /tipos-documento": TIPOS, "PUT /tipos-documento/:clave": { message: "Documento «Anexo IV» guardado." } });
  abrir();
  const reserva = await screen.findByRole("region", { name: "Reserva" });
  fireEvent.click(within(reserva).getByRole("button", { name: "Desactivar" }));
  const pregunta = await screen.findByRole("dialog", { name: "Desactivar «Anexo IV»" });
  expect(llamadas.some((l) => l.method === "PUT")).toBe(false);
  fireEvent.click(within(pregunta).getByRole("button", { name: "Desactivar" }));
  await waitFor(() => expect(llamadas.some((l) => l.method === "PUT")).toBe(true));
  expect(llamadas.find((l) => l.method === "PUT")).toMatchObject({ path: "/tipos-documento/ANEXO_IV", body: { activo: false } });
});

test("signer wording", () => {
  expect(firmantesTexto({})).toBe("Sin firmas");
  expect(firmantesTexto({ firma_centro: true })).toBe("Firma centro");
  expect(firmantesTexto({ firma_empresa: true, firma_centro: true, firma_alumno: true })).toBe("Firman empresa, centro y alumno");
});
