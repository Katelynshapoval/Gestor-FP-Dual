// An empty or error state in place of a list (e.g. "No hay resultados",
// "No se pudieron cargar…" with «Reintentar»). `plano` drops the card frame
// when the state already sits inside a panel or a card.
export default function StateCard({ children, role, plano = false, className = "" }) {
  return (
    <div
      role={role}
      className={`text-center ${
        plano ? "py-10 text-sm text-muted" : "rounded-lg border border-surface-200 bg-white px-6 py-12 shadow-card"
      } ${className}`}
    >
      {children}
    </div>
  );
}
