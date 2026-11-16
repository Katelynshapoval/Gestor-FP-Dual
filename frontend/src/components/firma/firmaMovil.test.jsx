// "Sign with the phone" on the computer's side (FirmaConMovil): the QR, the
// countdown, the drawing that arrives, expiry (by the server or 404), a
// creation error, a new code, and that the session is closed on leaving. Also
// the signature helpers in utils/firma.js (endpoints, errors, data URLs).
import { act, fireEvent, render, screen } from "@testing-library/react";
import FirmaConMovil from "./FirmaConMovil.jsx";
import FirmaPad from "./FirmaPad.jsx";
import * as firma from "../../utils/firma.js";
import { iniciarSesion, simularApi } from "../../testUtils";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const SESION = { id: 9, token: "tok", lectura: "lec", minutos: 10 };

describe("FirmaConMovil", () => {
  let local;
  beforeEach(() => {
    local = vi.spyOn(firma, "direccionLocal").mockReturnValue(false);
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });
  afterEach(() => {
    vi.useRealTimers();
    local.mockRestore();
  });

  const avanzar = (ms) => act(() => vi.advanceTimersByTimeAsync(ms));

  test("on localhost it explains that the phone cannot open the page and asks nothing", async () => {
    local.mockReturnValue(true);
    const { llamadas } = simularApi({});
    render(<FirmaConMovil onListo={() => {}} />);
    expect(screen.getByText(/una dirección que solo existe en este ordenador/)).toBeInTheDocument();
    expect(llamadas).toHaveLength(0);
  });

  test("shows the QR and a countdown, then the drawing that arrives; accepting returns it as MOVIL", async () => {
    let estado = { estado: "ABIERTA", segundos: 590 };
    const { llamadas } = simularApi({
      "POST /firmas/sesiones": SESION,
      "GET /firmas/sesiones/9": () => estado,
      "DELETE /firmas/sesiones/9": {},
    });
    const onListo = vi.fn();
    const { unmount } = render(<FirmaConMovil onListo={onListo} textoAceptar="Guardar firma" />);
    await avanzar(0);
    expect(screen.getByAltText("Código QR para firmar con el móvil")).toHaveAttribute("src", "data:image/png;base64,QR");
    expect(screen.getByRole("status")).toHaveTextContent("el código caduca en 10:00");
    await avanzar(1000);
    expect(screen.getByRole("status")).toHaveTextContent("9:59");
    await avanzar(1000);
    expect(llamadas.find((l) => l.path === "/firmas/sesiones/9").headers["X-Firma-Lectura"]).toBe("lec");
    // The server's 590 s replaces the local countdown (the 1 s tick may land on the same instant).
    expect(screen.getByRole("status").textContent).toMatch(/9:(50|49)$/);

    estado = { estado: "RECIBIDA", imagen: PNG };
    await avanzar(2000);
    expect(screen.getByText("Firma recibida del móvil")).toBeInTheDocument();
    expect(screen.getByAltText("Firma recibida")).toHaveAttribute("src", PNG);
    fireEvent.click(screen.getByRole("button", { name: "Guardar firma" }));
    expect(onListo).toHaveBeenCalledWith(expect.objectContaining({ origen: "MOVIL", url: PNG }));
    expect(onListo.mock.calls[0][0].blob).toBeInstanceOf(Blob);

    unmount();
    await avanzar(0);
    expect(llamadas.some((l) => l.method === "DELETE" && l.path === "/firmas/sesiones/9")).toBe(true);
  });

  test("the server says the code expired; «Generar otro código» opens a new session", async () => {
    let n = 0;
    const { llamadas } = simularApi({
      "POST /firmas/sesiones": () => ({ ...SESION, id: ++n }),
      "GET /firmas/sesiones/:id": { estado: "CADUCADA" },
      "DELETE /firmas/sesiones/:id": {},
    });
    render(<FirmaConMovil onListo={() => {}} />);
    await avanzar(0);
    await avanzar(2000);
    expect(screen.getByText("El código ha caducado.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Generar otro código/ }));
    await avanzar(0);
    expect(llamadas.filter((l) => l.method === "POST")).toHaveLength(2);
    expect(screen.getByAltText("Código QR para firmar con el móvil")).toBeInTheDocument();
  });

  test("a 404 while waiting means expired; a network blip keeps waiting", async () => {
    let respuesta = { status: 500, body: {} };
    simularApi({
      "POST /firmas/sesiones": SESION,
      "GET /firmas/sesiones/9": () => respuesta,
      "DELETE /firmas/sesiones/9": {},
    });
    render(<FirmaConMovil onListo={() => {}} />);
    await avanzar(0);
    await avanzar(2000);
    expect(screen.getByRole("status")).toHaveTextContent("Esperando al móvil");
    respuesta = { status: 404, body: {} };
    await avanzar(2000);
    expect(screen.getByText("El código ha caducado.")).toBeInTheDocument();
  });

  test("too many codes requested: the error is shown with a retry", async () => {
    simularApi({ "POST /firmas/sesiones": { status: 429, body: { error: "Has pedido demasiados códigos. Inténtalo más tarde." } } });
    render(<FirmaConMovil onListo={() => {}} />);
    await avanzar(0);
    expect(screen.getByText("No se pudo generar el código.")).toBeInTheDocument();
    expect(screen.getByText("Has pedido demasiados códigos. Inténtalo más tarde.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generar otro código/ })).toBeInTheDocument();
  });

  test("«Repetir» discards the received drawing and asks for a new code; busy disables both", async () => {
    let n = 0;
    const { llamadas } = simularApi({
      "POST /firmas/sesiones": () => ({ ...SESION, id: ++n }),
      "GET /firmas/sesiones/:id": { estado: "RECIBIDA", imagen: PNG },
      "DELETE /firmas/sesiones/:id": {},
    });
    const { rerender } = render(<FirmaConMovil onListo={() => {}} />);
    await avanzar(0);
    await avanzar(2000);
    rerender(<FirmaConMovil onListo={() => {}} ocupado />);
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Repetir/ })).toBeDisabled();
    rerender(<FirmaConMovil onListo={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Repetir/ }));
    await avanzar(0);
    expect(llamadas.filter((l) => l.method === "POST")).toHaveLength(2);
    expect(llamadas.some((l) => l.method === "DELETE" && l.path === "/firmas/sesiones/1")).toBe(true);
  });
});

describe("FirmaPad without canvas support", () => {
  test("stays usable: hint shown, undo and clear disabled, nothing to return", async () => {
    const ref = { current: null };
    render(<FirmaPad ref={ref} />);
    expect(screen.getByText("Firma aquí con el dedo, un lápiz o el ratón")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deshacer/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Borrar/ })).toBeDisabled();
    expect(screen.getByRole("img", { name: "Zona para dibujar la firma" })).toBeInTheDocument();
    expect(await ref.current.obtener()).toBeNull();
  });
});

describe("utils/firma", () => {
  beforeEach(() => iniciarSesion({ id: 4, rol: "ALUMNO" }));

  test("dataUrlToBlob keeps the type and bytes", async () => {
    const blob = firma.dataUrlToBlob("data:image/jpeg;base64,AAEC");
    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBe(3);
    expect(firma.dataUrlToBlob("x,AAEC").type).toBe("image/png");
  });

  test("direccionLocal recognises the loopback names only", () => {
    expect(firma.direccionLocal("localhost")).toBe(true);
    expect(firma.direccionLocal("127.0.0.1")).toBe(true);
    expect(firma.direccionLocal("[::1]")).toBe(true);
    expect(firma.direccionLocal("192.168.1.20")).toBe(false);
    expect(firma.direccionLocal("dual.centro.test")).toBe(false);
  });

  test("fechaFirma: empty and invalid dates give an empty string", () => {
    expect(firma.fechaFirma(null)).toBe("");
    expect(firma.fechaFirma("no es fecha")).toBe("");
    expect(firma.fechaFirma("2026-11-15T10:00:00Z")).toMatch(/2026/);
  });

  test("guardarFirma: own and guardian signatures go to /firmas/mia, the centre's to /firmas/centro, with the session token", async () => {
    const { llamadas } = simularApi({ "PUT /firmas/mia": { ok: 1 }, "PUT /firmas/centro": { ok: 1 } });
    const blob = new Blob(["x"], { type: "image/png" });
    await firma.guardarFirma({ blob });
    await firma.guardarFirma({ blob, titular: "TUTOR", origen: "MOVIL" });
    await firma.guardarFirma({ blob, titular: "CENTRO", origen: "FICHERO" });
    expect(llamadas.map((l) => l.path)).toEqual(["/firmas/mia", "/firmas/mia", "/firmas/centro"]);
    expect(llamadas[0].headers.Authorization).toBe("Bearer t");
    expect(llamadas[1].body.get("titular")).toBe("TUTOR");
    expect(llamadas[1].body.get("origen")).toBe("MOVIL");
  });

  test("the phone's upload carries its own token, not the session", async () => {
    const { llamadas } = simularApi({ "POST /firmas/sesiones/movil": {} });
    await firma.enviarFirmaMovil("secreto", new Blob(["x"]));
    expect(llamadas[0].headers["X-Firma-Token"]).toBe("secreto");
    expect(llamadas[0].headers.Authorization).toBeUndefined();
  });

  test("eliminarFirma names the holder; refusals and network errors become API errors", async () => {
    const { llamadas } = simularApi({ "DELETE /firmas/mia": { status: 409, body: { error: "La firma está en uso." } } });
    await expect(firma.eliminarFirma("TUTOR")).rejects.toMatchObject({ status: 409, message: "La firma está en uso." });
    expect(llamadas[0].url).toBe("/firmas/mia?titular=TUTOR");
    global.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await expect(firma.eliminarFirma()).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/No se pudo conectar/) });
  });

  test("a non-JSON error body still gives an error with the status", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 413, json: async () => { throw new Error("html"); } }));
    await expect(firma.guardarFirma({ blob: new Blob(["x"]) })).rejects.toMatchObject({ status: 413 });
  });
});
