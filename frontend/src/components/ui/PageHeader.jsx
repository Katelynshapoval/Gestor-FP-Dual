// `espacio`: the gap below the header — "normal" (default), "corto" (tabs
// follow) or "ninguno" (the parent spaces it, e.g. with space-y).
const ESPACIO = { normal: "mb-7", corto: "mb-5", ninguno: "mb-0" };

const PageHeader = ({ kicker, title, subtitle, meta, actions, espacio = "normal", className = "" }) => (
  <div className={`${ESPACIO[espacio] || ESPACIO.normal} flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`}>
    <div className="min-w-0">
      {kicker && <div className="page-kicker">{kicker}</div>}
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-subtitle mb-0">{subtitle}</p>}
      {meta && <div className="mt-3 flex flex-wrap gap-2">{meta}</div>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{actions}</div>}
  </div>
);

export default PageHeader;
