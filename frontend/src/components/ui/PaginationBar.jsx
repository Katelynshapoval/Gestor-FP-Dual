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

  return (
    <div className="flex flex-col gap-3 rounded-xl2 border border-surface-200 bg-white px-4 py-3 shadow-card lg:flex-row lg:items-center lg:justify-between">
      <p className="text-sm text-muted">
        Mostrando {from}–{to} de {total} {itemNoun(noun, total)}
      </p>
      <nav className="flex flex-wrap items-center gap-1" aria-label="Paginación">
        <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
          ‹ Anterior
        </button>
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
              className={`min-h-8 min-w-8 rounded-lg border px-2 text-sm font-semibold transition-colors duration-150 ${
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
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={disabled || page >= pagination.totalPages}
          onClick={() => onPage(page + 1)}
        >
          Siguiente ›
        </button>
      </nav>
      <label className="flex items-center gap-2 text-sm text-muted">
        Filas por página
        <select
          className={SELECT_CLASS}
          value={pagination.pageSize}
          disabled={disabled}
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
