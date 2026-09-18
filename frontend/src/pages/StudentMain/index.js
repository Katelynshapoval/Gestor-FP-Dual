import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { getJSON } from "../../utils/api.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import "../../styles/forms.css";

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

function isPending(estado) {
  return estado === "PENDIENTE" || estado === "RESERVADA";
}

function isConfirmed(estado) {
  return estado === "CONFIRMADO" || estado === "CONFIRMADA";
}

function isCancelled(estado) {
  return estado === "CANCELADO" || estado === "CANCELADA";
}

function formatDate(value) {
  if (!value) return "—";
  const dateStr = typeof value === "string" ? value.split("T")[0] : value;
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES");
}

function StudentMain() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [solicitud, setSolicitud] = useState(null);
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || user.rol !== "ALUMNO") {
      navigate("/login");
      return;
    }

    Promise.all([
      getJSON("/solicitudes/alumno/mia").catch((err) => {
        if (err.message?.includes("404") || /no hay solicitud/i.test(err.message || "")) {
          return null;
        }
        throw err;
      }),
      getJSON("/reservas/alumno"),
    ])
      .then(([sol, resv]) => {
        setSolicitud(sol);
        setReservas(Array.isArray(resv) ? resv : []);
      })
      .catch((err) => setError(err.message || "No se pudo cargar tu proceso Dual."))
      .finally(() => setLoading(false));
  }, [user, navigate]);

  if (!user || user.rol !== "ALUMNO") return null;

  const estado = ESTADO_SOLICITUD[solicitud?.estado_validacion] || {
    label: solicitud?.estado_validacion || "Sin estado",
    variant: "neutral",
  };

  const confirmed = reservas.filter((r) => isConfirmed(r.estado_reserva));
  const pending = reservas.filter((r) => isPending(r.estado_reserva));
  const cancelled = reservas.filter((r) => isCancelled(r.estado_reserva));
  const hasDefinitive = confirmed.length > 0;

  return (
    <div className="page-container">
      <PageHeader
        kicker="Alumno"
        title="Mi proceso Dual"
        subtitle={`${user.nombre}${user.dni ? ` · ${user.dni}` : ""}`}
      />

      {loading ? (
        <p className="text-center text-gray-400 py-16">Cargando…</p>
      ) : error ? (
        <div className="form-card">
          <p className="text-center text-red-600 py-8">{error}</p>
        </div>
      ) : (
        <>
          <div className="form-card">
            <p className="form-section-title">Mi solicitud</p>
            {!solicitud ? (
              <p className="text-sm text-muted">
                No hay una solicitud Dual asociada a tu cuenta.
              </p>
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

          <div className="form-card">
            <p className="form-section-title">Estado con empresas</p>
            <p className="field-hint">
              Las empresas eligen candidatos. Aquí solo aparecen reservas reales sobre tu solicitud.
            </p>

            {reservas.length === 0 && (
              <p className="text-sm text-muted">
                Actualmente ninguna empresa ha reservado tu candidatura.
              </p>
            )}

            {hasDefinitive && (
              <div className="space-y-3 mb-5">
                {confirmed.map((r) => (
                  <div
                    key={r.id_reserva}
                    className="rounded-lg border border-green-200 bg-green-50 px-4 py-3"
                  >
                    <StatusBadge variant="success">Plaza confirmada</StatusBadge>
                    <p className="mt-3 text-sm font-semibold text-charcoal-950">
                      Tu plaza con {r.empresa} está confirmada.
                    </p>
                    {r.especialidad && (
                      <p className="mt-1 text-xs text-muted">{r.especialidad}</p>
                    )}
                    {r.tipo_contrato && (
                      <p className="mt-1 text-xs text-muted">Contrato: {r.tipo_contrato}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {pending.length > 0 && (
              <div className="space-y-3 mb-5">
                {pending.map((r) => (
                  <div
                    key={r.id_reserva}
                    className={`rounded-lg border px-4 py-3 ${
                      hasDefinitive
                        ? "border-surface-200 bg-surface-50"
                        : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <StatusBadge variant={hasDefinitive ? "neutral" : "warning"}>
                      Reserva pendiente
                    </StatusBadge>
                    <p className="mt-3 text-sm font-semibold text-charcoal-950">
                      {r.empresa} ha reservado tu candidatura. El proceso está pendiente de
                      confirmación.
                    </p>
                    {hasDefinitive && (
                      <p className="mt-1 text-xs text-muted">
                        Esta reserva no es la plaza definitiva.
                      </p>
                    )}
                    {r.especialidad && (
                      <p className="mt-1 text-xs text-muted">{r.especialidad}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {cancelled.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                  Historial
                </p>
                {cancelled.map((r) => (
                  <div
                    key={r.id_reserva}
                    className="rounded-lg border border-surface-200 bg-white px-4 py-3"
                  >
                    <StatusBadge variant="neutral">Reserva cancelada</StatusBadge>
                    <p className="mt-3 text-sm text-charcoal-800">
                      La reserva de {r.empresa} fue cancelada.
                    </p>
                    {r.motivo && (
                      <p className="mt-1 text-xs italic text-muted">Motivo: {r.motivo}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default StudentMain;
