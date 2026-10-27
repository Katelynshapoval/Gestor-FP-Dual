import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Small text bubble for icon-only indicators. Opens on hover, keyboard focus
// and tap (touch screens have no hover); Escape or scrolling closes it.
// The trigger carries the text as its accessible name, so the bubble itself
// is hidden from screen readers. It is portalled with fixed positioning so
// cards with overflow-hidden never clip it.
export default function Tooltip({ text, children, className = "" }) {
  const triggerRef = useRef(null);
  const tipRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tipRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const w = tipRef.current.offsetWidth;
    const h = tipRef.current.offsetHeight;
    const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, 8), window.innerWidth - w - 8);
    const above = r.top - h - 8 >= 8;
    setPos({ left, top: above ? r.top - h - 8 : r.bottom + 8 });
  }, [open, text]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        role="img"
        tabIndex={0}
        aria-label={text}
        className={`outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 ${className}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            aria-hidden="true"
            className="pointer-events-none fixed z-[60] max-w-[16rem] rounded-md bg-charcoal-900 px-2.5 py-1.5 text-xs font-medium leading-4 text-white shadow-shell"
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
