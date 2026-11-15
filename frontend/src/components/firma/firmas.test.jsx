// Signatures in the browser (docs/PLAN_FIRMAS.md): the "Firmar documentos"
// dialog (sign all, leave one out, what is asked before the first signature),
// "Mi firma", the centre's image, and the page a phone opens from the QR.
// jsdom has no canvas: drawing itself is checked in a real browser; here the
// pad only has to stay out of the way.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { FirmarTodoBoton } from "./FirmarDocumentos.jsx";
import MiFirma from "../../pages/MiFirma.jsx";
import FirmaMovil from "../../pages/FirmaMovil.jsx";
import FirmaCentro from "../../pages/Configuracion/FirmaCentro.jsx";
import { direccionLocal, dataUrlToBlob } from "../../utils/firma.js";
import { FIRMA_PRUEBA, iniciarSesion, porFirmar, renderPagina, rutasDeFirma, simularApi } from "../../testUtils";

const TRES = [
  porFirmar({ id_documento: 5, alumno: "Ana Ruiz" }),
  porFirmar({ id_documento: 6, alumno: "Leo Gil" }),
  porFirmar({ id_documento: 7, clave: "CALENDARIO", nombre: "Calendario", alumno: "Eva Sanz" }),
];
const confirmar = async (texto) =>
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Confirmar firma" })).getByRole("button", { name: texto }));

describe("firmar documentos", () => {
  beforeEach(() => iniciarSesion({ id: 4, rol: "ALUMNO" }));

  test("the button counts what is pending and hides when there is nothing", async () => {
    simularApi(rutasDeFirma(TRES));
    const { unmount } = renderPagina(<FirmarTodoBoton />);
    expect(await screen.findByRole("button", { name: "Firmar 3 documentos" })).toBeInTheDocument();
    unmount();
    simularApi(rutasDeFirma([]));
    renderPagina(<FirmarTodoBoton />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Firmar/ })).toBeNull();
  });

  test("arrows move between documents; one can be left out; one confirmation signs the rest", async () => {
    const onDone = vi.fn();
    const { llamadas } = simularApi({
      ...rutasDeFirma(TRES),
      "POST /documentos/firmar-lote": { firmados: 2, fallidos: 0, message: "2 documentos firmados.", resultados: [] },
    });
    renderPagina(<FirmarTodoBoton onDone={onDone} />);
    fireEvent.click(await screen.findByRole("button", { name: "Firmar 3 documentos" }));
    const dialogo = await screen.findByRole("dialog", { name: "Firmar documentos" });
    expect(await within(dialogo).findByText("Documento 1 de 3")).toBeInTheDocument();
    expect(within(dialogo).getByText("Ana Ruiz · ACME S.L.")).toBeInTheDocument();
    expect(within(dialogo).getByRole("img", { name: "Tu firma" })).toHaveAttribute("src", FIRMA_PRUEBA.imagen);
    expect(within(dialogo).getByRole("button", { name: "Documento anterior" })).toBeDisabled();

    fireEvent.click(within(dialogo).getByRole("button", { name: "Documento siguiente" }));
    expect(within(dialogo).getByText("Documento 2 de 3")).toBeInTheDocument();
    expect(within(dialogo).getByText("Leo Gil · ACME S.L.")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(within(dialogo).getByText("Documento 3 de 3")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    // Leo's is left for later.
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: /Firmar este documento/ }));
    expect(within(dialogo).getByText("1 sin marcar se quedan pendientes.")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Firmar los 2 documentos" }));
    await confirmar("Firmar 2");
    expect(await screen.findByText("2 documentos firmados.")).toBeInTheDocument();
    expect(llamadas.find((l) => l.path === "/documentos/firmar-lote").body).toEqual({ ids: [5, 7] });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("with several types, a chip narrows what is shown and signed", async () => {
    const { llamadas } = simularApi({
      ...rutasDeFirma(TRES),
      "POST /documentos/firmar-lote": { firmados: 1, fallidos: 0, message: "Documento firmado.", resultados: [] },
    });
    renderPagina(<FirmarTodoBoton />);
    fireEvent.click(await screen.findByRole("button", { name: "Firmar 3 documentos" }));
    const dialogo = await screen.findByRole("dialog", { name: "Firmar documentos" });
    fireEvent.click(await within(dialogo).findByRole("button", { name: /^Calendario 1$/ }));
    expect(within(dialogo).getByText("Eva Sanz · ACME S.L.")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Firmar el documento" }));
    await confirmar("Firmar");
    await waitFor(() => expect(llamadas.find((l) => l.path === "/documentos/firmar-lote")?.body).toEqual({ ids: [7] }));
  });

  test("a document that could not be signed is listed with the server's reason", async () => {
    simularApi({
      ...rutasDeFirma(TRES.slice(0, 2)),
      "POST /documentos/firmar-lote": {
        firmados: 1, fallidos: 1, message: "1 de 2 documentos firmados.",
        resultados: [{ id_documento: 5, ok: true }, { id_documento: 6, ok: false, message: "El documento fue rechazado: hay que sustituirlo antes de firmar." }],
      },
    });
    renderPagina(<FirmarTodoBoton />);
    fireEvent.click(await screen.findByRole("button", { name: "Firmar 2 documentos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Firmar los 2 documentos" }));
    await confirmar("Firmar 2");
    expect(await screen.findByText(/hay que sustituirlo antes de firmar/)).toBeInTheDocument();
    expect(screen.getByText(/Uno no se ha podido firmar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("the first time, the signature is asked for before anything is shown to sign", async () => {
    simularApi(rutasDeFirma(TRES, { titular: "USUARIO", firma: null, puede_cambiar: true, requiere_tutor: false }));
    renderPagina(<FirmarTodoBoton />);
    fireEvent.click(await screen.findByRole("button", { name: "Firmar 3 documentos" }));
    expect(await screen.findByText("Antes de firmar, crea tu firma")).toBeInTheDocument();
    expect(screen.getByText(/firmas los 3 documentos con un clic/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Dibujar aquí" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Con el móvil" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Firmar los/ })).toBeNull();
  });

  test("an under-18 student is also asked for the guardian's signature", async () => {
    simularApi(rutasDeFirma(TRES, { titular: "USUARIO", firma: FIRMA_PRUEBA, requiere_tutor: true, tutor_nombre: "Marta Gil", firma_tutor: null }));
    renderPagina(<FirmarTodoBoton />);
    fireEvent.click(await screen.findByRole("button", { name: "Firmar 3 documentos" }));
    expect(await screen.findByText("Ahora, la firma de tu tutor o tutora legal")).toBeInTheDocument();
    expect(screen.getByText(/Marta Gil firma contigo/)).toBeInTheDocument();
  });

  test("staff without the centre's image: an administrator is sent to upload it, a coordinator to ask", async () => {
    iniciarSesion({ id: 2, rol: "COORDINADOR" });
    simularApi(rutasDeFirma(TRES, { titular: "CENTRO", firma: null, puede_cambiar: false }));
    const { unmount } = renderPagina(<FirmarTodoBoton />);
    fireEvent.click(await screen.findByRole("button", { name: "Firmar 3 documentos" }));
    expect(await screen.findByText(/Pide a un administrador que la suba/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Subir la firma del centro" })).toBeNull();
    unmount();

    iniciarSesion({ id: 1, rol: "ADMINISTRADOR" });
    simularApi(rutasDeFirma(TRES, { titular: "CENTRO", firma: null, puede_cambiar: true }));
    renderPagina(<FirmarTodoBoton />, { ruta: "/documentos", patron: "/documentos" });
    fireEvent.click(await screen.findByRole("button", { name: "Firmar 3 documentos" }));
    fireEvent.click(await screen.findByRole("link", { name: "Subir la firma del centro" }));
    expect(screen.getByTestId("ruta")).toHaveTextContent("/configuracion/firma");
  });

  test("a failed load can be retried", async () => {
    let fallos = 1;
    simularApi({
      ...rutasDeFirma(TRES),
      "GET /firmas/mia": () => (fallos-- > 0 ? { status: 500, body: { error: "Caída" } } : { titular: "USUARIO", firma: FIRMA_PRUEBA }),
    });
    renderPagina(<FirmarTodoBoton />);
    fireEvent.click(await screen.findByRole("button", { name: "Firmar 3 documentos" }));
    expect(await screen.findByText("No se pudieron cargar los documentos.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Documento 1 de 3")).toBeInTheDocument();
  });
});

describe("mi firma", () => {
  beforeEach(() => iniciarSesion({ id: 4, rol: "ALUMNO" }));

  test("shows the saved signature; deleting asks first and leaves the empty state", async () => {
    const { llamadas } = simularApi({
      ...rutasDeFirma([]),
      "DELETE /firmas/mia": { titular: "USUARIO", firma: null, requiere_tutor: false },
    });
    renderPagina(<MiFirma />);
    expect(await screen.findByRole("img", { name: "Tu firma" })).toHaveAttribute("src", FIRMA_PRUEBA.imagen);
    expect(screen.getByText(/Guardada el 15 de noviembre de 2026, dibujada en pantalla/)).toBeInTheDocument();
    expect(screen.queryByText(/tutor o tutora legal/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Eliminar mi firma" })).getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByText("Firma eliminada.")).toBeInTheDocument();
    expect(llamadas.find((l) => l.method === "DELETE").url).toBe("/firmas/mia?titular=USUARIO");
    expect(screen.getByRole("button", { name: "Crear firma" })).toBeInTheDocument();
  });

  test("an under-18 student sees the guardian's signature next to their own", async () => {
    simularApi(rutasDeFirma([], { titular: "USUARIO", firma: FIRMA_PRUEBA, requiere_tutor: true, tutor_nombre: "Marta Gil", firma_tutor: null }));
    renderPagina(<MiFirma />);
    expect(await screen.findByText(/Falta la firma de Marta Gil/)).toBeInTheDocument();
    expect(screen.getByText(/Hasta que cumplas 18 años/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crear firma" }));
    expect(await screen.findByRole("dialog", { name: "Firma del tutor o tutora legal" })).toBeInTheDocument();
  });

  test("a failed load can be retried", async () => {
    let fallos = 1;
    simularApi({ ...rutasDeFirma([]), "GET /firmas/mia": () => (fallos-- > 0 ? { status: 500, body: { error: "Caída" } } : { titular: "USUARIO", firma: null }) });
    renderPagina(<MiFirma />);
    expect(await screen.findByText("No se pudo cargar tu firma.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: "Crear firma" })).toBeInTheDocument();
  });
});

describe("firma del centro", () => {
  beforeEach(() => iniciarSesion({ id: 1, rol: "ADMINISTRADOR" }));

  test("says when there is none, shows the current one, and only takes PNG or JPG", async () => {
    simularApi(rutasDeFirma([], { titular: "CENTRO", firma: null, puede_cambiar: true }));
    const { unmount } = renderPagina(<FirmaCentro />);
    expect(await screen.findByText(/Todavía no hay firma del centro/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar firma del centro" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Imagen de la firma del centro"), { target: { files: [new File(["x"], "firma.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText("Usa una imagen PNG o JPG.")).toBeInTheDocument();
    unmount();

    simularApi(rutasDeFirma([], { titular: "CENTRO", firma: FIRMA_PRUEBA, puede_cambiar: true }));
    renderPagina(<FirmaCentro />);
    expect(await screen.findByRole("img", { name: "Firma y sello del centro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sustituir firma del centro" })).toBeDisabled();
  });
});

describe("firma con el móvil", () => {
  const abrir = (hash) => {
    window.history.replaceState(null, "", `/firma-movil${hash}`);
    return renderPagina(<FirmaMovil />);
  };

  test("without a code, or with one that is used or expired, it says what to do", async () => {
    iniciarSesion(null);
    simularApi();
    let vista = abrir("");
    expect(screen.getByRole("heading", { name: "Falta el código" })).toBeInTheDocument();
    vista.unmount();

    for (const [estado, titulo] of [["CADUCADA", "El código ha caducado"], ["RECIBIDA", "Esta firma ya se envió"], ["CERRADA", "Este código ya no sirve"]]) {
      const { llamadas } = simularApi({ "GET /firmas/sesiones/movil": { estado } });
      vista = abrir("#secreto");
      expect(await screen.findByRole("heading", { name: titulo })).toBeInTheDocument();
      expect(llamadas[0].headers["X-Firma-Token"]).toBe("secreto");
      expect(llamadas[0].headers.Authorization).toBeUndefined();
      expect(window.location.hash).toBe("", "the secret leaves the address bar");
      vista.unmount();
    }
  });

  test("an open code shows the pad; nothing can be sent before drawing", async () => {
    iniciarSesion(null);
    simularApi({ "GET /firmas/sesiones/movil": { estado: "ABIERTA" } });
    abrir("#secreto");
    expect(await screen.findByRole("heading", { name: "Dibuja tu firma" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Zona para dibujar la firma" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar firma" })).toBeDisabled();
  });
});

test("helpers: localhost is not reachable from a phone; a data URL becomes a file", () => {
  expect(["localhost", "127.0.0.1", "[::1]"].map(direccionLocal)).toEqual([true, true, true]);
  expect(["192.168.1.20", "fpdual.ejemplo.es"].map(direccionLocal)).toEqual([false, false]);
  const blob = dataUrlToBlob("data:image/png;base64,AAAA");
  expect([blob.type, blob.size]).toEqual(["image/png", 3]);
});
