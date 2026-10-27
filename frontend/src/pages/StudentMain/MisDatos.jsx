import EstadoBadge from "../../components/ui/EstadoBadge.jsx";
import ReadField from "../../components/ui/ReadField.jsx";
import { formatFecha as formatDate } from "../../utils/fechas.js";

export default function MisDatos({ solicitud }) {

  return (
    <div className="form-card">
      <p className="form-section-title">Mi solicitud</p>
      {!solicitud ? (
        <p className="text-sm text-muted">No hay una solicitud Dual asociada a tu cuenta.</p>
      ) : (
        <>
          <div className="mb-5">
            <EstadoBadge kind="solicitud" value={solicitud?.estado_validacion} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ReadField label="Nombre" value={solicitud.nombre} />
            <ReadField label="DNI / NIE" value={solicitud.dni} />
            <ReadField label="Especialidad" value={solicitud.especialidad} />
            <ReadField label="Convocatoria" value={solicitud.convocatoria} />
            <ReadField label="Fecha de solicitud" value={formatDate(solicitud.fecha_solicitud)} />
          </div>
          {solicitud.estado_validacion === "RECHAZADO" && solicitud.motivo && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-semibold">Motivo</p>
              <p className="mt-1">{solicitud.motivo}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
