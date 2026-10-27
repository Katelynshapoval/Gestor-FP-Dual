import EstadoBadge from "../ui/EstadoBadge.jsx";
import { anexoNombre } from "../../utils/labels.js";

// Reservation state plus the REAL state of its annex and calendar (WF-15):
// a CONFIRMADA reservation does not imply its documents exist or are signed.
// `resumen` is `documentos_resumen` from the list endpoints.
export default function ReservaResumenBadges({ estado, resumen, showEstado = true, className = "" }) {
  const anexo = resumen?.anexo || null;
  const calendario = resumen?.calendario || null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {showEstado && <EstadoBadge kind="reserva" value={estado} />}
      {anexo ? (
        <EstadoBadge
          kind="documento"
          value={anexo.estado_operativo}
          labelOverride={`${anexoNombre(anexo.clave)}: ${anexo.estado_operativo_label?.toLowerCase() || ""}`}
        />
      ) : (
        estado !== "CANCELADA" && <EstadoBadge kind="documento" value="NO_APLICA" labelOverride="Anexo: falta tipo de contrato" />
      )}
      {calendario && estado !== "CANCELADA" && (
        <EstadoBadge
          kind="documento"
          value={calendario.estado_operativo}
          labelOverride={`Calendario: ${calendario.estado_operativo_label?.toLowerCase() || ""}`}
        />
      )}
    </div>
  );
}
