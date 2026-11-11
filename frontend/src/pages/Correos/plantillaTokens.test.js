import {
  envolver,
  insertar,
  segmentar,
  variablesUsadas,
} from "./plantillaTokens";

describe("email template editor helpers", () => {
  const nombres = new Set(["alumno", "motivo"]);

  test("segments known variables, blocks, unknown tags and bold markers", () => {
    const tipos = segmentar(
      "Hola **{{alumno}}** {{#motivo}}x{{/motivo}} {{dni}}",
      nombres,
    ).map((s) => s.tipo);
    expect(tipos).toEqual([
      "texto",
      "negrita",
      "variable",
      "negrita",
      "texto",
      "bloque",
      "texto",
      "bloque",
      "texto",
      "desconocida",
    ]);
    // Segments rebuild the exact text, so the highlight never drifts from the caret.
    const t = "a {{ alumno }} b\n\nc {{#motivo}}";
    expect(
      segmentar(t, nombres)
        .map((s) => s.texto)
        .join(""),
    ).toBe(t);
  });

  test("lists the variables a template uses", () => {
    expect([
      ...variablesUsadas("{{alumno}} {{#motivo}}{{motivo}}{{/motivo}}"),
    ]).toEqual(["alumno", "motivo"]);
  });

  test("inserts at the caret and wraps the selection", () => {
    expect(insertar("Hola :", 5, 5, "{{alumno}}")).toEqual({
      valor: "Hola {{alumno}}:",
      cursor: 15,
    });
    expect(insertar("abc", 1, 2, "X")).toEqual({ valor: "aXc", cursor: 2 });
    expect(envolver("di hola", 3, 7, "**", "**", "texto")).toEqual({
      valor: "di **hola**",
      seleccion: [5, 9],
    });
    expect(envolver("ab", 1, 1, "[", "](https://)", "enlace")).toEqual({
      valor: "a[enlace](https://)b",
      seleccion: [2, 8],
    });
  });
});
