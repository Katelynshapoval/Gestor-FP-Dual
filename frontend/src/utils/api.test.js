import { getJSON, postJSON, SESSION_EXPIRED_EVENT, tokenExpiry } from "./api.js";

function storeSession(token = "a.eyJleHAiOjQxMDI0NDQ4MDB9.s") {
  localStorage.setItem("user", JSON.stringify({ data: { token }, expires: Date.now() + 60_000 }));
}

function respond(status, body) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
  });
}

describe("api error handling (WF-16, WF-17)", () => {
  let expired;
  const onExpired = (e) => expired.push(e.detail);

  beforeEach(() => {
    localStorage.clear();
    expired = [];
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
  });
  afterEach(() => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired));

  test("errors carry status, the backend code and the body", async () => {
    storeSession();
    respond(409, { error: "Ya existe una solicitud.", code: "SOLICITUD_EXISTENTE" });
    await expect(postJSON("/x", {})).rejects.toMatchObject({
      status: 409,
      code: "SOLICITUD_EXISTENTE",
      message: "Ya existe una solicitud.",
    });
  });

  test("a generic code is used when the backend sends none", async () => {
    storeSession();
    respond(404, { error: "No encontrado" });
    await expect(getJSON("/x")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    respond(500, {});
    await expect(getJSON("/x")).rejects.toMatchObject({ status: 500, code: "SERVER" });
  });

  test("a network failure is reported as NETWORK, not as an empty result", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(getJSON("/x")).rejects.toMatchObject({ status: 0, code: "NETWORK" });
  });

  test("a 401 on an authenticated call announces the expired session once per call", async () => {
    storeSession();
    respond(401, { error: "Token inválido o expirado.", code: "TOKEN_INVALID" });
    await expect(getJSON("/reservas")).rejects.toMatchObject({ status: 401 });
    expect(expired).toEqual([{ code: "TOKEN_INVALID", message: "Token inválido o expirado." }]);
  });

  test("a 401 without a session, or from the login form, is not a session expiry", async () => {
    respond(401, { error: "No autenticado." });
    await expect(getJSON("/reservas")).rejects.toMatchObject({ status: 401 });
    storeSession();
    respond(401, { error: "Credenciales incorrectas" });
    await expect(postJSON("/auth/login", {})).rejects.toMatchObject({ status: 401 });
    expect(expired).toEqual([]);
  });

  test("tokenExpiry reads the JWT exp claim", () => {
    // payload {"exp":4102444800} → 2100-01-01
    expect(tokenExpiry("a.eyJleHAiOjQxMDI0NDQ4MDB9.s")).toBe(4102444800 * 1000);
    expect(tokenExpiry("not-a-token")).toBeNull();
  });
});
