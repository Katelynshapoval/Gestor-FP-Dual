import { useEffect, useMemo, useState } from "react";
import { getJSON, postJSON } from "../../../utils/api.js";
import { cicloLabel } from "../../../utils/especialidades.js";
import { useConfirm, useToast } from "../../../components/feedback/ToastProvider.jsx";

export default function AsignarAlumnoModal({ solicitudId, onClose, onAssigned }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [ofertas, setOfertas] = useState([]);
  const [ofertaId, setOfertaId] = useState("");
  const [alumnos, setAlumnos] = useState([]);
  const [alumnoId, setAlumnoId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingAlumnos, setLoadingAlumnos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getJSON(`/solicitudes/empresa/${solicitudId}/especialidades`)
      .then((rows) => setOfertas(Array.isArray(rows) ? rows : []))
      .catch((err) => setError(err.message || "No se pudieron cargar los ciclos."))
      .finally(() => setLoading(false));
  }, [solicitudId]);

  useEffect(() => {
    if (!ofertaId) {
      setAlumnos([]);
      setAlumnoId("");
      return undefined;
    }
    let active = true;
    setLoadingAlumnos(true);
    setAlumnoId("");
    getJSON(`/reservas/alumnos-elegibles?id_solicitud_empresa_especialidad=${ofertaId}`)
      .then((rows) => {
        if (active) setAlumnos(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (active) setError(err.message || "No se pudieron cargar los alumnos.");
      })
      .finally(() => {
        if (active) setLoadingAlumnos(false);
      });
    return () => {
      active = false;
    };
  }, [ofertaId]);

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return alumnos;
    return alumnos.filter((alumno) => `${alumno.nombre} ${alumno.dni}`.toLowerCase().includes(q));
  }, [alumnos, query]);

  const assign = async () => {
    const alumno = alumnos.find((item) => String(item.id_solicitud_alumno) === String(alumnoId));
    if (!alumno || !ofertaId) return;
    const accepted = await confirm({
      title: "Asignar alumno",
      message: `Se creará una reserva pendiente de ${alumno.nombre} para este ciclo.`,
      confirmLabel: "Asignar alumno",
      tone: "default",
    });
    if (!accepted) return;
    setBusy(true);
    try {
      await postJSON("/reservas/admin", {
        id_solicitud_alumno: alumno.id_solicitud_alumno,
        id_solicitud_empresa_especialidad: Number(ofertaId),
      });
      toast.success("Alumno asignado a la empresa.");
      if (onAssigned) await onAssigned();
      onClose();
    } catch (err) {
      toast.error(err.message || "No se pudo asignar al alumno.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl2 bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <h3 className="font-semibold text-gray-900">Asignar alumno</h3>
        {loading ? (
          <p className="text-sm text-muted">Cargando ciclos…</p>
        ) : (
          <>
            <label className="block text-xs font-semibold text-gray-600">
              Ciclo
              <select className="select-input mt-1" value={ofertaId} onChange={(event) => setOfertaId(event.target.value)}>
                <option value="">Selecciona un ciclo</option>
                {ofertas.map((oferta) => (
                  <option key={oferta.id_solicitud_empresa_especialidad} value={oferta.id_solicitud_empresa_especialidad} disabled={Number(oferta.plazas_disponibles) <= 0}>
                    {cicloLabel(oferta)} · {Number(oferta.plazas_disponibles) || 0} plazas disponibles
                  </option>
                ))}
              </select>
            </label>
            {ofertaId && (
              <>
                <input className="input" placeholder="Buscar por nombre o DNI" value={query} onChange={(event) => setQuery(event.target.value)} />
                {loadingAlumnos ? (
                  <p className="text-sm text-muted">Cargando alumnos elegibles…</p>
                ) : visibles.length === 0 ? (
                  <p className="text-sm text-muted">No hay alumnos elegibles para este ciclo.</p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {visibles.map((alumno) => (
                      <label key={alumno.id_solicitud_alumno} className="flex gap-3 rounded-lg border border-surface-200 px-3 py-2 text-sm">
                        <input
                          type="radio"
                          name="alumno-elegible"
                          checked={String(alumnoId) === String(alumno.id_solicitud_alumno)}
                          onChange={() => setAlumnoId(alumno.id_solicitud_alumno)}
                        />
                        <span>
                          <span className="font-medium">{alumno.nombre}</span>
                          <span className="mt-0.5 block text-xs text-muted">
                            {[alumno.dni, alumno.especialidad, alumno.convocatoria].filter(Boolean).join(" · ")}
                          </span>
                          {alumno.reserva_actual && (
                            <span className="mt-0.5 block text-xs text-muted">Reserva actual: {alumno.reserva_actual}</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
            {error && <p className="text-sm text-red-700">{error}</p>}
          </>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!alumnoId || busy} onClick={assign}>
            {busy ? "Asignando…" : "Asignar alumno"}
          </button>
        </div>
      </div>
    </div>
  );
}
