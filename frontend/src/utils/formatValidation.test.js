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
