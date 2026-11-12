// A company books a student choosing beca or contrato: the dialog shows which
// annex that means (beca → Anexo III, the rest → Anexo II), cannot be sent
// without a type, and keeps a refusal on screen.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReservarDialog from "./ReservarDialog.jsx";
import { simularApi } from "../../testUtils";

const TIPOS = [
  { id_tipo_contrato: 1, nombre: "BECA", nombre_mostrar: "Beca" },
  { id_tipo_contrato: 2, nombre: "CONTRATO_DE_FORMACION_EN_ALTERNANCIA", nombre_mostrar: "Contrato de formación en alternancia" },
];

test("choosing the type shows its annex and books with it", async () => {
  simularApi({ "GET /tiposContrato": TIPOS });
  const onConfirm = vi.fn().mockResolvedValue();
  render(<ReservarDialog open nombre="Ana" onClose={() => {}} onConfirm={onConfirm} />);

  const boton = screen.getByRole("button", { name: "Reservar" });
  expect(boton).toBeDisabled();
  await waitFor(() => expect(screen.getByRole("option", { name: "Beca" })).toBeInTheDocument());

  const select = screen.getByLabelText("Tipo de contrato");
  fireEvent.change(select, { target: { value: "1" } });
  expect(screen.getByText("Esta reserva usará el Anexo III.")).toBeInTheDocument();
  fireEvent.change(select, { target: { value: "2" } });
  expect(screen.getByText("Esta reserva usará el Anexo II.")).toBeInTheDocument();

  fireEvent.click(boton);
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(2));
});

test("a refusal stays in the dialog", async () => {
  simularApi({ "GET /tiposContrato": TIPOS });
  const onConfirm = vi.fn().mockRejectedValue(new Error("Sin plazas."));
  render(<ReservarDialog open onClose={() => {}} onConfirm={onConfirm} />);
  await waitFor(() => expect(screen.getByRole("option", { name: "Beca" })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("Tipo de contrato"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Reservar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sin plazas.");
});
