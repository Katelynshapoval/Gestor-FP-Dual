import { FaCalendarDays, FaCheck, FaExclamation, FaFileSignature, FaHandshake, FaMinus, FaXmark } from "react-icons/fa6";
import EstadoBadge from "../ui/EstadoBadge.jsx";
import Tooltip from "../ui/Tooltip.jsx";
import { anexoNombre, badge } from "../../utils/labels.js";

// Every circle looks the same; only the corner mark carries the state.
const ICON_CLASS = "border-surface-300 bg-white text-charcoal-700";

// The mark repeats the state as a shape, so it does not depend on telling
// green, amber and red apart. "Pending" and "pending signature" share amber.
const STATE_MARKS = {
  success: { Icon: FaCheck, className: "bg-green-600" },
  warning: { Icon: FaExclamation, className: "bg-amber-500" },
  info: { Icon: FaExclamation, className: "bg-amber-500" },
  danger: { Icon: FaXmark, className: "bg-red-600" },
  neutral: { Icon: FaMinus, className: "bg-charcoal-300" },
};

const StateMark = ({ variant, inline = false }) => {
  const mark = STATE_MARKS[variant] || STATE_MARKS.neutral;
  const position = inline ? "inline-flex" : "absolute -bottom-1 -right-1 flex ring-2 ring-white";
  return (
    <span className={`${position} h-3.5 w-3.5 items-center justify-center rounded-full text-white ${mark.className}`}>
      <mark.Icon className="h-2 w-2" />
    </span>
  );
};

// Key for the compact icons, shown once above the staff lists that use them.
export function ReservaIconLegend({ className = "" }) {
  const items = [
    [FaHandshake, "Reserva"],
    [FaFileSignature, "Anexo"],
    [FaCalendarDays, "Calendario"],
  ];
  const marks = [
    ["success", "hecho"],
    ["warning", "pendiente"],
    ["danger", "rechazado"],
    ["neutral", "no aplica"],
  ];
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted ${className}`} aria-hidden="true">
      {items.map(([Icon, text]) => (
        <span key={text} className="inline-flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-charcoal-700" /> {text}
        </span>
      ))}
      <span className="hidden h-3 border-l border-surface-300 sm:inline" />
      {marks.map(([variant, text]) => (
        <span key={variant} className="inline-flex items-center gap-1.5">
          <StateMark variant={variant} inline /> {text}
        </span>
      ))}
    </div>
  );
}

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
            className={`relative flex h-7 w-7 cursor-help items-center justify-center rounded-full border ${ICON_CLASS}`}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            <StateMark variant={variant} />
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
