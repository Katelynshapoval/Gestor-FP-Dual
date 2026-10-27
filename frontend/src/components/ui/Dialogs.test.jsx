import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Modal from "./Modal.jsx";
import MotivoDialog from "./MotivoDialog.jsx";

// CRA resets mocks before each test, so the stub is installed per test.
beforeEach(() => {
  // requestAnimationFrame runs synchronously in these tests
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb();
    return 0;
  });
});

describe("Modal (PM-7, D.4)", () => {
  test("is an accessible dialog labelled by its title; Escape closes it and focus returns", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Abrir</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Detalle">
            <button>Dentro</button>
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByText("Abrir");
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Detalle" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Dentro")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  test("with stacked dialogs, Escape closes only the top one", () => {
    const closeOuter = jest.fn();
    const closeInner = jest.fn();
    render(
      <Modal open onClose={closeOuter} title="Fuera">
        <Modal open onClose={closeInner} title="Dentro">
          <p>x</p>
        </Modal>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });

  test("Tab stays inside the dialog", () => {
    render(
      <Modal open onClose={() => {}} title="T" footer={<button>Último</button>}>
        <button>Primero</button>
      </Modal>,
    );
    const last = screen.getByText("Último");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByLabelText("Cerrar")).toHaveFocus();
  });
});

describe("MotivoDialog", () => {
  test("a required reason blocks the button until something is typed", async () => {
    const onConfirm = jest.fn().mockResolvedValue();
    render(<MotivoDialog open onClose={() => {}} onConfirm={onConfirm} title="Cancelar reserva" confirmLabel="Cancelar reserva" />);
    const button = screen.getByRole("button", { name: "Cancelar reserva" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "  Sin plaza  " } });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Sin plaza"));
  });

  test("an error from the action is shown inside the dialog, which stays open", async () => {
    const onConfirm = jest.fn().mockRejectedValue(new Error("Una reserva confirmada solo la puede cancelar el centro."));
    render(<MotivoDialog open onClose={() => {}} onConfirm={onConfirm} title="Cancelar" confirmLabel="Confirmar" />);
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("solo la puede cancelar el centro"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("an optional reason can be confirmed empty", async () => {
    const onConfirm = jest.fn().mockResolvedValue();
    render(<MotivoDialog open required={false} onClose={() => {}} onConfirm={onConfirm} title="Reabrir" confirmLabel="Reabrir" />);
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(""));
  });
});
