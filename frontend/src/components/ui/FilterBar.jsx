import { Children, isValidElement, useEffect, useId, useState } from "react";
import { FaChevronDown, FaMagnifyingGlass, FaSliders, FaXmark } from "react-icons/fa6";

// One filter pattern for every staff list (Phase 4): a search box, labelled
// selects, the result count (announced politely to screen readers) and a
// reset button that appears only when something is filtered.

const CONTROL =
  "h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm text-charcoal-900 outline-none transition-colors duration-150 hover:border-surface-300 focus-visible:border-charcoal-500 focus-visible:ring-2 focus-visible:ring-charcoal-400/25";

export const FilterSelect = ({ label, value, onChange, options, allLabel, className = "" }) => {
  const id = useId();
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-xs font-semibold text-charcoal-700">
        {label}
      </label>
      <select id={id} className={`${CONTROL} cursor-pointer`} value={value} onChange={(e) => onChange(e.target.value)}>
        {allLabel != null && <option value="">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
};

// The URL is updated after a short pause, not on every keystroke.
export const SearchField = ({ label = "Buscar", value, onChange, placeholder, className = "" }) => {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return undefined;
    const timer = setTimeout(() => onChange(text), 250);
    return () => clearTimeout(timer);
  }, [text, value, onChange]);

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-xs font-semibold text-charcoal-700">
        {label}
      </label>
      <div className="relative">
        <FaMagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <input
          id={id}
          type="search"
          className={`${CONTROL} pl-9 pr-9`}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onChange(text);
          }}
        />
        {text && (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => {
              setText("");
              onChange("");
            }}
            className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-100 hover:text-charcoal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          >
            <FaXmark aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};

export function countLabel(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

// Desktop: the controls wrap in rows that always fill the width (no lonely
// filter on a row of its own); the search box takes double width. Phones:
// only the search box shows, the selects open below a "Filtros" button so
// the results are not pushed a whole screen down.
const FilterBar = ({ children, count, onReset, active, label = "Filtros" }) => {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const items = Children.toArray(children).filter(isValidElement);
  const search = items.filter((c) => c.type === SearchField);
  const selects = items.filter((c) => c.type !== SearchField);
  const grow = (child, basis) => <div key={child.key} className={`min-w-0 ${basis}`}>{child}</div>;

  return (
    <section aria-label={label} className="rounded-xl2 border border-surface-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-end gap-3">
        {search.map((c) => grow(c, "flex-[2_1_18rem]"))}
        {selects.length > 0 && (
          <button
            type="button"
            className={`btn btn-secondary h-10 sm:hidden ${open ? "!border-charcoal-300" : ""}`}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            <FaSliders aria-hidden="true" />
            Filtros
            {active && <span className="h-2 w-2 rounded-full bg-brand-600" aria-label="(hay filtros aplicados)" />}
            <FaChevronDown aria-hidden="true" className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </button>
        )}
        <div
          id={panelId}
          className={`grid w-full transition-[grid-template-rows,opacity] duration-300 ease-out sm:contents ${
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 sm:opacity-100"
          }`}
        >
          <div className={`flex flex-wrap gap-3 overflow-hidden sm:contents ${open ? "" : "invisible sm:visible"}`}>
            {selects.map((c) => grow(c, "flex-[1_1_100%] sm:flex-[1_1_11rem]"))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-surface-200 pt-3">
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {count}
        </p>
        {active && (
          <button type="button" className="btn btn-ghost btn-sm animate-fade-in" onClick={onReset}>
            <FaXmark aria-hidden="true" /> Quitar filtros
          </button>
        )}
      </div>
    </section>
  );
};

export default FilterBar;
