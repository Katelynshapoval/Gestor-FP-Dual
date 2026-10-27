// Date-only display (dd/mm/aaaa). DATE columns arrive as "YYYY-MM-DD" since
// Phase 2 (V-3); DATETIME values arrive as full timestamps. A plain date is
// read at local noon so no time zone can move it to the previous day.
export function formatFecha(value) {
  if (!value) return "—";
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(text);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}
