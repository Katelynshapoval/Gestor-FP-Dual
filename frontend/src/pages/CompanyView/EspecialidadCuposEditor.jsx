import { useState } from "react";
import { postJSON, putJSON } from "../../utils/api.js";
import { warnReducePending } from "../../utils/cupos.js";
import { useConfirm, useToast } from "../../components/feedback/ToastProvider.jsx";
import InlineNotice from "../../components/ui/InlineNotice.jsx";

const n = (value) => Number(value) || 0;

const espId = (esp) => Number(esp.id_especialidad ?? esp.idEspecialidad);

const turnoLabel = (turnoRaw) => {
  if (turnoRaw === 0 || turnoRaw === "0" || turnoRaw === "DIURNO") return null;
  if (turnoRaw === 1 || turnoRaw === "1" || turnoRaw === "VESPERTINO")
    return "Vespertino";
  return null;
};

const cicloLabel = (esp) => {
  const nombre = esp.nombre || esp.nombreEsp || `ID ${espId(esp)}`;
  const codigo = esp.codigo ? ` (${esp.codigo})` : "";
  const turno = turnoLabel(esp.turno);
  return `${nombre}${codigo}${turno ? ` · ${turno}` : ""}`;
};

const countChanged = (raw, saved) => {
  const text = String(raw ?? "").trim();
  if (text === "") return n(saved) !== 0;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return true;
  return parsed !== n(saved);
};

const EspecialidadCuposEditor = ({
  solicitudId,
  especialidades = [],
  catalogo = [],
  onUpdated,
  canEdit = true,
}) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [drafts, setDrafts] = useState({});
  const [adding, setAdding] = useState(false);
  const [newEspId, setNewEspId] = useState("");
  const [newCantidad, setNewCantidad] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [fieldError, setFieldError] = useState("");

  const valueFor = (esp) =>
    drafts[esp.id_solicitud_empresa_especialidad] ??
    String(esp.cantidad_alumnos ?? 0);

  const ownedIds = new Set(especialidades.map((esp) => espId(esp)));
  const missing = catalogo.filter((esp) => !ownedIds.has(espId(esp)));

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
      toast.warning(text);
    } else {
      toast.success(extraText || data.message || "Número de plazas actualizado.");
    }
    if (onUpdated) await onUpdated();
  };

  const save = async (esp, confirmar = false) => {
    const idOferta = esp.id_solicitud_empresa_especialidad;
    const cantidad = Number(valueFor(esp));
    if (!Number.isInteger(cantidad) || cantidad < 0) {
      setFieldError("Indica un número entero de plazas mayor o igual que 0.");
      return;
    }

    const actual = n(esp.cantidad_alumnos);
    const ocupadas = n(esp.plazas_ocupadas);
    const confirmadas = n(esp.plazas_confirmadas);

    if (cantidad < confirmadas) {
      setFieldError(
        "No se puede reducir el número de plazas por debajo de los alumnos ya confirmados. Cancela o reasigna primero las reservas confirmadas desde administración.",
      );
      return;
    }

    if (!confirmar && cantidad < ocupadas) {
      const nCancelar = ocupadas - cantidad;
      const accepted = await confirm({
        title: "Reducir plazas",
        message: warnReducePending(actual, cantidad, nCancelar),
        confirmLabel: "Reducir plazas",
      });
      if (!accepted) return;
      confirmar = true;
    }

    setSavingId(idOferta);
    setFieldError("");
    try {
      const data = await putJSON(
        `/solicitudes/empresa/${solicitudId}/especialidades/${idOferta}/cantidad`,
        { cantidad, confirmar_cancelaciones: confirmar },
      );
      await applyResult(esp, data);
    } catch (err) {
      if (err.status === 409 && err.body?.requires_confirm) {
        const aviso =
          err.body.error ||
          warnReducePending(
            err.body.cantidad_actual,
            err.body.cantidad_nueva,
            err.body.cancelar_pendientes,
          );
        const accepted = await confirm({
          title: "Reducir plazas",
          message: aviso,
          confirmLabel: "Reducir plazas",
        });
        if (accepted) {
          try {
            const data = await putJSON(
              `/solicitudes/empresa/${solicitudId}/especialidades/${idOferta}/cantidad`,
              { cantidad, confirmar_cancelaciones: true },
            );
            await applyResult(esp, data);
          } catch (retryErr) {
            toast.error(retryErr.message || "Error al actualizar las plazas.");
          }
        }
      } else {
        toast.error(err.message || "Error al actualizar las plazas.");
      }
    } finally {
      setSavingId(null);
    }
  };

  const cancelAdd = () => {
    setAdding(false);
    setNewEspId("");
    setNewCantidad("");
  };

  const add = async () => {
    const id = Number(newEspId);
    const raw = String(newCantidad).trim();
    const cantidad = Number(raw);
    if (!missing.some((esp) => espId(esp) === id)) {
      setFieldError("Selecciona un ciclo que aún no esté en la solicitud.");
      return;
    }
    if (raw === "" || !Number.isInteger(cantidad) || cantidad < 1) {
      setFieldError("Indica al menos un alumno para añadir el ciclo.");
      return;
    }

    setSavingId("new");
    setFieldError("");
    try {
      const data = await postJSON(
        `/solicitudes/empresa/${solicitudId}/especialidades`,
        { id_especialidad: id, cantidad },
      );
      cancelAdd();
      toast.success(data.message || "Ciclo añadido.");
      if (onUpdated) await onUpdated();
    } catch (err) {
      toast.error(err.message || "Error al añadir el ciclo.");
    } finally {
      setSavingId(null);
    }
  };

  const savingNew = savingId === "new";

  if (!especialidades.length && !missing.length) {
    return <p className="text-gray-500 text-sm">Sin datos</p>;
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <p className="field-hint">
          Puedes cambiar el número de alumnos de un ciclo, o añadir uno que no
          estuviera en la solicitud. El cambio se aplica de inmediato y no pasa
          por la revisión de datos de empresa.
        </p>
      )}
      <InlineNotice tone="error">{fieldError}</InlineNotice>
      {especialidades.map((esp) => {
        const idOferta = esp.id_solicitud_empresa_especialidad;
        const ocupadas = n(esp.plazas_ocupadas);
        const confirmadas = n(esp.plazas_confirmadas);
        const disponibles = n(esp.plazas_disponibles);
        const saving = savingId === idOferta;
        const changed = countChanged(valueFor(esp), esp.cantidad_alumnos);
        return (
          <div
            key={idOferta || esp.id_especialidad}
            className="rounded-lg border bg-gray-50 px-4 py-3"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">{cicloLabel(esp)}</p>
                <p className="text-xs text-gray-500">
                  Ocupadas {ocupadas} · Confirmadas {confirmadas} · Disponibles{" "}
                  {disponibles}
                </p>
              </div>
              {canEdit ? (
                <div className="flex items-center gap-2">
                  <label
                    className="text-xs font-semibold text-gray-600 whitespace-nowrap"
                    htmlFor={`cupo-${idOferta}`}
                  >
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
                      setDrafts((prev) => ({
                        ...prev,
                        [idOferta]: e.target.value,
                      }))
                    }
                  />

                  {changed && (
                    <button
                      type="button"
                      className={`btn btn-primary btn-sm shadow-none ${
                        saving ? "btn-disabled" : ""
                      }`}
                      disabled={saving}
                      onClick={() => save(esp)}
                    >
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full bg-black/5">
                  {esp.cantidad_alumnos}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {canEdit && adding && missing.length > 0 && (
        <div className="rounded-lg border bg-white px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label
                className="mb-1 block text-xs font-semibold text-gray-600"
                htmlFor="nuevo-ciclo"
              >
                Ciclo
              </label>
              <select
                id="nuevo-ciclo"
                className="select-input py-1"
                value={newEspId}
                disabled={savingNew}
                onChange={(e) => setNewEspId(e.target.value)}
              >
                <option value="">Selecciona un ciclo</option>
                {missing.map((esp) => (
                  <option key={espId(esp)} value={espId(esp)}>
                    {cicloLabel(esp)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-semibold text-gray-600"
                htmlFor="nuevo-ciclo-alumnos"
              >
                Alumnos
              </label>
              <input
                id="nuevo-ciclo-alumnos"
                type="number"
                min="1"
                step="1"
                className="input w-20 py-1"
                value={newCantidad}
                disabled={savingNew}
                onChange={(e) => setNewCantidad(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              {String(newCantidad).trim() !== "" && (
                <button
                  type="button"
                  className={`btn btn-primary btn-sm shadow-none ${savingNew ? "btn-disabled" : ""}`}
                  disabled={savingNew}
                  onClick={add}
                >
                  {savingNew ? "Guardando…" : "Guardar"}
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm shadow-none"
                disabled={savingNew}
                onClick={cancelAdd}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {canEdit && missing.length > 0 && (
        <button
          type="button"
          className="w-full rounded-lg border border-dashed border-gray-300 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 hover:border-brand-300 hover:bg-brand-50 disabled:cursor-default disabled:hover:border-gray-300 disabled:hover:bg-white"
          disabled={adding}
          onClick={() => setAdding(true)}
        >
          Añadir ciclo
        </button>
      )}
    </div>
  );
};

export default EspecialidadCuposEditor;
