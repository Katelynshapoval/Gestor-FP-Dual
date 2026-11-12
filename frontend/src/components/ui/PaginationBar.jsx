import { useEffect } from "react";

const PAGE_SIZES = [10, 20, 50];
const SELECT_CLASS =
  "h-10 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-charcoal-900 outline-none transition-colors duration-150 focus:outline-none focus-visible:border-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/20";

export function visiblePages(current, total) {
  if (total <= 1) return total === 1 ? [1] : [];
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 3) return [1, 2, 3, 4, "…", total];
  if (current >= total - 2) return [1, "…", total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

export function paginate(items, page, pageSize) {
  const totalItems = items.length;
  const size = PAGE_SIZES.includes(pageSize) ? pageSize : 10;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / size);
  const safePage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * size;
  return {
    pageItems: items.slice(start, start + size),
    pagination: { page: safePage, pageSize: size, totalItems, totalPages },
  };
}

function itemNoun(noun, count) {
  if (count === 1) return noun;
  if (noun === "alumno") return "alumnos";
  if (noun === "empresa") return "empresas";
  return `${noun}s`;
}

const PaginationBar = ({ pagination, page, disabled = false, onPage, onPageSize, noun = "documento" }) => {
  if (!pagination || pagination.totalItems === 0) return null;
  const total = pagination.totalItems;
  const from = (page - 1) * pagination.pageSize + 1;
  const to = Math.min(page * pagination.pageSize, total);
  const pages = visiblePages(page, pagination.totalPages);

  // Phones: "Mostrando…" and the page size share the first row, the page
  // buttons get a full-width row with prev/next at the ends. From lg up it is
  // one row: count, pages, page size.
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl2 border border-surface-200 bg-white px-4 py-3 shadow-card">
      <p className="text-sm text-muted">
        <span className="hidden sm:inline">Mostrando </span>
        {from}–{to} de {total} {itemNoun(noun, total)}
      </p>
      <nav
        className="order-last flex w-full items-center justify-between gap-1 lg:order-none lg:w-auto lg:justify-start"
        aria-label="Paginación"
      >
        <button
          type="button"
          className="btn btn-secondary btn-sm h-10 min-w-10 px-3 sm:h-auto"
          disabled={disabled || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <span aria-hidden="true" className="text-base leading-none">‹</span>
          <span className="sr-only sm:not-sr-only sm:ml-1">Anterior</span>
        </button>
        <div className="flex items-center gap-1">
          {pages.map((entry, index) =>
            entry === "…" ? (
              <span key={`ellipsis-${index}`} className="px-1 text-sm text-muted">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                disabled={disabled}
                aria-current={entry === page ? "page" : undefined}
                className={`min-h-10 min-w-10 rounded-lg border px-2 text-sm font-semibold transition-colors duration-150 sm:min-h-8 sm:min-w-8 ${
                  entry === page
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-surface-200 bg-white text-charcoal-800 hover:border-charcoal-300"
                }`}
                onClick={() => onPage(entry)}
              >
                {entry}
              </button>
            ),
          )}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm h-10 min-w-10 px-3 sm:h-auto"
          disabled={disabled || page >= pagination.totalPages}
          onClick={() => onPage(page + 1)}
        >
          <span className="sr-only sm:not-sr-only sm:mr-1">Siguiente</span>
          <span aria-hidden="true" className="text-base leading-none">›</span>
        </button>
      </nav>
      <label className="flex items-center gap-2 text-sm text-muted">
        <span className="sm:hidden">Por página</span>
        <span className="hidden sm:inline">Filas por página</span>
        <select
          className={SELECT_CLASS}
          value={pagination.pageSize}
          disabled={disabled}
          aria-label="Filas por página"
          onChange={(event) => onPageSize(Number(event.target.value))}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

export function usePageClamp(page, safePage, setPage) {
  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page, setPage]);
}

export default PaginationBar;
