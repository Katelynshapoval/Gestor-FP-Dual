import { FAQ, faqParaRol } from "./faq.js";

test("company-only questions are hidden from students; visitors and staff see everything", () => {
  const soloEmpresa = FAQ.filter((item) => item.perfiles?.includes("EMPRESA") && !item.perfiles.includes("ALUMNO"));
  expect(soloEmpresa.length).toBeGreaterThan(0);
  expect(faqParaRol(null)).toEqual(FAQ);
  expect(faqParaRol("ADMINISTRADOR")).toEqual(FAQ);
  expect(faqParaRol("COORDINADOR")).toEqual(FAQ);
  expect(faqParaRol("EMPRESA")).toEqual(FAQ);
  soloEmpresa.forEach((item) => expect(faqParaRol("ALUMNO")).not.toContain(item));
});
