import { useId, useRef } from "react";

// Accessible tabs (WAI-ARIA tabs pattern, Phase 4): one tab stop, arrow keys
// and Home/End move between tabs, each panel is labelled by its tab.
//   <Tabs label="…" tabs={[{ id, label, badge }]} value={id} onChange={fn}>
//     {panel content for `value`}
//   </Tabs>
const Tabs = ({ label, tabs, value, onChange, children, className = "" }) => {
  const base = useId();
  const refs = useRef({});
  const index = Math.max(0, tabs.findIndex((t) => t.id === value));

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
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="relative mb-6 flex flex-wrap gap-x-1 border-b border-surface-200 sm:flex-nowrap sm:overflow-x-auto sm:overflow-y-hidden"
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
              className={`relative -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40 ${
                selected ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-charcoal-900"
              }`}
            >
              {t.label}
              {t.badge ? (
                <span
                  className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[0.7rem] leading-none ${
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
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${tabs[index]?.id}`}>
        {children}
      </div>
    </div>
  );
};

export default Tabs;
