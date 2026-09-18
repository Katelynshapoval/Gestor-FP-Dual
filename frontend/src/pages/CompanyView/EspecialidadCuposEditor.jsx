import { useState } from "react";
import { putJSON } from "../../utils/api.js";

const n = (value) => Number(value) || 0;

export const warnReducePending = (desde, hasta, pendientesACancelar) =>
  `Al reducir de ${desde} a ${hasta} plazas se cancelarán ${pendientesACancelar} reserva${pendientesACancelar !== 1 ? "s" : ""} pendiente${pendientesACancelar !== 1 ? "s" : ""}. Las reservas confirmadas no se modificarán.`;

const EspecialidadCuposEditor = ({ solicitudId, especialidades = [], onUpdated }) => {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [msg, setMsg] = useState(null);

  const valueFor = (esp) =>
    drafts[esp.id_solicitud_empresa_especialidad] ?? String(esp.cantidad_alumnos ?? 0);

  const applyResult = async (esp, data, extraText) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[esp.id_solicitud_empresa_especialidad];
      return next;
    });
    const cancelled = data.canceladas || [];
    if (cancelled.length) {
      const detail = cancelled
        .map((c) => `#${c.id_reserva} ${c.alumno || ""}`.trim())
        .join(", ");
      const text = `${data.message} ${detail ? `(${detail})` : ""}`.trim();
      window.alert(text);
      setMsg({ ok: "warn", text });
    } else {
      setMsg({ ok: true, text: extraText || data.message || "Número de plazas actualizado." });
    }
    if (onUpdated) await onUpdated();
  };

  const save = async (esp, confirmar = false) => {
    const idOferta = esp.id_solicitud_empresa_especialidad;
    const cantidad = Number(valueFor(esp));
    if (!Number.isInteger(cantidad) || cantidad < 0) {
      setMsg({ ok: false, text: "Indica un número entero de plazas mayor o igual que 0." });
      return;
    }

    const actual = n(esp.cantidad_alumnos);
    const ocupadas = n(esp.plazas_ocupadas);
    const confirmadas = n(esp.plazas_confirmadas);

    if (cantidad < confirmadas) {
      setMsg({
        ok: false,
        text: "No se puede reducir el número de plazas por debajo de los alumnos ya confirmados. Cancela o reasigna primero las reservas confirmadas desde administración.",
      });
      return;
    }

    if (!confirmar && cantidad < ocupadas) {
      const nCancelar = ocupadas - cantidad;
      if (!window.confirm(warnReducePending(actual, cantidad, nCancelar))) return;
      confirmar = true;
    }

    setSavingId(idOferta);
    setMsg(null);
    try {
      const data = await putJSON(
        `/solicitudes/empresa/${solicitudId}/especialidades/${idOferta}/cantidad`,
        { cantidad, confirmar_cancelaciones: confirmar }
      );
      await applyResult(esp, data);
    } catch (err) {
      if (err.status === 409 && err.body?.requires_confirm) {
        const aviso = err.body.error || warnReducePending(
          err.body.cantidad_actual,
          err.body.cantidad_nueva,
          err.body.cancelar_pendientes
        );
        if (window.confirm(aviso)) {
          try {
            const data = await putJSON(
              `/solicitudes/empresa/${solicitudId}/especialidades/${idOferta}/cantidad`,
              { cantidad, confirmar_cancelaciones: true }
            );
            await applyResult(esp, data);
          } catch (retryErr) {
            setMsg({ ok: false, text: retryErr.message || "Error al actualizar las plazas." });
          }
        }
      } else {
        setMsg({ ok: false, text: err.message || "Error al actualizar las plazas." });
      }
    } finally {
      setSavingId(null);
    }
  };

  if (!especialidades.length) {
    return <p className="text-gray-500 text-sm">Sin datos</p>;
  }

  return (
    <div className="space-y-3">
      <p className="field-hint">
        Puedes cambiar el número de alumnos solicitados de inmediato. No pasa por la revisión de datos de empresa.
      </p>
      {msg && (
        <p className={`text-sm px-4 py-2 rounded-lg ${
          msg.ok === "warn"
            ? "bg-amber-50 border border-amber-200 text-amber-900"
            : msg.ok
            ? "bg-green-50 border border-green-200 text-green-800"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {msg.text}
        </p>
      )}
      {especialidades.map((esp) => {
        const idOferta = esp.id_solicitud_empresa_especialidad;
        const ocupadas = n(esp.plazas_ocupadas);
        const confirmadas = n(esp.plazas_confirmadas);
        const disponibles = n(esp.plazas_disponibles);
        const saving = savingId === idOferta;
        return (
          <div key={idOferta || esp.id_especialidad} className="rounded-lg border bg-gray-50 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">{esp.nombre || `ID ${esp.id_especialidad}`}</p>
                <p className="text-xs text-gray-500">
                  Ocupadas {ocupadas} · Confirmadas {confirmadas} · Disponibles {disponibles}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-600 whitespace-nowrap" htmlFor={`cupo-${idOferta}`}>
                  Alumnos
                </label>
                <input
                  id={`cupo-${idOferta}`}
                  type="number"
                  min="0"
                  step="1"
                  className="input w-20 py-1"
                  value={valueFor(esp)}
                  disabled={saving}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [idOferta]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className={`btn btn-primary btn-sm shadow-none ${saving ? "btn-disabled" : ""}`}
                  disabled={saving || Number(valueFor(esp)) === n(esp.cantidad_alumnos)}
                  onClick={() => save(esp)}
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EspecialidadCuposEditor;
