import { FaCircleCheck, FaCircleExclamation, FaCircleInfo, FaHourglassHalf } from "react-icons/fa6";

// "Qué tienes pendiente" block at the top of the company and student portals
// (Phase 4, D.3). Items are built by each portal from the data it already
// loads; nothing here is decided in the browser that the backend did not say.
//   tone: "action" (you must do something) · "waiting" (someone else acts)
//         "info" · "done"
const TONES = {
  action: { Icon: FaCircleExclamation, cls: "border-amber-300 bg-amber-50", icon: "text-amber-700", tag: "Te toca" },
  waiting: { Icon: FaHourglassHalf, cls: "border-surface-200 bg-white", icon: "text-muted", tag: "En espera" },
  info: { Icon: FaCircleInfo, cls: "border-surface-200 bg-white", icon: "text-charcoal-700", tag: null },
  done: { Icon: FaCircleCheck, cls: "border-green-200 bg-green-50", icon: "text-green-700", tag: null },
};

const Pendientes = ({ items, titulo = "Qué tienes pendiente" }) => {
  const acciones = items.filter((i) => i.tone === "action").length;
  return (
    <section aria-labelledby="pendientes-titulo" className="mb-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pendientes-titulo" className="form-section-title mb-0">
          {titulo}
        </h2>
        <p className="m-0 text-sm text-muted" role="status">
          {acciones === 0
            ? "No tienes nada que hacer ahora mismo."
            : `${acciones} ${acciones === 1 ? "tarea requiere" : "tareas requieren"} tu acción.`}
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const t = TONES[item.tone] || TONES.info;
          return (
            <li key={item.key} className={`flex gap-3 rounded-xl2 border px-4 py-3 ${t.cls}`}>
              <t.Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${t.icon}`} />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-semibold text-charcoal-950">
                  {t.tag && <span className="sr-only">{t.tag}: </span>}
                  {item.title}
                </p>
                {item.text && <p className="m-0 mt-0.5 text-sm leading-6 text-charcoal-800">{item.text}</p>}
              </div>
              {item.action && (
                <button type="button" className="btn btn-secondary btn-sm shrink-0 self-center" onClick={item.action.onClick}>
                  {item.action.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default Pendientes;
