import { manualHtml, parseManual, searchManual } from "./manual";

const MANUAL = `# Manual de usuario

_Versión del manual: 28/10/2026._

---

<a id="indice"></a>

## Índice

1. [Introducción](#introduccion)

<a id="introduccion"></a>

## 1. Introducción

FP Dual gestiona la **Formación Profesional Dual**.

<a id="recuperar"></a>

### Recuperar la contraseña

Pulsa «¿Has olvidado tu contraseña?». Ver [plazas](#plazas).

---

<a id="empresa"></a>

## 2. Manual de empresa

<a id="plazas"></a>

### Ciclos y plazas

Cada ciclo tiene un número de plazas.
`;

describe("parseManual", () => {
  const { intro, chapters } = parseManual(MANUAL);

  test("splits numbered chapters and leaves out the title and the index", () => {
    expect(chapters.map((c) => [c.number, c.title, c.id])).toEqual([
      ["1", "Introducción", "introduccion"],
      ["2", "Manual de empresa", "empresa"],
    ]);
    expect(intro).toContain("Versión del manual");
    expect(intro).not.toContain("# Manual de usuario");
  });

  test("knows which anchors each chapter holds", () => {
    expect([...chapters[0].ids]).toEqual(["introduccion", "recuperar"]);
    expect(chapters[0].sections).toEqual([{ id: "recuperar", title: "Recuperar la contraseña" }]);
    expect(chapters[0].markdown).not.toMatch(/---\s*$/);
  });

  test("puts anchor ids on the rendered headings", () => {
    expect(manualHtml(chapters[0].markdown)).toContain('<h3 id="recuperar">Recuperar la contraseña</h3>');
  });
});

describe("searchManual", () => {
  const { chapters } = parseManual(MANUAL);

  test("finds sections ignoring accents, title matches first", () => {
    const hits = searchManual(chapters, "contrasena");
    expect(hits[0]).toMatchObject({ id: "recuperar", chapter: "1. Introducción", title: "Recuperar la contraseña" });
    expect(hits[0].snippet).toContain("olvidado tu contraseña");
  });

  test("returns nothing for an empty query", () => {
    expect(searchManual(chapters, "  ")).toEqual([]);
  });
});
