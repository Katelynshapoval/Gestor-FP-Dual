export function parseEspecialidades(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const ids = parsed[0] || [];
    const amounts = parsed[1] || [];
    return ids.map((id, i) => ({
      idEspecialidad: id,
      cantidad: amounts[i] ?? 0,
    }));
  } catch {
    return [];
  }
}

export const InfoRow = ({ label, value, mono = false }) => (
  <p className="contact-item text-sm">
    <span>{label}: </span>
    <span
      className={
        mono ? "font-mono text-xs bg-gray-100 px-1 py-0.5 rounded" : ""
      }
    >
      {value || "—"}
    </span>
  </p>
);

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
