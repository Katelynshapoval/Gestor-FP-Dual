// UTILIDADES para peticiones HTTP.
// Todas las funciones autenticadas leen el token JWT del localStorage y lo
// añaden a la cabecera Authorization para que el backend pueda verificar la sesión.

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

// GET autenticado que devuelve JSON
export const getJSON = async (url) => {
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Error en ${url}: ${response.status}`);
  }
  return response.json();
};

// GET autenticado que devuelve un Blob (para PDFs)
export const getBlob = async (url) => {
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) throw new Error(`Error al obtener archivo: ${response.status}`);
  return response.blob();
};

// POST o PUT autenticado con JSON
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

// POST autenticado con FormData (multipart)
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

// Construcción de opciones para fetch manual (mantiene compatibilidad)
export const buildPostOptions = (body) => ({
  method: 'POST',
  headers: authHeaders({ 'Content-Type': 'application/json' }),
  body: JSON.stringify(body),
});
