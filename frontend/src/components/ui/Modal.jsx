import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

// Shared accessible dialog (PM-7, D.4).
// - role="dialog", aria-modal, labelled by its title.
// - Escape and the overlay close only the topmost dialog (dialogs can stack,
//   e.g. a reason dialog opened from the reservation panel).
// - Focus moves into the dialog, Tab cycles inside it, and focus returns to
//   the element that opened it.
// - The page behind does not scroll while a dialog is open.
// Open dialogs. The topmost is the one opened last; a dialog rendered inside
// another gets a higher number because parents render before children.
const stack = [];
let counter = 0;
const isTop = (entry) => entry === stack.reduce((top, e) => (!top || e.order > top.order ? e : top), null);

const SIZE = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "h-[92vh] max-w-[min(96vw,80rem)]",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
  headerActions,
  initialFocusRef,
  closeOnOverlay = true,
  busy = false,
  bodyClassName = "",
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  const bodyRef = useRef(null);
  const tokenRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const orderRef = useRef(null);
  if (open && orderRef.current === null) orderRef.current = ++counter;
  if (!open) orderRef.current = null;

  useEffect(() => {
    if (!open) return undefined;
    const token = { order: orderRef.current };
    tokenRef.current = token;
    stack.push(token);
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel || !isTop(token)) return;
      // Content first (an explicit initialFocusRef or data-autofocus field, then
      // the first control of the body or footer); the close button last.
      const target =
        initialFocusRef?.current ||
        panel.querySelector("[data-autofocus]") ||
        bodyRef.current?.querySelector(FOCUSABLE) ||
        panel.querySelector(FOCUSABLE) ||
        panel;
      target.focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKey = (event) => {
      if (!isTop(token)) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!busyRef.current) onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => !el.closest("[hidden]"));
      if (!items.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, true);
      const idx = stack.indexOf(token);
      if (idx > -1) stack.splice(idx, 1);
      if (!stack.length) document.body.style.overflow = previousOverflow;
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
    // initialFocusRef is read once on open on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const depth = orderRef.current || 0;
  const full = size === "full";

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/45 p-3 animate-fade-in sm:p-6"
      style={{ zIndex: 400 + Math.min(depth, 50) }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnOverlay && !busy) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl2 bg-white shadow-[0_24px_80px_rgb(17_17_16/0.28)] outline-none animate-slide-in ${SIZE[size] || SIZE.md}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="m-0 break-words font-display text-base font-semibold text-charcoal-950">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 break-words text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {headerActions}
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              disabled={busy}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </div>
        <div ref={bodyRef} className={`min-h-0 flex-1 ${full ? "overflow-hidden" : "overflow-y-auto px-4 py-4 sm:px-5"} ${bodyClassName}`}>
          {children}
        </div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-surface-200 bg-surface-50 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
