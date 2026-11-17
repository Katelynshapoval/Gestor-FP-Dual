// Authenticated HTTP utilities. The session token lives in an HttpOnly cookie
// set by the backend at login: page scripts never read it, and the browser
// sends it with every same-origin request. localStorage keeps only who is
// logged in and until when (for the menus and the expiry warning), never the
// token. Every request carries CSRF_HEADERS: the backend refuses a write sent
// with the session cookie but without it.
//
// Errors (WF-16, WF-17): every failure throws an Error with
//   err.status  HTTP status (0 when the server could not be reached)
//   err.code    the backend's stable `code` when it sends one, otherwise a
//               generic one: NETWORK, UNAUTHORIZED, FORBIDDEN, NOT_FOUND,
//               CONFLICT, VALIDATION, SERVER
//   err.body    the parsed response body
// Callers decide by status/code, never by parsing the message.
//
// A 401 on a request made during a session means the session is no longer
// valid: the app is told once (SESSION_EXPIRED_EVENT) and UserContext clears
// the session and sends the user to the login page.

export const SESSION_EXPIRED_EVENT = "fpdual:session-expired";

// Must match CSRF_VALUE in backend/src/middleware/auth.js.
export const CSRF_HEADERS = Object.freeze({ "X-Requested-With": "fpdual" });

const STORAGE_KEY = "user";

export function readStoredSession() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed?.data?.rol || !(parsed.expires > Date.now())) return null;
    return parsed;
  } catch {
    return null;
  }
}

function authHeaders(extra = {}) {
  return { ...CSRF_HEADERS, ...extra };
}

// Ends the session on the server too (clears the cookie). Never fails.
export async function closeServerSession() {
  try {
    await fetch("/auth/logout", { method: "POST", headers: { ...CSRF_HEADERS } });
  } catch {
    // Offline: the cookie expires on its own.
  }
}

async function readResponseBody(response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed;
    return { error: String(parsed) };
  } catch {
    return { error: text };
  }
}

const GENERIC_CODE = { 400: "VALIDATION", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT", 429: "TOO_MANY_ATTEMPTS" };

function messageFromBody(body, status) {
  const raw = body?.error || body?.message;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (status === 403) return "No tienes permiso para realizar esta acción.";
  if (status >= 500) return "Error del servidor. Inténtalo de nuevo en unos minutos.";
  return `Error ${status} en la petición.`;
}

export function apiError({ url, status, body = {}, message }) {
  const err = new Error(message || messageFromBody(body, status));
  err.status = status;
  err.code = body.code || GENERIC_CODE[status] || (status >= 500 ? "SERVER" : "ERROR");
  err.body = body;
  err.url = url;
  return err;
}

// Login and password endpoints answer 401 for wrong credentials: that is not an expired session.
const AUTH_FORM_URLS = ["/auth/login", "/auth/changePassword"];

function notifyUnauthorized(url, inSession, body) {
  if (!inSession || AUTH_FORM_URLS.some((u) => url.startsWith(u))) return;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { code: body?.code || "UNAUTHORIZED", message: body?.error } }));
}

async function send(url, options = {}) {
  const inSession = Boolean(readStoredSession());
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw apiError({
      url,
      status: 0,
      body: { code: "NETWORK" },
      message: "No se pudo conectar con el servidor. Comprueba la conexión e inténtalo de nuevo.",
    });
  }
  if (!response.ok) {
    const body = await readResponseBody(response);
    if (response.status === 401) notifyUnauthorized(url, inSession, body);
    throw apiError({ url, status: response.status, body });
  }
  return response;
}

async function requestJSON(url, options) {
  const response = await send(url, options);
  return readResponseBody(response);
}

// Authenticated GET that returns parsed JSON
export const getJSON = (url) => requestJSON(url, { headers: authHeaders() });

// Authenticated GET that returns a Blob (used for PDF downloads)
export const getBlob = async (url) => {
  const response = await send(url, { headers: authHeaders() });
  return response.blob();
};

// Authenticated POST or PUT with a JSON body
export const postJSON = (url, body, method = "POST") =>
  requestJSON(url, {
    method,
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

export const putJSON = (url, body) => postJSON(url, body, "PUT");

export const patchJSON = (url, body) => postJSON(url, body, "PATCH");

// Authenticated POST with FormData (multipart file upload)
export const postForm = (url, formData) =>
  requestJSON(url, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

// Public JSON request (no session needed) with the same error handling.
export const publicJSON = (url, options = {}) =>
  requestJSON(url, {
    ...options,
    headers: { ...CSRF_HEADERS, ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
