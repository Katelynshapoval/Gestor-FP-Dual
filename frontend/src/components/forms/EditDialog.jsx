import { useEffect, useRef, useState } from "react";
import { MdLockOutline } from "react-icons/md";
import Modal from "../ui/Modal.jsx";
import { useConfirm } from "../feedback/ToastProvider.jsx";

// Data editing dialog shared by the company and student forms, both for
// Administración (direct edit) and the portals (sent for review):
// - a section index on top that follows the scroll;
// - Cancel / Save always visible in the footer, with the number of changed fields;
// - closing with unsaved changes asks first.
// The form inside is a <form id={formId}>; the footer button submits it.

const MODE = {
  direct: { label: "Edición directa · sin aprobación", className: "border-surface-200 bg-surface-100 text-charcoal-700" },
  review: { label: "Se envía al centro para revisión", className: "border-amber-200 bg-amber-50 text-amber-900" },
};

const FIELD = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';

const same = (a, b) =>
  Array.isArray(a) || Array.isArray(b)
    ? [...(a || [])].map(String).sort().join() === [...(b || [])].map(String).sort().join()
    : String(a ?? "") === String(b ?? "");

export function countChanges(inicial, values) {
  if (!inicial || !values) return 0;
  return Object.keys(values).filter((k) => !same(inicial[k], values[k])).length;
}

function scrollParent(el) {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

const SectionNav = ({ sections }) => {
  const navRef = useRef(null);
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const container = scrollParent(navRef.current);
    if (!container) return undefined;
    const onScroll = () => {
      const top = container.getBoundingClientRect().top + (navRef.current?.offsetHeight || 0) + 24;
      let current = sections[0]?.id;
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= top) current = s.id;
      }
      // At the very bottom the last section is the active one, even if short.
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 4) current = sections[sections.length - 1]?.id;
      setActive(current);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [sections]);

  // On narrow screens the index scrolls sideways: keep the active entry visible.
  useEffect(() => {
    const list = navRef.current?.querySelector("ul");
    const chip = list?.querySelector('[aria-current="true"]');
    if (!list || !chip) return;
    const left = chip.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + chip.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = left - 16;
    }
  }, [active]);

  return (
    <nav
      ref={navRef}
      aria-label="Secciones del formulario"
      className="sticky -top-4 z-10 -mx-4 -mt-4 mb-4 border-b border-surface-200 bg-white px-4 py-2.5 sm:-mx-5 sm:px-5"
    >
      <ul className="no-scrollbar m-0 flex list-none gap-1.5 overflow-x-auto p-0">
        {sections.map((s) => (
          <li key={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                setActive(s.id);
                document.getElementById(s.id)?.scrollIntoView?.({ block: "start" });
              }}
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/30 ${
                active === s.id
                  ? "border-brand-200 bg-brand-50 text-brand-800"
                  : "border-transparent text-muted hover:bg-surface-100 hover:text-charcoal-900"
              }`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default function EditDialog({
  open,
  onClose,
  title = "Editar datos",
  subject,
  mode = "direct",
  notice,
  sections = [],
  formId,
  submitLabel,
  submitting = false,
  changes = 0,
  children,
}) {
  const confirm = useConfirm();
  const m = MODE[mode] || MODE.direct;
  const contentRef = useRef(null);
  // Focus starts on the first field, not on the section index.
  const firstField = useRef({
    get current() {
      return contentRef.current?.querySelector(FIELD) || null;
    },
  }).current;

  const close = async () => {
    if (submitting) return;
    if (changes > 0) {
      const ok = await confirm({
        title: "Descartar cambios",
        message: "Hay cambios sin guardar. Si cierras, se perderán.",
        confirmLabel: "Descartar",
        cancelLabel: "Seguir editando",
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {subject && <span className="font-medium text-charcoal-800">{subject}</span>}
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold ${m.className}`}>
            {m.label}
          </span>
        </span>
      }
      size="lg"
      bodyClassName="bg-surface-50"
      busy={submitting}
      initialFocusRef={firstField}
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-center text-xs text-muted sm:text-left" aria-live="polite">
            {changes === 0 ? "Sin cambios" : changes === 1 ? "1 campo modificado" : `${changes} campos modificados`}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button type="button" className="btn btn-secondary" onClick={close} disabled={submitting}>
              Cancelar
            </button>
            <button
              type="submit"
              form={formId}
              className="btn btn-primary"
              disabled={submitting || changes === 0}
              aria-busy={submitting || undefined}
            >
              {submitting ? "Guardando…" : submitLabel}
            </button>
          </div>
        </div>
      }
    >
      {sections.length > 1 && <SectionNav sections={sections} />}
      {notice && <div className="mb-4">{notice}</div>}
      <div ref={contentRef}>{children}</div>
    </Modal>
  );
}

// One block of the form: a card with an icon header and the fields below.
export const EditSection = ({ id, icon: Icon, title, description, children }) => (
  <section
    id={id}
    className="mb-4 scroll-mt-16 overflow-hidden rounded-xl2 border border-surface-200 bg-white shadow-card last:mb-0"
  >
    <header className="flex items-center gap-3 border-b border-surface-200 px-4 py-3 sm:px-5">
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
        </span>
      )}
      <div className="min-w-0">
        <h3 className="m-0 text-sm font-semibold text-charcoal-950">{title}</h3>
        {description && <p className="m-0 text-xs leading-5 text-muted">{description}</p>}
      </div>
    </header>
    <div className="px-4 py-4 sm:px-5 sm:py-5">{children}</div>
  </section>
);

// Two equal columns; long fields (W.full) take the whole row.
export const EditGrid = ({ children, className = "" }) => (
  <div className={`edit-grid ${className}`}>{children}</div>
);

export const W = {
  full: "sm:col-span-2",
  half: "",
};

// A value that cannot be changed here: not an input, with a lock and the reason.
export const LockedField = ({ label, value, hint, className = "" }) => (
  <div className={`field ${className}`}>
    <p className="mb-2 block text-sm font-semibold text-charcoal-800">{label}</p>
    <div className="flex min-h-[38px] items-center justify-between gap-2 rounded-lg border border-dashed border-surface-300 bg-surface-50 px-3 py-2 text-sm text-charcoal-800">
      <span className="min-w-0 break-words">{value || "—"}</span>
      <MdLockOutline aria-hidden="true" className="h-4 w-4 shrink-0 text-charcoal-400" />
    </div>
    {hint && <p className="mb-0 mt-1.5 text-xs leading-5 text-muted">{hint}</p>}
  </div>
);

// On/off option shown as a switch (still a checkbox for assistive technology).
export const SwitchField = ({ id, label, description, checked, onChange }) => (
  <label
    htmlFor={id}
    className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 transition-colors hover:border-surface-300"
  >
    <span className="min-w-0">
      <span className="block text-sm font-semibold text-charcoal-900">{label}</span>
      {description && <span className="mt-0.5 block text-xs leading-5 text-muted">{description}</span>}
    </span>
    <span className="relative mt-0.5 inline-flex shrink-0">
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="h-5 w-9 rounded-full bg-charcoal-200 transition-colors peer-checked:bg-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30" />
      <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
    </span>
  </label>
);

// Moves to the first field with an error (ids follow StepForm: campo-<name>).
export function focusFirstError(errores, order) {
  const first = order.find((k) => errores[k]);
  if (!first) return;
  const el = document.getElementById(`campo-${first}`);
  if (!el) return;
  el.scrollIntoView?.({ block: "center" });
  el.focus({ preventScroll: true });
}
