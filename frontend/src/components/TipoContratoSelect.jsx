import { useEffect, useState } from "react";
import { getJSON, postJSON } from "../utils/api.js";
import { useConfirm, useToast } from "./feedback/ToastProvider.jsx";

// One request per page load for the contract-type catalogue.
let tiposPromise = null;
export function loadTiposContrato() {
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
export const familiaAnexo = (t) => (/beca/i.test(`${t.nombre || ""} ${t.nombre_mostrar || ""}`) ? "ANEXO_III" : "ANEXO_II");

// `familiaFija` (D2): once an annex of one family is under review or validated,
// types of the other family are shown disabled (the backend refuses them too).
// `bare` drops the grey box when the caller already frames it (ReservaDetalle).
const TipoContratoSelect = ({ idReserva, idTipoContrato, onSaved, familiaFija = null, permitirForzar = false, labelOculto = false, bare = false, className = "" }) => {
  const toast = useToast();
  const confirm = useConfirm();
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
    const tipo = tipos.find((t) => String(t.id_tipo_contrato) === next);
    const forzar = Boolean(familiaFija) && permitirForzar && tipo && familiaAnexo(tipo) !== familiaFija;
    if (forzar) {
      const aceptado = await confirm({
        title: "Cambiar el tipo de contrato",
        message: `El documento actual (${familiaFija === "ANEXO_II" ? "Anexo II" : "Anexo III"}) se retira, con sus firmas, y se guarda en el historial. Habrá que generar el ${familiaFija === "ANEXO_II" ? "Anexo III" : "Anexo II"} y volver a firmarlo todas las partes: empresa, centro y alumno.`,
        confirmLabel: "Cambiar y rehacer firmas",
      });
      if (!aceptado) return;
    }
    setValue(next);
    setSaving(true);
    try {
      await postJSON(`/reservas/${idReserva}/tipo-contrato`, {
        id_tipo_contrato: Number(next),
        ...(forzar ? { forzar: true } : {}),
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
    <div className={bare ? className : `rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5 ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label
          htmlFor={selectId}
          className={labelOculto ? "sr-only" : "shrink-0 text-xs font-semibold uppercase tracking-widest text-muted"}
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
            const bloqueado = Boolean(familiaFija) && !permitirForzar && familiaAnexo(t) !== familiaFija;
            const rehace = Boolean(familiaFija) && permitirForzar && familiaAnexo(t) !== familiaFija;
            return (
              <option key={t.id_tipo_contrato} value={t.id_tipo_contrato} disabled={bloqueado}>
                {t.nombre_mostrar || t.nombre}
                {bloqueado ? " (no disponible)" : rehace ? " (rehace las firmas)" : ""}
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
