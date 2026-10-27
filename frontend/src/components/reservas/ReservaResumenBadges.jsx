import { FaCalendarDays, FaFileSignature, FaHandshake } from "react-icons/fa6";
import EstadoBadge from "../ui/EstadoBadge.jsx";
import Tooltip from "../ui/Tooltip.jsx";
import { anexoNombre, badge } from "../../utils/labels.js";

const ICON_TONES = {
  success: "border-green-200 bg-green-50 text-green-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  neutral: "border-surface-200 bg-surface-50 text-muted",
  brand: "border-brand-200 bg-brand-50 text-brand-800",
};

// Reservation state plus the REAL state of its annex and calendar (WF-15):
// a CONFIRMADA reservation does not imply its documents exist or are signed.
// `resumen` is `documentos_resumen` from the list endpoints.
// `compact` shows one coloured icon per item (reserva, anexo, calendario)
// with the full text in a tooltip; used in the staff lists.
export default function ReservaResumenBadges({ estado, resumen, showEstado = true, compact = false, className = "" }) {
  const anexo = resumen?.anexo || null;
  const calendario = resumen?.calendario || null;
  const reserva = badge("reserva", estado);

  const items = [];
  if (showEstado) {
    items.push({
      key: "reserva",
      Icon: FaHandshake,
      kind: "reserva",
      value: estado,
      variant: reserva.variant,
      text: /^reserva/i.test(reserva.label) ? reserva.label : `Reserva ${reserva.label.toLowerCase()}`,
      label: reserva.label,
    });
  }
  if (anexo) {
    items.push({
      key: "anexo",
      Icon: FaFileSignature,
      kind: "documento",
      value: anexo.estado_operativo,
      variant: badge("documento", anexo.estado_operativo).variant,
      text: `${anexoNombre(anexo.clave)}: ${anexo.estado_operativo_label?.toLowerCase() || ""}`,
    });
  } else if (estado !== "CANCELADA") {
    items.push({
      key: "anexo",
      Icon: FaFileSignature,
      kind: "documento",
      value: "NO_APLICA",
      variant: badge("documento", "NO_APLICA").variant,
      text: "Anexo: falta tipo de contrato",
    });
  }
  if (calendario && estado !== "CANCELADA") {
    items.push({
      key: "calendario",
      Icon: FaCalendarDays,
      kind: "documento",
      value: calendario.estado_operativo,
      variant: badge("documento", calendario.estado_operativo).variant,
      text: `Calendario: ${calendario.estado_operativo_label?.toLowerCase() || ""}`,
    });
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        {items.map(({ key, Icon, variant, text }) => (
          <Tooltip
            key={key}
            text={text}
            className={`flex h-7 w-7 cursor-help items-center justify-center rounded-full border ${ICON_TONES[variant] || ICON_TONES.neutral}`}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {items.map(({ key, kind, value, text, label }) => (
        <EstadoBadge key={key} kind={kind} value={value} labelOverride={key === "reserva" ? label : text} />
      ))}
    </div>
  );
}
