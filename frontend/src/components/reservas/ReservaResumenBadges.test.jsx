import { render, screen } from "@testing-library/react";
import ReservaResumenBadges from "./ReservaResumenBadges.jsx";

// WF-15: badges show the documents' real state, not the reservation's.
test("a confirmed reservation whose annex is not validated does not show a validated annex", () => {
  render(
    <ReservaResumenBadges
      estado="CONFIRMADA"
      resumen={{
        anexo: { clave: "ANEXO_II", estado_operativo: "PENDIENTE_GENERACION", estado_operativo_label: "Pendiente de generar" },
        calendario: { clave: "CALENDARIO", estado_operativo: "PENDIENTE_SUBIDA", estado_operativo_label: "Pendiente de subir" },
      }}
    />,
  );
  expect(screen.getByText("Confirmada")).toBeInTheDocument();
  expect(screen.getByText("Anexo II: pendiente de generar")).toBeInTheDocument();
  expect(screen.getByText("Calendario: pendiente de subir")).toBeInTheDocument();
  expect(screen.queryByText(/validado/i)).not.toBeInTheDocument();
});

test("without a contract type the annex is reported as missing the type", () => {
  render(<ReservaResumenBadges estado="PENDIENTE" resumen={{ anexo: null, calendario: null }} />);
  expect(screen.getByText("Anexo: falta tipo de contrato")).toBeInTheDocument();
});
