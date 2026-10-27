// One label/value row; rows stacked inside a <dl> line up in two columns.
export const InfoRow = ({ label, value, mono = false }) => (
  <div className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-x-3 py-1.5 text-sm">
    <dt className="text-muted">{label}</dt>
    <dd className={`m-0 break-words text-charcoal-900 ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</dd>
  </div>
);

// Formats a date for Spanish locale display (shared helper, PM-7)
export { formatFecha as formatDate } from "../../utils/fechas.js";
