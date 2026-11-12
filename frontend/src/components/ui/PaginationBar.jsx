import { useEffect } from "react";

const PAGE_SIZES = [10, 20, 50];

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

// One compact control. Phones: count and page size on one line, then
// ‹ Página n de N › as a single connected group (no row of numbers to squeeze).
// From lg up (narrower screens, and the content area beside the sidebar, get the compact form): count on the left; on the right the connected pager
// ‹ 1 2 3 … › with the current page softly highlighted, and the page size.
const SEGMENT =
  "inline-flex h-9 min-w-9 items-center justify-center px-2.5 text-sm font-medium text-charcoal-800 outline-none transition-colors duration-150 hover:bg-surface-50 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:cursor-not-allowed disabled:text-charcoal-300 disabled:hover:bg-transparent";

const PaginationBar = ({ pagination, page, disabled = false, onPage, onPageSize, noun = "documento" }) => {
  if (!pagination || pagination.totalItems === 0) return null;
  const total = pagination.totalItems;
  const totalPages = pagination.totalPages;
  const from = (page - 1) * pagination.pageSize + 1;
  const to = Math.min(page * pagination.pageSize, total);
  const pages = visiblePages(page, totalPages);
  const unaPagina = totalPages <= 1;

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-1 py-2 lg:flex lg:justify-end">
      <p className="m-0 text-sm text-muted lg:mr-auto">
        <span className="font-semibold text-charcoal-900">
          {from}–{to}
        </span>{" "}
        de {total} {itemNoun(noun, total)}
      </p>

      <div className="col-span-2 row-start-2 flex items-center lg:col-auto lg:row-auto">
        {!unaPagina && (
          <nav
            aria-label="Paginación"
            className="inline-flex w-full items-stretch divide-x divide-surface-200 overflow-hidden rounded-lg border border-surface-200 bg-white shadow-sm lg:w-auto"
          >
            <button
              type="button"
              className={`${SEGMENT} gap-1`}
              disabled={disabled || page <= 1}
              onClick={() => onPage(page - 1)}
            >
              <span aria-hidden="true" className="text-lg leading-none">‹</span>
              <span className="sr-only">Anterior</span>
            </button>

            {/* Phones: where you are, in words. */}
            <span className="flex flex-1 items-center justify-center px-3 text-sm text-charcoal-800 lg:hidden" aria-live="polite">
              Página&nbsp;<span className="font-semibold">{page}</span>&nbsp;de {totalPages}
            </span>

            {/* From lg up (narrower screens, and the content area beside the sidebar, get the compact form): the page numbers. */}
            {pages.map((entry, index) =>
              entry === "…" ? (
                <span
                  key={`ellipsis-${index}`}
                  aria-hidden="true"
                  className="hidden h-9 min-w-9 items-center justify-center text-sm text-muted lg:inline-flex"
                >
                  …
                </span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  disabled={disabled}
                  aria-current={entry === page ? "page" : undefined}
                  aria-label={`Página ${entry}`}
                  className={`${SEGMENT} hidden lg:inline-flex ${
                    entry === page ? "bg-brand-50 font-semibold text-brand-700 hover:bg-brand-50" : ""
                  }`}
                  onClick={() => onPage(entry)}
                >
                  {entry}
                </button>
              ),
            )}

            <button
              type="button"
              className={`${SEGMENT} gap-1`}
              disabled={disabled || page >= totalPages}
              onClick={() => onPage(page + 1)}
            >
              <span className="sr-only">Siguiente</span>
              <span aria-hidden="true" className="text-lg leading-none">›</span>
            </button>
          </nav>
        )}
      </div>

      <label className="col-start-2 row-start-1 flex items-center gap-2 text-sm text-muted lg:col-auto lg:row-auto">
        <select
          className="h-9 cursor-pointer rounded-lg border border-surface-200 bg-white py-1 pl-2.5 pr-8 text-sm text-charcoal-900 shadow-sm outline-none transition-colors duration-150 hover:border-charcoal-300 focus-visible:border-charcoal-500 focus-visible:ring-2 focus-visible:ring-charcoal-400/25"
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
        <span aria-hidden="true">por página</span>
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
