import StatusBadge from "../../components/ui/StatusBadge.jsx";

const ReadField = ({ label, value }) => (
  <div className="field">
    <label>{label}</label>
    <p className="input bg-gray-50 cursor-default">{value || "—"}</p>
  </div>
);

const ESTADO_SOLICITUD = {
  PENDIENTE: { label: "Solicitud en revisión", variant: "warning" },
  VALIDADO: { label: "Solicitud aprobada para Dual", variant: "success" },
  RECHAZADO: { label: "Solicitud no aprobada", variant: "danger" },
};

function formatDate(value) {
  if (!value) return "—";
  const dateStr = typeof value === "string" ? value.split("T")[0] : value;
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-ES");
}

export default function MisDatos({ solicitud }) {
  const estado = ESTADO_SOLICITUD[solicitud?.estado_validacion] || {
    label: solicitud?.estado_validacion || "Sin estado",
    variant: "neutral",
  };

  return (
    <div className="form-card">
      <p className="form-section-title">Mi solicitud</p>
      {!solicitud ? (
        <p className="text-sm text-muted">No hay una solicitud Dual asociada a tu cuenta.</p>
      ) : (
        <>
          <div className="mb-5">
            <StatusBadge variant={estado.variant}>{estado.label}</StatusBadge>
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
