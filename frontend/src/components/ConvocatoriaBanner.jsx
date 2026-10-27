import { FaCalendarCheck, FaCalendarXmark } from "react-icons/fa6";
import { formatFecha } from "../utils/fechas.js";

// "Abierto / cerrado" notice for visitors (D.1, Phase 4), from
// GET /convocatorias/estado. `estado` is the useConvocatoriaEstado() result.
const ConvocatoriaBanner = ({ estado, className = "" }) => {
  if (estado.status === "loading") {
    return (
      <div role="status" className={`h-[4.5rem] animate-pulse rounded-xl2 border border-surface-200 bg-white ${className}`}>
        <span className="sr-only">Comprobando el plazo de solicitudes…</span>
      </div>
    );
  }
  if (estado.status === "error") {
    return (
      <div role="alert" className={`rounded-xl2 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 ${className}`}>
        No se pudo comprobar si el plazo de solicitudes está abierto.{" "}
        <button type="button" className="font-semibold underline" onClick={estado.retry}>
          Reintentar
        </button>
      </div>
    );
  }
  const { abierta, activa, proxima } = estado.data;
  if (abierta) {
    return (
      <div className={`flex items-start gap-3 rounded-xl2 border border-green-200 bg-green-50 px-4 py-3 text-green-900 ${className}`}>
        <FaCalendarCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="m-0 text-sm leading-6">
          <strong className="font-semibold">Plazo abierto · convocatoria {activa.nombre}.</strong> Se admiten solicitudes del{" "}
          {formatFecha(activa.fecha_inicio)} al {formatFecha(activa.fecha_fin)}.
        </p>
      </div>
    );
  }
  return (
    <div className={`flex items-start gap-3 rounded-xl2 border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 ${className}`}>
      <FaCalendarXmark aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
      <p className="m-0 text-sm leading-6">
        <strong className="font-semibold">El plazo de solicitudes está cerrado.</strong>{" "}
        {proxima
          ? `La convocatoria ${proxima.nombre} abre el ${formatFecha(proxima.fecha_inicio)}.`
          : "Todavía no hay fecha para la próxima convocatoria."}
      </p>
    </div>
  );
};

export default ConvocatoriaBanner;
