// Account pages: login (per role, forced password change, errors, session
// notice), forgotten password, reset from the email link and voluntary change.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import Login from "./Login";
import { RecuperarPassword, RestablecerPassword } from "./RecuperarPassword.jsx";
import CambiarPassword from "./CambiarPassword.jsx";
import { iniciarSesion, renderPagina, simularApi } from "../testUtils";

const escribir = (label, valor) => fireEvent.change(screen.getByLabelText(label), { target: { value: valor } });
const ruta = () => screen.getByTestId("ruta").textContent;

beforeEach(() => iniciarSesion(null));

function entrar(usuario = "  ana@centro.test ", password = "secreta123") {
  escribir("Usuario", usuario);
  escribir("Contraseña", password);
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("login", () => {
  test.each([
    ["COORDINADOR", "/panel"],
    ["ADMINISTRADOR", "/panel"],
    ["EMPRESA", "/companyMain"],
    ["ALUMNO", "/studentMain"],
  ])("%s goes to %s and the session is stored", async (rol, destino) => {
    const { llamadas } = simularApi({ "POST /auth/login": { token: "tok", user: { id: 1, rol, nombre: "X" } } });
    renderPagina(<Login />, { ruta: "/login", patron: "/login" });
    entrar();
    await waitFor(() => expect(ruta()).toBe(destino));
    expect(llamadas[0].body).toEqual({ username: "ana@centro.test", password: "secreta123" });
    expect(JSON.parse(localStorage.getItem("user")).data).toMatchObject({ rol, token: "tok" });
  });

  test("wrong credentials show the server's message and keep the user on the page", async () => {
    simularApi({ "POST /auth/login": { status: 401, body: { error: "Credenciales incorrectas." } } });
    renderPagina(<Login />, { ruta: "/login", patron: "/login" });
    entrar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Credenciales incorrectas.");
    expect(ruta()).toBe("/login");
    expect(localStorage.getItem("user")).toBeNull();
  });

  test("a temporary password forces a new one before entering, and the session starts only then", async () => {
    const { llamadas } = simularApi({
      "POST /auth/login": { token: "temporal", user: { id: 1, rol: "EMPRESA", must_change_password: true } },
      "POST /auth/changePassword": { token: "nuevo" },
      "GET /auth/me": { id: 1, rol: "EMPRESA", nombre: "ACME" },
    });
    renderPagina(<Login />, { ruta: "/login", patron: "/login" });
    entrar("B12345674", "temporal1");
    expect(await screen.findByRole("heading", { name: "Cambiar contraseña" })).toBeInTheDocument();
    expect(localStorage.getItem("user")).toBeNull();

    escribir("Nueva contraseña", "nueva-clave");
    escribir("Confirmar contraseña", "otra-clave");
    fireEvent.click(screen.getByRole("button", { name: "Establecer contraseña" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no coinciden");

    escribir("Nueva contraseña", "corta");
    escribir("Confirmar contraseña", "corta");
    fireEvent.click(screen.getByRole("button", { name: "Establecer contraseña" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("8 caracteres");

    escribir("Nueva contraseña", "nueva-clave");
    escribir("Confirmar contraseña", "nueva-clave");
    fireEvent.click(screen.getByRole("button", { name: "Establecer contraseña" }));
    await waitFor(() => expect(ruta()).toBe("/companyMain"));
    const cambio = llamadas.find((l) => l.path === "/auth/changePassword");
    expect(cambio.headers.Authorization).toBe("Bearer temporal");
    expect(cambio.body).toEqual({ currentPassword: "temporal1", newPassword: "nueva-clave" });
    expect(llamadas.find((l) => l.path === "/auth/me").headers.Authorization).toBe("Bearer nuevo");
    expect(JSON.parse(localStorage.getItem("user")).data).toMatchObject({ token: "nuevo", must_change_password: false });
  });

  test("a failed forced change shows the error", async () => {
    simularApi({
      "POST /auth/login": { token: "t", user: { id: 1, rol: "ALUMNO", must_change_password: true } },
      "POST /auth/changePassword": { status: 400, body: { error: "Contraseña débil." } },
    });
    renderPagina(<Login />, { ruta: "/login", patron: "/login" });
    entrar("12345678Z", "temporal1");
    await screen.findByRole("heading", { name: "Cambiar contraseña" });
    escribir("Nueva contraseña", "nueva-clave");
    escribir("Confirmar contraseña", "nueva-clave");
    fireEvent.click(screen.getByRole("button", { name: "Establecer contraseña" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Contraseña débil.");
  });
});

describe("forgotten password", () => {
  test("sends the user and shows the server's message", async () => {
    const { llamadas } = simularApi({ "POST /auth/forgotPassword": { message: "Si la cuenta existe, te enviaremos un enlace." } });
    renderPagina(<RecuperarPassword />);
    escribir("Usuario", " 12345678Z ");
    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));
    expect(await screen.findByRole("status")).toHaveTextContent("te enviaremos un enlace");
    expect(llamadas[0].body).toEqual({ username: "12345678Z" });
  });

  test("an error is shown and the form stays", async () => {
    simularApi({ "POST /auth/forgotPassword": { status: 429, body: { error: "Demasiadas peticiones." } } });
    renderPagina(<RecuperarPassword />);
    escribir("Usuario", "x");
    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiadas peticiones.");
  });
});

describe("reset from the email link", () => {
  test("without a code the link is invalid", () => {
    simularApi();
    renderPagina(<RestablecerPassword />, { ruta: "/restablecer-contrasena" });
    expect(screen.getByRole("heading", { name: "Enlace no válido" })).toBeInTheDocument();
  });

  test("checks length and match locally, then sends the code and goes to login", async () => {
    const { llamadas } = simularApi({ "POST /auth/resetPassword": { message: "Contraseña actualizada." } });
    renderPagina(<RestablecerPassword />, { ruta: "/restablecer-contrasena?token=abc", patron: "/restablecer-contrasena" });
    escribir("Nueva contraseña", "corta");
    escribir("Confirmar contraseña", "corta");
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("8 caracteres");
    escribir("Nueva contraseña", "nueva-clave");
    escribir("Confirmar contraseña", "nueva-otra");
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no coinciden");
    expect(llamadas).toHaveLength(0);
    escribir("Confirmar contraseña", "nueva-clave");
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    await waitFor(() => expect(ruta()).toBe("/login"));
    expect(llamadas[0].body).toEqual({ token: "abc", newPassword: "nueva-clave" });
  });

  test("an expired code shows the server's message and offers a new link", async () => {
    simularApi({ "POST /auth/resetPassword": { status: 400, body: { error: "El enlace ha caducado." } } });
    renderPagina(<RestablecerPassword />, { ruta: "/restablecer-contrasena?token=abc", patron: "/restablecer-contrasena" });
    escribir("Nueva contraseña", "nueva-clave");
    escribir("Confirmar contraseña", "nueva-clave");
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("caducado");
    expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" })).toHaveAttribute("href", "/recuperar-contrasena");
  });
});

describe("voluntary password change", () => {
  beforeEach(() => iniciarSesion({ id: 1, rol: "ADMINISTRADOR", nombre: "Admin" }));

  test("needs the current one, 8 characters and a match", async () => {
    const { llamadas } = simularApi();
    renderPagina(<CambiarPassword />);
    const enviar = () => fireEvent.click(screen.getByRole("button", { name: /Cambiar contraseña|Guardar/ }));
    enviar();
    expect(await screen.findByText("Introduce tu contraseña actual.")).toBeInTheDocument();
    escribir("Contraseña actual", "vieja-clave");
    escribir("Nueva contraseña", "corta");
    enviar();
    expect(await screen.findByText(/al menos 8 caracteres/)).toBeInTheDocument();
    escribir("Nueva contraseña", "nueva-clave");
    escribir("Confirmar nueva contraseña", "nueva-otra");
    enviar();
    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(llamadas).toHaveLength(0);
  });

  test("on success the new token replaces the old one and the form is cleared", async () => {
    const { llamadas } = simularApi({ "POST /auth/changePassword": { token: "nuevo" } });
    renderPagina(<CambiarPassword />);
    escribir("Contraseña actual", "vieja-clave");
    escribir("Nueva contraseña", "nueva-clave");
    escribir("Confirmar nueva contraseña", "nueva-clave");
    fireEvent.click(screen.getByRole("button", { name: /Cambiar contraseña|Guardar/ }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("user")).data.token).toBe("nuevo"));
    expect(llamadas[0].headers.Authorization).toBe("Bearer t");
    expect(screen.getByLabelText("Contraseña actual")).toHaveValue("");
  });

  test("a wrong current password shows the server's error", async () => {
    simularApi({ "POST /auth/changePassword": { status: 400, body: { error: "La contraseña actual no es correcta." } } });
    renderPagina(<CambiarPassword />);
    escribir("Contraseña actual", "mala-clave");
    escribir("Nueva contraseña", "nueva-clave");
    escribir("Confirmar nueva contraseña", "nueva-clave");
    fireEvent.click(screen.getByRole("button", { name: /Cambiar contraseña|Guardar/ }));
    expect(await screen.findByText("La contraseña actual no es correcta.")).toBeInTheDocument();
  });
});
