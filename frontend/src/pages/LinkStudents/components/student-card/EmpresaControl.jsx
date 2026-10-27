import { useEffect, useState } from "react";
import { getJSON } from "../../../../utils/api.js";
import { empresaSlotClass } from "../../../../components/ui/cardStyles";
import { isCancelledReserva } from "../../../../utils/reservaEstados.js";
import { useConfirm } from "../../../../components/feedback/ToastProvider.jsx";
import ReservaDetalle from "../../../../components/reservas/ReservaDetalle.jsx";
import ReservaResumenBadges from "../../../../components/reservas/ReservaResumenBadges.jsx";
import { tipoContratoLabel } from "../../../../utils/labels.js";

// Staff "Reservas" tab of a student card: the student's reservations (each one
// managed in the shared ReservaDetalle panel) and the form to create a new one.
const EmpresaControl = ({ r, onAdminReserve, onChanged }) => {
  const confirm = useConfirm();
  const reservas = r.reservas || [];
  const [ofertas, setOfertas] = useState(null);
  const [ofertasError, setOfertasError] = useState("");
  const [idOfertaNueva, setIdOfertaNueva] = useState("");
  const [abierta, setAbierta] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!r.id_solicitud_alumno) return;
    let active = true;
    setOfertasError("");
    getJSON(`/reservas/ofertas-elegibles?id_solicitud_alumno=${r.id_solicitud_alumno}`)
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data) ? data : [];
        setOfertas(list);
        setIdOfertaNueva(list[0] ? String(list[0].id_solicitud_empresa_especialidad) : "");
      })
      .catch((err) => {
        if (!active) return;
        setOfertas([]);
        setIdOfertaNueva("");
        setOfertasError(err.message || "No se pudieron cargar las ofertas.");
      });
    return () => {
      active = false;
    };
  }, [r.id_solicitud_alumno, r.reservas]);

  const handleNewReserve = async () => {
    if (!idOfertaNueva) return;
    const oferta = (ofertas || []).find(
      (o) => String(o.id_solicitud_empresa_especialidad) === String(idOfertaNueva),
    );
    const accepted = await confirm({
      title: "Crear reserva",
      message: `¿Crear una reserva pendiente con ${oferta?.empresa || "esta empresa"}?`,
      confirmLabel: "Crear reserva",
      tone: "primary",
    });
    if (!accepted) return;
    setBusy(true);
    try {
      await onAdminReserve(r.id_solicitud_alumno, Number(idOfertaNueva));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {reservas.length === 0 && (
        <div className={empresaSlotClass}>
          <p className="text-sm text-muted">Este alumno no tiene reservas.</p>
        </div>
      )}

      {reservas.map((rv) => (
        <div key={rv.id_reserva} className={empresaSlotClass}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-base font-semibold">{rv.empresa}</p>
              <p className="text-xs text-muted">
                {[rv.tipo_contrato && `Contrato: ${tipoContratoLabel(rv.tipo_contrato)}`, rv.tutor_nombre && `Tutor: ${rv.tutor_nombre}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {rv.motivo && isCancelledReserva(rv.estado_reserva) && (
                <p className="text-xs italic text-muted">Motivo: {rv.motivo}</p>
              )}
            </div>
            <ReservaResumenBadges compact estado={rv.estado_reserva} resumen={rv.documentos_resumen} />
          </div>
          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => setAbierta(rv.id_reserva)}>
            Gestionar reserva
          </button>
        </div>
      ))}

      <div className={empresaSlotClass}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Reservar en empresa</p>
        {ofertas === null ? (
          <p className="text-sm text-muted">Cargando ofertas…</p>
        ) : ofertasError ? (
          <p className="text-sm text-red-700" role="alert">{ofertasError}</p>
        ) : ofertas.length === 0 ? (
          <p className="text-sm text-muted">
            No hay ofertas elegibles (misma especialidad y convocatoria, empresa validada y con plazas). Un alumno con
            una plaza confirmada se cambia con «Reasignar» dentro de su reserva.
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor={`oferta-${r.id_solicitud_alumno}`} className="sr-only">
              Oferta
            </label>
            <select
              id={`oferta-${r.id_solicitud_alumno}`}
              className="select-input w-full py-2 text-sm"
              value={idOfertaNueva}
              onChange={(e) => setIdOfertaNueva(e.target.value)}
            >
              {ofertas.map((o) => (
                <option key={o.id_solicitud_empresa_especialidad} value={o.id_solicitud_empresa_especialidad}>
                  {o.empresa} · {o.especialidad} ({o.plazas_disponibles} plazas)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleNewReserve}
              disabled={!idOfertaNueva || busy}
              className="btn btn-outline-brand btn-sm shrink-0"
            >
              {busy ? "Reservando…" : "Reservar"}
            </button>
          </div>
        )}
      </div>

      <ReservaDetalle
        idReserva={abierta}
        open={Boolean(abierta)}
        onClose={() => setAbierta(null)}
        onChanged={onChanged}
      />
    </div>
  );
};

export default EmpresaControl;
