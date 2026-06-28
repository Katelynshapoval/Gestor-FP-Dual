const PageHeader = ({ kicker, title, subtitle, meta, actions, className = "" }) => (
  <div className={`mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`}>
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
