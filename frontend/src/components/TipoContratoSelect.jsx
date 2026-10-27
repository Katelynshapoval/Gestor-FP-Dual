import { useEffect, useState } from "react";
import { getJSON, postJSON } from "../utils/api.js";
import { useToast } from "./feedback/ToastProvider.jsx";

// One request per page load for the contract-type catalogue.
let tiposPromise = null;
function loadTiposContrato() {
  if (!tiposPromise) {
    tiposPromise = getJSON("/tiposContrato")
      .then((rows) => (Array.isArray(rows) ? rows : []))
      .catch((err) => {
        tiposPromise = null;
        throw err;
      });
  }
  return tiposPromise;
}

/**
 * Contract-type selector for a pending reservation (WF-1).
 * Beca → Anexo III; any other type → Anexo II. Saving uses the existing
 * POST /reservas/:id/tipo-contrato endpoint (staff only).
 */
// Annex family of a contract type: Beca → Anexo III, any other → Anexo II.
const familia = (t) => (/beca/i.test(`${t.nombre || ""} ${t.nombre_mostrar || ""}`) ? "ANEXO_III" : "ANEXO_II");

// `familiaFija` (D2): once an annex of one family is under review or validated,
// types of the other family are shown disabled (the backend refuses them too).
const TipoContratoSelect = ({ idReserva, idTipoContrato, onSaved, familiaFija = null, className = "" }) => {
  const toast = useToast();
  const [tipos, setTipos] = useState([]);
  const [value, setValue] = useState(idTipoContrato != null ? String(idTipoContrato) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(idTipoContrato != null ? String(idTipoContrato) : "");
  }, [idTipoContrato, idReserva]);

  useEffect(() => {
    let cancelled = false;
    loadTiposContrato()
      .then((rows) => {
        if (!cancelled) setTipos(rows);
      })
      .catch(() => {
        if (!cancelled) setTipos([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = async (next) => {
    if (!next || next === value) return;
    const prev = value;
    setValue(next);
    setSaving(true);
    try {
      await postJSON(`/reservas/${idReserva}/tipo-contrato`, {
        id_tipo_contrato: Number(next),
      });
      toast.success("Tipo de contrato guardado. Ya puede subirse o generarse el Anexo II o III correspondiente.");
      if (onSaved) await onSaved();
    } catch (err) {
      setValue(prev);
      toast.error(err.message || "No se pudo guardar el tipo de contrato.");
    } finally {
      setSaving(false);
    }
  };

  const selectId = `tipo-contrato-${idReserva}`;

  return (
    <div className={`rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5 ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label
          htmlFor={selectId}
          className="shrink-0 text-xs font-semibold uppercase tracking-widest text-muted"
        >
          Tipo de contrato
        </label>
        <select
          id={selectId}
          className="select-input w-full py-2 text-sm sm:flex-1"
          value={value}
          disabled={saving}
          onChange={(e) => handleChange(e.target.value)}
        >
          <option value="" disabled>
            Sin indicar
          </option>
          {tipos.map((t) => {
            const bloqueado = Boolean(familiaFija) && familia(t) !== familiaFija;
            return (
              <option key={t.id_tipo_contrato} value={t.id_tipo_contrato} disabled={bloqueado}>
                {t.nombre_mostrar || t.nombre}
                {bloqueado ? " (no disponible)" : ""}
              </option>
            );
          })}
        </select>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {saving
          ? "Guardando…"
          : value
            ? "Beca activa el Anexo III; el resto activa el Anexo II."
            : "Indica el tipo de contrato para activar el Anexo II o III."}
      </p>
    </div>
  );
};

export default TipoContratoSelect;
