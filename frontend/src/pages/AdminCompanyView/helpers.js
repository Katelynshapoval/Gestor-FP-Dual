// Simple label + value row used in company detail cards
export const InfoRow = ({ label, value, mono = false }) => {
  return (
    <p className="text-sm">
      <span className="font-bold">{label}: </span>
      <span className={mono ? "font-mono text-xs bg-gray-100 px-1 py-0.5 rounded" : ""}>
        {value || "—"}
      </span>
    </p>
  );
};

// Formats a date string for Spanish locale display
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
