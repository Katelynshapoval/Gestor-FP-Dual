import { useId, useLayoutEffect, useRef, useState } from "react";

// Accessible tabs (WAI-ARIA tabs pattern, Phase 4): one tab stop, arrow keys
// and Home/End move between tabs, each panel is labelled by its tab.
//   <Tabs label="…" tabs={[{ id, label, badge }]} value={id} onChange={fn}>
//     {panel content for `value`}
//   </Tabs>
const Tabs = ({ label, tabs, value, onChange, children, className = "" }) => {
  const base = useId();
  const refs = useRef({});
  const index = Math.max(0, tabs.findIndex((t) => t.id === value));
  // One underline that slides to the selected tab instead of jumping.
  const [bar, setBar] = useState(null);
  // Which edges hide more tabs (phones): a soft fade there says it scrolls.
  const listRef = useRef(null);
  const [fade, setFade] = useState({ left: false, right: false });
  const updateFade = () => {
    const el = listRef.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setFade((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  };
  const selectedId = tabs[index]?.id;
  // Labels and badges change a tab's width, so they are part of the key.
  const shape = tabs.map((t) => `${t.id}:${t.label}:${t.badge ?? ""}`).join("|");
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[selectedId];
      if (!el) return;
      const next = { left: el.offsetLeft, width: el.offsetWidth, top: el.offsetTop + el.offsetHeight - 2 };
      setBar((prev) =>
        prev && prev.left === next.left && prev.width === next.width && prev.top === next.top ? prev : next,
      );
    };
    measure();
    // One row on every screen: if it scrolls sideways, keep the selected tab in view.
    refs.current[selectedId]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    updateFade();
    const onResize = () => {
      measure();
      updateFade();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [selectedId, shape]);

  const focusTab = (i) => {
    const tab = tabs[(i + tabs.length) % tabs.length];
    onChange(tab.id);
    refs.current[tab.id]?.focus();
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowRight") focusTab(index + 1);
    else if (event.key === "ArrowLeft") focusTab(index - 1);
    else if (event.key === "Home") focusTab(0);
    else if (event.key === "End") focusTab(tabs.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        onScroll={updateFade}
        style={
          fade.left || fade.right
            ? {
                WebkitMaskImage: `linear-gradient(to right, ${fade.left ? "transparent, #000 2rem" : "#000"}, ${fade.right ? "#000 calc(100% - 2rem), transparent" : "#000"})`,
                maskImage: `linear-gradient(to right, ${fade.left ? "transparent, #000 2rem" : "#000"}, ${fade.right ? "#000 calc(100% - 2rem), transparent" : "#000"})`,
              }
            : undefined
        }
        className="no-scrollbar relative mb-6 flex gap-x-0.5 overflow-x-auto overflow-y-hidden border-b border-surface-200 sm:gap-x-1"
      >
        {tabs.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              id={`${base}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={`relative -mb-px inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 sm:px-4 py-2.5 text-sm font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40 ${
                selected ? "text-brand-700" : "text-muted hover:bg-surface-100/70 hover:text-charcoal-900"
              } ${selected && !bar ? "border-brand-600" : "border-transparent"}`}
            >
              {t.label}
              {t.badge ? (
                <span
                  className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs leading-none ${
                    t.badgeTone === "action" ? "bg-amber-100 text-amber-900" : "bg-surface-200 text-charcoal-800"
                  }`}
                >
                  {t.badge}
                  {t.badgeLabel && <span className="sr-only"> {t.badgeLabel}</span>}
                </span>
              ) : null}
            </button>
          );
        })}
        {bar && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute h-0.5 rounded-full bg-brand-600 transition-[left,width,top] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
            style={{ left: bar.left, width: bar.width, top: bar.top }}
          />
        )}
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${tabs[index]?.id}`}>
        {children}
      </div>
    </div>
  );
};

export default Tabs;
