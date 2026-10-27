// Authenticated HTTP utilities. All functions read the JWT from localStorage
// and attach it as a Bearer token so the backend can verify the session.
//
// Errors (WF-16, WF-17): every failure throws an Error with
//   err.status  HTTP status (0 when the server could not be reached)
//   err.code    the backend's stable `code` when it sends one, otherwise a
//               generic one: NETWORK, UNAUTHORIZED, FORBIDDEN, NOT_FOUND,
//               CONFLICT, VALIDATION, SERVER
//   err.body    the parsed response body
// Callers decide by status/code, never by parsing the message.
//
// A 401 on a request that carried a session token means the session is no
// longer valid: the app is told once (SESSION_EXPIRED_EVENT) and UserContext
// clears the session and sends the user to the login page.

export const SESSION_EXPIRED_EVENT = "fpdual:session-expired";

const STORAGE_KEY = "user";

export function readStoredSession() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed?.data?.token || !(parsed.expires > Date.now())) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getToken() {
  return readStoredSession()?.data?.token ?? null;
}

function authHeaders(extra = {}) {
  const token = getToken();
  const headers = { ...extra };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
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

function notifyUnauthorized(url, sentToken, body) {
  if (!sentToken || AUTH_FORM_URLS.some((u) => url.startsWith(u))) return;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { code: body?.code || "UNAUTHORIZED", message: body?.error } }));
}

async function send(url, options = {}) {
  const sentToken = Boolean(options.headers?.Authorization);
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
    if (response.status === 401) notifyUnauthorized(url, sentToken, body);
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

// Public (no token) JSON request with the same error handling.
export const publicJSON = (url, options = {}) =>
  requestJSON(url, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });

// Expiry of a JWT in ms since epoch, or null when it cannot be read.
export function tokenExpiry(token) {
  try {
    const part = String(token).split(".")[1];
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}
