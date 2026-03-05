// UTILIDADES para peticiones HTTP.
// Centraliza la construcción de opciones fetch y simplifica
// las llamadas GET y POST desde cualquier parte de la app.

export const buildPostOptions = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const postJSON = async (url, body) => {
  const response = await fetch(url, buildPostOptions(body));
  if (!response.ok) throw new Error(`Error en ${url}: ${response.status}`);
  return response.json();
};

export const postForm = async (url, formData) => {
  const response = await fetch(url, { method: 'POST', body: formData });
  if (!response.ok) throw new Error(`Error en ${url}: ${response.status}`);
  return response.json();
};
