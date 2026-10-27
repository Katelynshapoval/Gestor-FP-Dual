// Accent- and case-insensitive search used by every list ("garcia" finds
// "García", "x1234567l" finds "X1234567L").
export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// True when every word of the query appears in at least one of the fields.
export function coincide(query, campos) {
  const palabras = normalizar(query).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const texto = campos.map(normalizar).join(" ");
  return palabras.every((p) => texto.includes(p));
}
