// Transforma el JSON de especialidades en un array usable
export function parseEspecialidades(raw) {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);

    const ids = parsed[0] || [];
    const amounts = parsed[1] || [];

    return ids.map((id, index) => ({
      idEspecialidad: id,
      cantidad: amounts[index] ?? 0,
    }));
  } catch {
    return [];
  }
}

// Muestra una fila simple de label + valor
export const InfoRow = ({ label, value, mono = false }) => {
  return (
    <p className="text-sm">
      <span className="font-bold">{label}: </span>

      <span
        className={
          mono ? "font-mono text-xs bg-gray-100 px-1 py-0.5 rounded" : ""
        }
      >
        {value || "—"}
      </span>
    </p>
  );
};

// Formatea fechas al formato español
export function formatDate(dateStr) {
  if (!dateStr) return "—";

  try {
    const date = new Date(dateStr);

    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
