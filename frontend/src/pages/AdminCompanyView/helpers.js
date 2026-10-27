// Simple label + value row used in company detail cards
export const InfoRow = ({ label, value, mono = false }) => {
  return (
    <p className="text-sm">
      <span className="font-bold">{label}: </span>
      <span className={mono ? "font-mono text-xs bg-surface-100 px-1 py-0.5 rounded" : ""}>
        {value || "—"}
      </span>
    </p>
  );
};

// Formats a date for Spanish locale display (shared helper, PM-7)
export { formatFecha as formatDate } from "../../utils/fechas.js";
