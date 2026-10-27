import { useEffect, useState } from "react";
import { getJSON, postJSON } from "../utils/api.js";
import { formatFecha } from "../utils/fechas.js";
import { label } from "../utils/labels.js";
import MotivoDialog from "./ui/MotivoDialog.jsx";
import { useToast } from "./feedback/ToastProvider.jsx";

// «Dar de baja» / «Reactivar» for one student or company application
// (Phase 5, Administración only: render it only for ADMINISTRADOR; the
// backend refuses everyone else).
// tipo: "alumno" | "empresa"; s: the list row (estado_validacion, motivo_baja, fecha_baja).
export default function BajaControls({ tipo, id, s, nombre, onChanged, className = "" }) {
  const toast = useToast();
  const [dialog, setDialog] = useState(null); // "baja" | "reactivar"
  const base = `/solicitudes/${tipo}/${id}`;
  const deBaja = s.estado_validacion === "BAJA";
  const quien = tipo === "alumno" ? "del alumno" : "de la empresa";

  return (
    <div className={className}>
      {deBaja ? (
        <>
          <p className="mb-3 rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-xs leading-5 text-charcoal-800">
            <span className="font-semibold">Dada de baja{s.fecha_baja ? ` el ${formatFecha(s.fecha_baja)}` : ""}.</span>{" "}
            {s.motivo_baja && <>Motivo: {s.motivo_baja}. </>}
            La cuenta del portal está desactivada.
          </p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog("reactivar")}>
            Reactivar
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-danger btn-sm" onClick={() => setDialog("baja")}>
          Dar de baja
        </button>
      )}

      <BajaDialog
        open={dialog === "baja"}
        base={base}
        tipo={tipo}
        nombre={nombre}
        onClose={() => setDialog(null)}
        onDone={async (message) => {
          setDialog(null);
          toast.success(message);
          if (onChanged) await onChanged();
        }}
      />
      <MotivoDialog
        open={dialog === "reactivar"}
        onClose={() => setDialog(null)}
        onConfirm={async (motivo) => {
          const res = await postJSON(`${base}/reactivar`, motivo ? { motivo } : {});
          setDialog(null);
          toast.success(res.message || "Solicitud reactivada.");
          if (onChanged) await onChanged();
        }}
        title={`Reactivar la solicitud ${quien}`}
        description={`${nombre}: la solicitud vuelve al estado que tenía antes de la baja y se reactiva la cuenta del portal. Las reservas canceladas no se recuperan.`}
        label="Motivo de la reactivación"
        required={false}
        confirmLabel="Reactivar"
        busyLabel="Reactivando…"
        tone="primary"
      />
    </div>
  );
}

function BajaDialog({ open, base, tipo, nombre, onClose, onDone }) {
  const [reservas, setReservas] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setReservas(null);
    setError("");
    getJSON(`${base}/baja`)
      .then((data) => active && setReservas(data.reservas || []))
      .catch((err) => active && setError(err.message || "No se pudieron cargar las reservas."));
    return () => {
      active = false;
    };
  }, [open, base]);

  const otra = tipo === "alumno" ? "empresa" : "alumno";
  return (
    <MotivoDialog
      open={open}
      onClose={onClose}
      onConfirm={async (motivo) => {
        const res = await postJSON(`${base}/baja`, { motivo });
        await onDone(res.message || "Baja registrada.");
      }}
      title={tipo === "alumno" ? "Dar de baja al alumno" : "Dar de baja a la empresa"}
      description={`${nombre} sale del programa en esta convocatoria: su solicitud pasa a «Dada de baja» y su cuenta del portal se desactiva. Se puede deshacer con «Reactivar».`}
      label="Motivo de la baja"
      confirmLabel="Dar de baja"
      busyLabel="Dando de baja…"
      canConfirm={reservas !== null}
    >
      <div className="mb-4 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm">
        <p className="m-0 font-semibold text-charcoal-950">Reservas que se cancelarán</p>
        {error ? (
          <p className="m-0 mt-1 text-red-700">{error}</p>
        ) : reservas === null ? (
          <p className="m-0 mt-1 text-muted">Cargando…</p>
        ) : reservas.length === 0 ? (
          <p className="m-0 mt-1 text-muted">No tiene reservas activas.</p>
        ) : (
          <>
            <ul className="m-0 mt-2 list-none space-y-1 p-0">
              {reservas.map((r) => (
                <li key={r.id_reserva} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-charcoal-800">
                    {tipo === "alumno" ? r.empresa : r.alumno}
                    {r.especialidad && <span className="text-xs text-muted"> · {r.especialidad}</span>}
                  </span>
                  <span className={`text-xs font-medium ${r.estado_reserva === "CONFIRMADA" ? "text-red-700" : "text-muted"}`}>
                    {label("reserva", r.estado_reserva)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="m-0 mt-2 text-xs text-muted">
              Se cancelan con este motivo y se avisa a cada {otra} por correo. Las plazas quedan libres.
            </p>
          </>
        )}
      </div>
    </MotivoDialog>
  );
}
