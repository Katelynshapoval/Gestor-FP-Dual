export function formatDocumentDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Confirmation text for regenerating a document: says who has already signed,
// because those signatures stop counting and they will have to sign again.
export function avisoRegenerar(firmas = []) {
  const firmadas = firmas.filter((f) => f.estado === "FIRMADO").map((f) => f.rol_label || f.rol);
  if (!firmadas.length) return "Se creará una nueva versión del documento.";
  const quien = firmadas.length === 1 ? firmadas[0] : `${firmadas.slice(0, -1).join(", ")} y ${firmadas.at(-1)}`;
  return `Ya ha${firmadas.length === 1 ? "" : "n"} firmado: ${quien}. Se creará una nueva versión y esas firmas dejarán de valer: ${
    firmadas.length === 1 ? "tendrá" : "tendrán"
  } que volver a firmar.`;
}
