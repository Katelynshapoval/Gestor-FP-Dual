import { useEffect, useMemo, useState } from "react";
import { getJSON, patchJSON } from "../utils/api.js";
import { useToast } from "./feedback/ToastProvider.jsx";

/**
 * Tutor selector for a pending/confirmed reservation.
 * Options: active tutors of the reservation's company (+ current inactive if assigned).
 */
const TutorAssignSelect = ({
  idReserva,
  idEmpresa,
  idEmpresaTutor,
  tutorNombre,
  onAssigned,
  className = "",
}) => {
  const toast = useToast();
  const [tutores, setTutores] = useState([]);
  const [value, setValue] = useState(
    idEmpresaTutor != null ? String(idEmpresaTutor) : "",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(idEmpresaTutor != null ? String(idEmpresaTutor) : "");
  }, [idEmpresaTutor, idReserva]);

  useEffect(() => {
    if (!idEmpresa) {
      setTutores([]);
      return;
    }
    let cancelled = false;
    getJSON(`/tutores/empresa/${idEmpresa}?activo=1`)
      .then((data) => {
        if (!cancelled) setTutores(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setTutores([]);
      });
    return () => {
      cancelled = true;
    };
  }, [idEmpresa]);

  const options = useMemo(() => {
    const list = [...tutores];
    if (
      idEmpresaTutor != null &&
      !list.some((t) => Number(t.id_empresa_tutor) === Number(idEmpresaTutor))
    ) {
      list.unshift({
        id_empresa_tutor: idEmpresaTutor,
        nombre: tutorNombre || `Tutor #${idEmpresaTutor}`,
        activo: 0,
        _historical: true,
      });
    }
    return list;
  }, [tutores, idEmpresaTutor, tutorNombre]);

  const handleChange = async (next) => {
    const prev = value;
    setValue(next);
    setSaving(true);
    try {
      const body = {
        id_empresa_tutor: next === "" ? null : Number(next),
      };
      const updated = await patchJSON(`/reservas/${idReserva}/tutor`, body);
      toast.success(next === "" ? "Tutor retirado de la reserva." : "Tutor asignado.");
      if (onAssigned) onAssigned(updated);
    } catch (err) {
      setValue(prev);
      toast.error(err.message || "No se pudo actualizar el tutor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5 ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-muted">
          Tutor de empresa
        </span>
        <select
          className="select-input w-full py-2 text-sm sm:flex-1"
          value={value}
          disabled={saving || !idEmpresa}
          onChange={(e) => handleChange(e.target.value)}
        >
          <option value="">Sin tutor asignado</option>
          {options.map((t) => (
            <option
              key={t.id_empresa_tutor}
              value={t.id_empresa_tutor}
              disabled={t._historical}
            >
              {t.nombre}
              {t._historical ? " (inactivo)" : ""}
            </option>
          ))}
        </select>
      </div>
      {saving && <p className="mt-1.5 text-xs text-muted">Guardando…</p>}
    </div>
  );
};

export default TutorAssignSelect;
