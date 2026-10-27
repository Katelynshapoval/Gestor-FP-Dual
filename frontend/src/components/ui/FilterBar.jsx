import { useEffect, useId, useState } from "react";
import { FaMagnifyingGlass, FaXmark } from "react-icons/fa6";

// One filter pattern for every staff list (Phase 4): a search box, labelled
// selects, the result count (announced politely to screen readers) and a
// reset button that appears only when something is filtered.

const CONTROL =
  "h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm text-charcoal-900 outline-none transition-colors duration-150 hover:border-surface-300 focus-visible:border-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/20";

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

const FilterBar = ({ children, count, onReset, active, label = "Filtros" }) => (
  <section aria-label={label} className="rounded-xl2 border border-surface-200 bg-white p-4 shadow-card">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-surface-200 pt-3">
      <p className="text-sm text-muted" role="status" aria-live="polite">
        {count}
      </p>
      {active && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
          <FaXmark aria-hidden="true" /> Quitar filtros
        </button>
      )}
    </div>
  </section>
);

export default FilterBar;
