import { badge, label, anexoNombre, SOLICITUD, RESERVA, DOCUMENTO } from "./labels.js";

test("every backend value has a Spanish label and a badge variant", () => {
  for (const table of [SOLICITUD, RESERVA, DOCUMENTO]) {
    for (const entry of Object.values(table)) {
      expect(entry.label).toMatch(/\S/);
      expect(["success", "warning", "danger", "info", "neutral", "brand"]).toContain(entry.variant);
    }
  }
  expect(label("reserva", "CONFIRMADA")).toBe("Confirmada");
  expect(label("solicitud", "RECHAZADO")).toBe("Rechazada");
  expect(badge("documento", "PENDIENTE_FIRMA")).toEqual({ label: "Pendiente de firma", variant: "info" });
  expect(label("rol", "COORDINADOR")).toBe("Coordinación");
});

test("unknown values are shown as they are, never hidden", () => {
  expect(badge("reserva", "NUEVO_ESTADO")).toEqual({ label: "NUEVO_ESTADO", variant: "neutral" });
  expect(badge("reserva", null).label).toBe("Sin estado");
});

test("annex names", () => {
  expect(anexoNombre("ANEXO_III")).toBe("Anexo III");
  expect(anexoNombre("ANEXO_II")).toBe("Anexo II");
  expect(anexoNombre(null)).toBe("Anexo II/III");
});
