// Authenticated HTTP utilities. All functions read the JWT from localStorage
// and attach it as a Bearer token so the backend can verify the session.

function getToken() {
  try {
    const saved = localStorage.getItem("user");
    if (!saved) return null;
    const { data, expires } = JSON.parse(saved);
    if (expires > Date.now()) return data?.token ?? null;
  } catch {}
  return null;
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

function messageFromBody(body, url, status) {
  const raw = body?.error || body?.message;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return `Error en ${url}: ${status}`;
}

function throwApiError(url, status, body) {
  const payload = body && typeof body === "object" ? body : {};
  const err = new Error(messageFromBody(payload, url, status));
  err.status = status;
  err.body = payload;
  err.url = url;
  throw err;
}

async function requestJSON(url, options) {
  const response = await fetch(url, options);
  const body = await readResponseBody(response);
  if (!response.ok) throwApiError(url, response.status, body);
  return body;
}

// Authenticated GET that returns parsed JSON
export const getJSON = (url) => requestJSON(url, { headers: authHeaders() });

// Authenticated GET that returns a Blob (used for PDF downloads)
export const getBlob = async (url) => {
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) {
    const body = await readResponseBody(response);
    throwApiError(url, response.status, body);
  }
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

// Builds fetch options for callers that construct their own request manually
export const buildPostOptions = (body) => ({
  method: "POST",
  headers: authHeaders({ "Content-Type": "application/json" }),
  body: JSON.stringify(body),
});
