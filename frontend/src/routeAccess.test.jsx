// Which page each role reaches at every address of the app (App.js routes and
// RequireRole). Pages are replaced by placeholders, so no request is made.
// Visitors are sent to the login; a logged-in user on a page that is not for
// their role is sent to their own home.
import { render, screen } from "@testing-library/react";
import App from "./App";

jest.mock("./components/layout/PageLayout.jsx", () => {
  const { Outlet } = require("react-router-dom");
  return () => <Outlet />;
});
const pagina = (nombre) => () => <p>PAGINA:{nombre}</p>;
jest.mock("./pages/Home/Home.js", () => pagina("Home"));
jest.mock("./pages/Login", () => pagina("Login"));
jest.mock("./pages/AddDualStudent", () => pagina("AddDualStudent"));
jest.mock("./pages/AddCompanyRequest", () => pagina("AddCompanyRequest"));
jest.mock("./pages/LinkStudents", () => pagina("LinkStudents"));
jest.mock("./pages/CompanyView/", () => pagina("CompanyView"));
jest.mock("./pages/AdminCompanyView/AdminCompanyView.jsx", () => pagina("AdminCompanyView"));
jest.mock("./pages/Convocatorias/Convocatorias.jsx", () => pagina("Convocatorias"));
jest.mock("./pages/Personal/Personal.jsx", () => pagina("Personal"));
jest.mock("./pages/Correos/Correos.jsx", () => pagina("Correos"));
jest.mock("./pages/StudentMain", () => pagina("StudentMain"));
jest.mock("./pages/AdminDocumentsView", () => pagina("AdminDocumentsView"));
jest.mock("./pages/Panel/Panel.jsx", () => pagina("Panel"));
jest.mock("./pages/Reservas/Reservas.jsx", () => pagina("Reservas"));
jest.mock("./pages/CambiarPassword.jsx", () => pagina("CambiarPassword"));
jest.mock("./pages/Ayuda/Ayuda.jsx", () => pagina("Ayuda"));
jest.mock("./pages/RecuperarPassword.jsx", () => ({
  RecuperarPassword: () => <p>PAGINA:RecuperarPassword</p>,
  RestablecerPassword: () => <p>PAGINA:RestablecerPassword</p>,
}));

function como(rol) {
  localStorage.clear();
  if (rol) {
    localStorage.setItem("user", JSON.stringify({ data: { id: 1, rol, token: "t" }, expires: Date.now() + 3600_000 }));
  }
}

function abrir(ruta, rol) {
  como(rol);
  window.history.pushState({}, "", ruta);
  const { unmount } = render(<App />);
  const texto = screen.getByText(/^PAGINA:/).textContent.replace("PAGINA:", "");
  const destino = window.location.pathname;
  unmount();
  return { pagina: texto, destino };
}

const ROLES = [null, "ADMINISTRADOR", "COORDINADOR", "EMPRESA", "ALUMNO"];
const INICIO = { ADMINISTRADOR: "Panel", COORDINADOR: "Panel", EMPRESA: "CompanyView", ALUMNO: "StudentMain" };

// ruta → page, and the roles allowed in (null = anyone, even without login).
const RUTAS = [
  ["/", "Home", null],
  ["/login", "Login", null],
  ["/recuperar-contrasena", "RecuperarPassword", null],
  ["/restablecer-contrasena", "RestablecerPassword", null],
  ["/addDualStudent", "AddDualStudent", null],
  ["/addCompanyRequest", "AddCompanyRequest", null],
  ["/ayuda", "Ayuda", null],
  ["/panel", "Panel", ["ADMINISTRADOR", "COORDINADOR"]],
  ["/alumnos", "LinkStudents", ["ADMINISTRADOR", "COORDINADOR", "EMPRESA"]],
  ["/empresas", "AdminCompanyView", ["ADMINISTRADOR", "COORDINADOR"]],
  ["/reservas", "Reservas", ["ADMINISTRADOR", "COORDINADOR"]],
  ["/documentos", "AdminDocumentsView", ["ADMINISTRADOR", "COORDINADOR"]],
  ["/configuracion/convocatorias", "Convocatorias", ["ADMINISTRADOR"]],
  ["/configuracion/personal", "Personal", ["ADMINISTRADOR"]],
  ["/configuracion/correos", "Correos", ["ADMINISTRADOR"]],
  ["/companyMain", "CompanyView", ["EMPRESA"]],
  ["/studentMain", "StudentMain", ["ALUMNO"]],
  ["/cambiarPassword", "CambiarPassword", ["ADMINISTRADOR", "COORDINADOR", "EMPRESA", "ALUMNO"]],
];

const CASOS = RUTAS.flatMap(([ruta, page, roles]) => ROLES.map((rol) => {
  let esperada;
  if (!roles || (rol && roles.includes(rol))) esperada = page;
  else if (!rol) esperada = "Login";
  else esperada = INICIO[rol];
  return [ruta, rol || "visitante", esperada];
}));

describe("access to every page", () => {
  afterAll(() => localStorage.clear());

  test.each(CASOS)("%s as %s → %s", (ruta, rol, esperada) => {
    expect(abrir(ruta, rol === "visitante" ? null : rol).pagina).toBe(esperada);
  });

  test("an expired session counts as a visitor", () => {
    localStorage.setItem("user", JSON.stringify({ data: { id: 1, rol: "ADMINISTRADOR", token: "t" }, expires: Date.now() - 1 }));
    window.history.pushState({}, "", "/configuracion/correos");
    const { unmount } = render(<App />);
    expect(screen.getByText(/^PAGINA:/).textContent).toBe("PAGINA:Login");
    unmount();
  });

  test("old addresses keep working, with their query string", () => {
    expect(abrir("/linkStudents?x=1", "COORDINADOR")).toEqual({ pagina: "LinkStudents", destino: "/alumnos" });
    expect(window.location.search).toBe("?x=1");
    expect(abrir("/companiesView", "ADMINISTRADOR").destino).toBe("/empresas");
    expect(abrir("/documentsView", "ADMINISTRADOR").destino).toBe("/documentos");
    expect(abrir("/convocatorias", "ADMINISTRADOR")).toEqual({ pagina: "Convocatorias", destino: "/configuracion/convocatorias" });
    expect(abrir("/personal", "ADMINISTRADOR").destino).toBe("/configuracion/personal");
    expect(abrir("/correos?clave=x", "ADMINISTRADOR")).toEqual({ pagina: "Correos", destino: "/configuracion/correos" });
    expect(window.location.search).toBe("?clave=x");
    expect(abrir("/convocatorias", "COORDINADOR")).toEqual({ pagina: "Panel", destino: "/panel" });
  });

  test("Configuración opens its first tab; an unknown tab goes back to it", () => {
    expect(abrir("/configuracion", "ADMINISTRADOR")).toEqual({ pagina: "Convocatorias", destino: "/configuracion/convocatorias" });
    expect(abrir("/configuracion/otra", "ADMINISTRADOR")).toEqual({ pagina: "Convocatorias", destino: "/configuracion/convocatorias" });
    expect(abrir("/configuracion", "COORDINADOR").pagina).toBe("Panel");
  });

  test("an unknown address goes to the home page", () => {
    expect(abrir("/no-existe", null)).toEqual({ pagina: "Home", destino: "/" });
  });
});
