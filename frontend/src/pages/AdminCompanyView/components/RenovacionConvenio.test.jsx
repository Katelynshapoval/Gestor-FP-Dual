// One convenio per company (migration 026): the renewal panel on the company
// card (reason, ciclos before/after, next step), «Sustituir convenio», the
// re-apply notice for the company, and the company's pending item.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import RenovacionConvenio, { pasosRenovacion } from "./RenovacionConvenio.jsx";
import { AvisoConvenioReaplicar, pendientesEmpresa } from "../../CompanyView/index.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../../../testUtils";

const EMPRESA = {
  id_solicitud_empresa: 20, empresa: "ACME", convocatoria_activa: true, estado_validacion: "VALIDADO",
  renovacion_convenio: null, convenio_heredado_de: null,
};
const RENOVACION = {
  id_renovacion: 4, motivo: "CICLOS", detalle: "La empresa ha añadido el ciclo Web",
  ciclos_antes: "Electricidad", ciclos_ahora: "Electricidad, Web", creado_en: "2026-11-12T10:00:00Z",
};

beforeEach(() => iniciarSesion({ id: 1, rol: "ADMINISTRADOR", nombre: "Admin" }));

test("steps: generate, the company signs, validate; done ones are marked", () => {
  expect(pasosRenovacion("sin_convenio").map((p) => p.hecho)).toEqual([false, false, false]);
  expect(pasosRenovacion("validado").map((p) => p.hecho)).toEqual([true, false, false]);
  expect(pasosRenovacion("pendiente").map((p) => p.hecho)).toEqual([true, true, false]);
  expect(pasosRenovacion("rechazado")[1].texto).toMatch(/subir de nuevo/);
});

test("an open renewal shows why, the ciclos before and after, and the next step", () => {
  renderPagina(<RenovacionConvenio empresa={{ ...EMPRESA, renovacion_convenio: RENOVACION }} convenioStatus="sin_convenio" />);
  const panel = screen.getByRole("region", { name: "Renovación del convenio" });
  expect(within(panel).getByText("Convenio por renovar")).toBeInTheDocument();
  expect(within(panel).getByText(/La empresa ha añadido el ciclo Web/)).toBeInTheDocument();
  expect(within(panel).getByText("Electricidad, Web")).toBeInTheDocument();
  expect(within(panel).getByText(/siguiente paso/).closest("li")).toHaveTextContent(/Generar el convenio nuevo/);
  expect(within(panel).getByRole("link", { name: "Ir al convenio en Documentos" })).toHaveAttribute(
    "href", "/documentos?documento=CONVENIO&empresa=ACME",
  );
  expect(screen.queryByRole("button", { name: "Sustituir convenio" })).toBeNull();
});

test("without a renewal: inherited note, and «Sustituir convenio» asks a reason then calls the API", async () => {
  const { llamadas } = simularApi({
    "POST /solicitudes/empresa/20/convenio/sustituir": { message: "Convenio sustituido. El nuevo se ha enviado a la empresa para que lo firme." },
  });
  const onUpdated = vi.fn();
  renderPagina(<RenovacionConvenio empresa={{ ...EMPRESA, convenio_heredado_de: "2025/2026" }} convenioStatus="validado" onUpdated={onUpdated} />);
  expect(screen.getByText(/mismo convenio de la convocatoria 2025\/2026/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sustituir convenio" }));
  const dialog = screen.getByRole("dialog", { name: "Sustituir convenio" });
  expect(within(dialog).getByRole("button", { name: "Sustituir convenio" })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Por qué se sustituye"), { target: { value: "Cambio de representante" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Sustituir convenio" }));
  await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  expect(llamadas.find((l) => l.method === "POST").body).toEqual({ motivo: "Cambio de representante" });
  expect(await screen.findByText(/El nuevo se ha enviado a la empresa/)).toBeInTheDocument();
});

test("no «Sustituir» without a convenio or outside the active convocatoria", () => {
  const { unmount } = renderPagina(<RenovacionConvenio empresa={EMPRESA} convenioStatus="sin_convenio" />);
  expect(screen.queryByRole("button")).toBeNull();
  unmount();
  renderPagina(<RenovacionConvenio empresa={{ ...EMPRESA, convocatoria_activa: false }} convenioStatus="validado" />);
  expect(screen.queryByRole("button")).toBeNull();
});

test("re-applying: same ciclos keep the convenio, others mean a new one to sign", () => {
  const vigente = { convocatoria: "2025/2026", ciclos: [{ id: 1, nombre: "Electricidad" }, { id: 3, nombre: "Web" }] };
  const { rerender } = render(<AvisoConvenioReaplicar vigente={vigente} seleccion={{ 3: 1, 1: 2 }} />);
  expect(screen.getByRole("status")).toHaveTextContent(/sigue vigente y no tendréis que firmar otro/);
  rerender(<AvisoConvenioReaplicar vigente={vigente} seleccion={{ 1: 2 }} />);
  expect(screen.getByRole("status")).toHaveTextContent(/tendréis que firmar un convenio nuevo/);
  rerender(<AvisoConvenioReaplicar vigente={null} seleccion={{ 1: 2 }} />);
  expect(screen.queryByRole("status")).toBeNull();
});

test("the company's pending list asks to sign the new convenio, with the reason", () => {
  const irA = vi.fn();
  const items = pendientesEmpresa({
    solicitud: { convocatoria_activa: true, estado_validacion: "VALIDADO", renovacion_convenio: RENOVACION },
    cambio: null, reservations: [], documentos: [], irA,
  });
  const item = items.find((i) => i.key === "renovar-convenio");
  expect(item.title).toBe("Tenéis que firmar un convenio nuevo.");
  expect(item.text).toMatch(/Motivo: La empresa ha añadido el ciclo Web/);
  item.action.onClick();
  expect(irA).toHaveBeenCalledWith("documentos");
});
