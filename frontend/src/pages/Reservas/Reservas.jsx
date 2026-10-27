import { useCallback, useEffect, useState } from "react";
import { getJSON } from "../../utils/api.js";
import PageHeader from "../../components/ui/PageHeader";
import ReservasLista from "./ReservasLista";
import { useConvocatoriaEstado } from "../../hooks/useConvocatoriaEstado.js";

// Staff reservations list, its own menu entry since Phase 4 (D.1). All actions
// happen in the shared ReservaDetalle panel opened from each row.
const Reservas = () => {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const activaNombre = useConvocatoriaEstado().data?.activa?.nombre || null;

  const load = useCallback(() => {
    setError(null);
    return getJSON("/reservas")
      .then((d) => setReservas(Array.isArray(d) ? d : []))
      .catch((err) => setError(err.message || "No se pudieron cargar las reservas."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page-container space-y-6">
      <PageHeader kicker="Gestión" title="Reservas" subtitle="Agrupadas por lo que necesitan a continuación. Cada reserva se gestiona desde su panel." />
      {loading ? (
        <p role="status" className="rounded-xl2 border border-surface-200 bg-white py-12 text-center text-sm text-muted shadow-card">
          Cargando reservas…
        </p>
      ) : error ? (
        <div role="alert" className="rounded-xl2 border border-surface-200 bg-white px-6 py-12 text-center shadow-card">
          <p className="font-semibold text-charcoal-950">No se pudieron cargar las reservas.</p>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={load}>
            Reintentar
          </button>
        </div>
      ) : (
        <ReservasLista reservations={reservas} onReservationUpdate={load} activaNombre={activaNombre} />
      )}
    </div>
  );
};

export default Reservas;
