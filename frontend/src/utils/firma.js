// Signature images in the browser (docs/PLAN_FIRMAS.md). Everything the server
// stores is a PNG with a transparent background, cut to the ink.
import { getJSON, publicJSON, apiError, readStoredSession } from "./api.js";

export const TINTA = "#1b2a5c"; // dark blue, like a pen: it stands out from printed text
const MAX_ANCHO = 1000;

export function dataUrlToBlob(dataUrl) {
  const [cabecera, datos] = String(dataUrl).split(",");
  const mime = /data:([^;]+)/.exec(cabecera)?.[1] || "image/png";
  const bytes = atob(datos);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}

const canvasBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

// Rectangle that holds every pixel with ink, or null when there is none.
function cajaDeTinta(ctx, ancho, alto) {
  const { data } = ctx.getImageData(0, 0, ancho, alto);
  let x0 = ancho;
  let y0 = alto;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      if (data[(y * ancho + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Cuts a canvas to its ink (with a small margin) and limits its width.
// → { blob, ancho, alto } or null when the drawing is empty or a mere dot.
export async function recortarFirma(canvas, { minimo = [60, 20] } = {}) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const caja = cajaDeTinta(ctx, canvas.width, canvas.height);
  if (!caja) return null;
  const margen = Math.round(Math.max(caja.w, caja.h) * 0.04) + 4;
  const x = Math.max(0, caja.x - margen);
  const y = Math.max(0, caja.y - margen);
  const w = Math.min(canvas.width - x, caja.w + margen * 2);
  const h = Math.min(canvas.height - y, caja.h + margen * 2);
  const escala = Math.min(1, MAX_ANCHO / w);
  const salida = document.createElement("canvas");
  salida.width = Math.max(1, Math.round(w * escala));
  salida.height = Math.max(1, Math.round(h * escala));
  if (salida.width < minimo[0] || salida.height < minimo[1]) return null;
  const out = salida.getContext("2d");
  out.imageSmoothingQuality = "high";
  out.drawImage(canvas, x, y, w, h, 0, 0, salida.width, salida.height);
  return { blob: await canvasBlob(salida), ancho: salida.width, alto: salida.height };
}

// The centre's image (signature and seal) from a PNG or JPG file: limited in
// size and, when asked, with the white paper made transparent so the document
// shows through, as a real stamp would.
export async function prepararImagenCentro(file, { quitarFondo = true } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se puede leer la imagen. Usa un archivo PNG o JPG."));
      el.src = url;
    });
    const escala = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (quitarFondo) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = pixels.data;
      for (let i = 0; i < d.length; i += 4) {
        // Near-white becomes transparent; the edge of the ink fades instead of
        // keeping a white halo.
        const claro = Math.min(d[i], d[i + 1], d[i + 2]);
        if (claro > 235) d[i + 3] = 0;
        else if (claro > 200) d[i + 3] = Math.round(d[i + 3] * ((235 - claro) / 35));
      }
      ctx.putImageData(pixels, 0, 0);
    }
    const recorte = await recortarFirma(canvas, { minimo: [60, 20] });
    if (!recorte) throw new Error("La imagen está en blanco.");
    return recorte;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── API ─────────────────────────────────────────────────────────────────────

export const cargarMiFirma = () => getJSON("/firmas/mia");

async function enviar(url, { method, form, headers = {} }) {
  const token = readStoredSession()?.data?.token;
  let response;
  try {
    response = await fetch(url, {
      method,
      body: form,
      headers: { ...(token && !headers["X-Firma-Token"] ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    });
  } catch {
    throw apiError({ url, status: 0, body: { code: "NETWORK" }, message: "No se pudo conectar con el servidor. Comprueba la conexión e inténtalo de nuevo." });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError({ url, status: response.status, body });
  return body;
}

// titular: "USUARIO" (own) | "TUTOR" (legal guardian) | "CENTRO"
export function guardarFirma({ blob, origen = "PANTALLA", titular = "USUARIO" }) {
  const form = new FormData();
  form.append("imagen", blob, "firma.png");
  form.append("origen", origen);
  form.append("titular", titular);
  return enviar(titular === "CENTRO" ? "/firmas/centro" : "/firmas/mia", { method: "PUT", form });
}

export const eliminarFirma = (titular = "USUARIO") =>
  enviar(`/firmas/mia?titular=${titular}`, { method: "DELETE" });

// Phone hand-off: the computer's side…
export const crearSesionMovil = () => publicJSON("/firmas/sesiones", { method: "POST" });
export const leerSesionMovil = (sesion) =>
  publicJSON(`/firmas/sesiones/${sesion.id}`, { headers: { "X-Firma-Lectura": sesion.lectura } });
export const cerrarSesionMovil = (sesion) =>
  publicJSON(`/firmas/sesiones/${sesion.id}`, { method: "DELETE", headers: { "X-Firma-Lectura": sesion.lectura } }).catch(() => null);

// …and the phone's.
export const estadoSesionMovil = (token) => publicJSON("/firmas/sesiones/movil", { headers: { "X-Firma-Token": token } });
export function enviarFirmaMovil(token, blob) {
  const form = new FormData();
  form.append("imagen", blob, "firma.png");
  return enviar("/firmas/sesiones/movil", { method: "POST", form, headers: { "X-Firma-Token": token } });
}

// A phone cannot open http://localhost of this computer.
export function direccionLocal(hostname = window.location.hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export const fechaFirma = (valor) => {
  if (!valor) return "";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
};
