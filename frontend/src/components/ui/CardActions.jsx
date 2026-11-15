import { FaChevronDown, FaPen } from "react-icons/fa6";

// The two buttons at the top right of a list card (Alumnos, Empresas):
// edit and show/hide details, identical in size and style so they read as a
// pair. Clicks do not reach the card header (which toggles the card too).
const BTN =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white text-muted outline-none transition-[border-color,color,background-color] duration-150 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/30";

export default function CardActions({ nombre, expanded, onToggle, onEdit = null }) {
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {onEdit && (
        <button type="button" title="Editar datos" aria-label={`Editar los datos de ${nombre}`} className={BTN} onClick={stop(onEdit)}>
          <FaPen aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`${expanded ? "Ocultar" : "Mostrar"} el detalle de ${nombre}`}
        title={expanded ? "Ocultar detalle" : "Mostrar detalle"}
        className={BTN}
        onClick={stop(onToggle)}
      >
        <FaChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  );
}

// Card header grid: name on the left, the actions always top right; the
// badges go beside the name from sm up and on their own row below it on
// phones. Give the name, badges and actions these classes.
export const cardHeaderGrid =
  "grid cursor-pointer select-none grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3 transition-colors duration-150 sm:grid-cols-[minmax(12rem,1fr)_minmax(0,auto)_auto] sm:items-center sm:gap-x-4";
export const cardHeaderName = "min-w-0";
export const cardHeaderBadges =
  "col-span-2 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:justify-end";
export const cardHeaderActions = "col-start-2 row-start-1 sm:col-start-3";
