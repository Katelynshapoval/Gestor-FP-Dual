import { cifValido, dniNieValido, nSSValido } from "./formatValidation";

// Each row: value, expected answer. The expected answers are the server's
// (backend/src/helpers/dbHelpers.js), so the form never accepts what the
// server will reject, or the other way round.
const CIFS = [
  ["B12345674", true],
  ["b12345674", true],
  [" B12345674 ", true],
  ["A58818501", true],
  ["Q2826000H", true],
  ["P2826000H", true],
  ["N0032484H", true],
  ["C12345674", true],
  ["C1234567D", true],
  ["B12345675", false],
  ["12345674B", false],
  ["11234567A", false],
  ["B1234567", false],
  ["B123456745", false],
  ["BB2345674", false],
  ["I12345674", false],
  ["X12345674", false],
  ["", false],
  [null, false],
  [undefined, false],
];

const DNIS = [
  ["12345678Z", true],
  ["12345678z", true],
  [" 12345678Z ", true],
  ["00000000T", true],
  ["X1234567L", true],
  ["Y1234567X", true],
  ["Z1234567R", true],
  ["12345678A", false],
  ["X1234567A", false],
  ["1234567Z", false],
  ["123456789Z", false],
  ["W1234567L", false],
  ["", false],
  [null, false],
];

describe("cifValido", () => {
  test.each(CIFS)("%p → %p", (valor, esperado) => {
    expect(cifValido(valor)).toBe(esperado);
  });
});

describe("dniNieValido", () => {
  test.each(DNIS)("%p → %p", (valor, esperado) => {
    expect(dniNieValido(valor)).toBe(esperado);
  });
});

describe("nSSValido", () => {
  test("control digits are the number mod 97", () => {
    const numero = "2812345678";
    const control = String(Number(numero) % 97).padStart(2, "0");
    expect(nSSValido(numero + control)).toBe(true);
    expect(nSSValido(numero + String((Number(control) + 1) % 97).padStart(2, "0"))).toBe(false);
  });
});

describe("forgiving input", () => {
  const { MAX_PDF_BYTES, formatBytes, normalizarEmail, normalizarTelefono, problemaPdf, telefonoValido } = require("./formatValidation.js");
  const { avisoRegenerar } = require("./documentos.js");

  test("phones with spaces, dashes or +34 are the same 9 digits", () => {
    for (const t of ["634 897 139", "634-897-139", "+34 634 89 71 39", "0034634897139", "(634) 897.139"]) {
      expect(normalizarTelefono(t)).toBe("634897139");
      expect(telefonoValido(t)).toBe(true);
    }
    expect(telefonoValido("634 89")).toBe(false);
  });

  test("emails are compared trimmed and in lower case", () => {
    expect(normalizarEmail("  Ana.Garcia@Zaragoza.Salesianos.EDU ")).toBe("ana.garcia@zaragoza.salesianos.edu");
  });

  test("a picked file is checked for type, size and emptiness at once", () => {
    const f = (name, size, type = "application/pdf") => ({ name, size, type });
    expect(problemaPdf(null)).toBeNull();
    expect(problemaPdf(f("cv.pdf", 2_000_000))).toBeNull();
    expect(problemaPdf(f("CV.PDF", 1000, ""))).toBeNull();
    expect(problemaPdf(f("foto.jpg", 1000, "image/jpeg"))).toMatch(/debe ser un PDF/);
    expect(problemaPdf(f("scan.pdf", MAX_PDF_BYTES + 1))).toMatch(/máximo es 10,0 MB/);
    expect(problemaPdf(f("vacio.pdf", 0))).toMatch(/vacío/);
    expect(formatBytes(512)).toBe("1 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2,5 MB");
  });

  test("regenerating names who already signed", () => {
    expect(avisoRegenerar([])).toBe("Se creará una nueva versión del documento.");
    const firmas = [
      { rol_label: "Empresa", estado: "FIRMADO" },
      { rol_label: "Centro", estado: "PENDIENTE" },
      { rol_label: "Alumno", estado: "FIRMADO" },
    ];
    expect(avisoRegenerar(firmas)).toMatch(/Ya han firmado: Empresa y Alumno\..*tendrán que volver a firmar/);
  });
});
