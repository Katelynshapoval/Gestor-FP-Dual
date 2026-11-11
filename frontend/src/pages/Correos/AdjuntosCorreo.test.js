import { avisos } from "./AdjuntosCorreo.jsx";

const convenio = { id: 1, tipo: "DOCUMENTO", documento: "CONVENIO", nombre: "Convenio" };

describe("avisos de adjuntos", () => {
  test("nothing to say when the switch and the list agree", () => {
    const correo = {
      adjuntos: [convenio],
      documentos_disponibles: [{ documento: "CONVENIO", nombre: "Convenio", adjunto: true }],
    };
    expect(avisos(correo, true)).toEqual([]);
    expect(avisos({ adjuntos: [], documentos_disponibles: [] }, false)).toEqual([]);
  });

  test("switch on without attachments", () => {
    expect(avisos({ adjuntos: [], documentos_disponibles: [] }, true)).toHaveLength(1);
  });

  test("a generated document the email cannot carry", () => {
    const out = avisos({ adjuntos: [convenio], documentos_disponibles: [] }, true);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/no se puede adjuntar/);
  });
});
