import { useEffect, useState } from "react";

// Loading states, one vocabulary for the whole app (UX):
// - Whole pages and lists whose shape is known → a skeleton of that shape
//   (SkeletonCards, SkeletonRows, SkeletonPortal), so nothing jumps when the
//   data arrives.
// - Small loads inside a form, a dialog or a panel, and documents whose shape
//   is unknown (PDF) → InlineLoading: a spinner and a short sentence.
// - Refreshing data already on screen → keep it, mark the region aria-busy.
// - Buttons → their own label («Guardando…») and disabled, as today.
// Skeletons wait a moment before appearing (useAparecer) so fast loads do not
// flash, and pulse only when the user has not asked for reduced motion.
// Screen readers hear one sentence (role="status"); the shapes are hidden.

// true after `ms`: what was being loaded is taking long enough to show.
export function useAparecer(ms = 150) {
  const [visible, setVisible] = useState(ms <= 0);
  useEffect(() => {
    if (ms <= 0) return undefined;
    const t = setTimeout(() => setVisible(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return visible;
}

export function Spinner({ className = "h-4 w-4" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`shrink-0 motion-safe:animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// Spinner + sentence, for small loads in place. `centrado` fills a box.
export function InlineLoading({ children = "Cargando…", centrado = false, className = "" }) {
  return (
    <p
      role="status"
      className={`m-0 flex items-center gap-2 text-sm text-muted ${centrado ? "justify-center py-8" : ""} ${className}`}
    >
      <Spinner className="h-4 w-4 text-brand-600" />
      <span>{children}</span>
    </p>
  );
}

// A grey bar of the skeleton; `w` and `h` are Tailwind classes.
export function Bar({ w = "w-40", h = "h-3", tono = "bg-surface-100", className = "" }) {
  return <div className={`${h} ${w} rounded ${tono} ${className}`} />;
}

const pulso = "motion-safe:animate-pulse";

function Anuncio({ label }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

// Cards like the list cards (Alumnos, Empresas, Reservas…): a title, a line or
// two and, optionally, badges on the right.
export function SkeletonCards({ count = 4, lines = 1, badges = true, label = "Cargando…", delay = 150 }) {
  const visible = useAparecer(delay);
  return (
    <div className="space-y-3">
      <Anuncio label={label} />
      {visible && (
        <div className="space-y-3" aria-hidden="true">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className={`rounded-lg border border-surface-200 bg-white px-5 py-4 shadow-card ${pulso}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <Bar w={i % 2 ? "w-44" : "w-56"} h="h-4" tono="bg-surface-200" className="max-w-full" />
                  {Array.from({ length: lines }, (_, l) => (
                    <Bar key={l} w={l % 2 ? "w-36" : "w-64"} className="max-w-full" />
                  ))}
                </div>
                {badges && (
                  <div className="hidden shrink-0 gap-2 sm:flex">
                    <Bar w="w-20" h="h-7" tono="bg-surface-100" className="rounded-md" />
                    <Bar w="w-8" h="h-7" tono="bg-surface-100" className="rounded-md" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Rows inside an existing card (Convocatorias, Personal, tutors…).
export function SkeletonRows({ count = 3, label = "Cargando…", delay = 150, accion = true }) {
  const visible = useAparecer(delay);
  return (
    <div>
      <Anuncio label={label} />
      {visible && (
        <ul className={`m-0 list-none divide-y divide-surface-200 p-0 ${pulso}`} aria-hidden="true">
          {Array.from({ length: count }, (_, i) => (
            <li key={i} className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Bar w={i % 2 ? "w-32" : "w-44"} h="h-4" tono="bg-surface-200" className="max-w-full" />
                <Bar w={i % 2 ? "w-52" : "w-40"} className="max-w-full" />
              </div>
              {accion && <Bar w="w-16" h="h-8" className="shrink-0 rounded-lg" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A portal page (company, student): header, tab bar, a pending-tasks box and
// two content cards.
export function SkeletonPortal({ label = "Cargando…", delay = 150 }) {
  const visible = useAparecer(delay);
  return (
    <div>
      <Anuncio label={label} />
      {visible && (
        <div className={`space-y-6 ${pulso}`} aria-hidden="true">
          <div className="space-y-3">
            <Bar w="w-24" h="h-3" tono="bg-surface-200" />
            <Bar w="w-64" h="h-8" tono="bg-surface-200" className="max-w-full" />
            <Bar w="w-80" className="max-w-full" />
          </div>
          <div className="flex gap-6 border-b border-surface-200 pb-3">
            {["w-24", "w-28", "w-28"].map((w, i) => (
              <Bar key={i} w={w} h="h-4" tono="bg-surface-200" />
            ))}
          </div>
          <div className="rounded-lg border border-surface-200 bg-white p-5 shadow-card">
            <Bar w="w-40" h="h-4" tono="bg-surface-200" />
            <Bar w="w-72" className="mt-3 max-w-full" />
            <Bar w="w-56" className="mt-2 max-w-full" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-3 rounded-lg border border-surface-200 bg-white p-5 shadow-card">
                <Bar w="w-32" h="h-4" tono="bg-surface-200" />
                <Bar w="w-full" />
                <Bar w="w-5/6" />
                <Bar w="w-2/3" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
