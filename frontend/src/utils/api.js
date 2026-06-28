// Authenticated HTTP utilities. All functions read the JWT from localStorage
// and attach it as a Bearer token so the backend can verify the session.

function getToken() {
  try {
    const saved = localStorage.getItem('user');
    if (!saved) return null;
    const { data, expires } = JSON.parse(saved);
    if (expires > Date.now()) return data?.token ?? null;
  } catch {}
  return null;
}

function authHeaders(extra = {}) {
  const token = getToken();
  const headers = { ...extra };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// Authenticated GET that returns parsed JSON
export const getJSON = async (url) => {
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Error en ${url}: ${response.status}`);
  }
  return response.json();
};

// Authenticated GET that returns a Blob (used for PDF downloads)
export const getBlob = async (url) => {
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) throw new Error(`Error al obtener archivo: ${response.status}`);
  return response.blob();
};

// Authenticated POST or PUT with a JSON body
export const postJSON = async (url, body, method = 'POST') => {
  const response = await fetch(url, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const b = await response.json().catch(() => ({}));
    throw new Error(b.error || `Error en ${url}: ${response.status}`);
  }
  return response.json();
};

export const putJSON = (url, body) => postJSON(url, body, 'PUT');

// Authenticated POST with FormData (multipart file upload)
export const postForm = async (url, formData) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!response.ok) {
    const b = await response.json().catch(() => ({}));
    throw new Error(b.error || `Error en ${url}: ${response.status}`);
  }
  return response.json();
};

// Builds fetch options for callers that construct their own request manually
export const buildPostOptions = (body) => ({
  method: 'POST',
  headers: authHeaders({ 'Content-Type': 'application/json' }),
  body: JSON.stringify(body),
});
