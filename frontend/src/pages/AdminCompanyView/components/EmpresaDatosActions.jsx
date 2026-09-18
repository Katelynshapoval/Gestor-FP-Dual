import { useEffect, useState } from "react";
import { getJSON, postJSON, putJSON } from "../../../utils/api.js";
import CompanyEditForm, { datosToForm } from "../../CompanyView/CompanyEditForm.jsx";
import CambioDiff from "../../CompanyView/CambioDiff.jsx";

const EmpresaDatosActions = ({ empresa, transports = [], onUpdated }) => {
  const id = empresa.id_solicitud_empresa;
  const [cambio, setCambio] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [conflict, setConflict] = useState(null);
  const [msg, setMsg] = useState(null);

  const loadCambio = async () => {
    try {
      const data = await getJSON(`/solicitudes/empresa/${id}/cambios`);
      setCambio(data);
    } catch {
      setCambio({ pending: null, ultimo: null });
    }
  };

  useEffect(() => {
    if (empresa.cambio_pendiente) loadCambio();
    else setCambio({ pending: null, ultimo: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, empresa.cambio_pendiente, empresa.id_cambio_pendiente]);

  const pending = cambio?.pending;

  const startEdit = async () => {
    setMsg(null);
    setConflict(null);
    try {
      const datos = await getJSON(`/solicitudes/empresa/${id}/datos`);
      setForm(datosToForm(datos));
      setEditing(true);
    } catch (err) {
      setMsg({ ok: false, text: err.message || "No se pudieron cargar los datos." });
    }
  };

  const handleDirectSave = async (body) => {
    if (submitting) return;
    setSubmitting(true);
    setMsg(null);
    try {
      await putJSON(`/solicitudes/empresa/${id}/datos`, body);
      setEditing(false);
      setForm(null);
      setMsg({ ok: true, text: "Datos actualizados." });
      if (onUpdated) onUpdated();
      await loadCambio();
    } catch (err) {
      setMsg({ ok: false, text: err.message || "Error al guardar." });
    } finally {
      setSubmitting(false);
    }
  };

  const aprobar = async (confirmar = false) => {
    if (!pending || submitting) return;
    setSubmitting(true);
    setMsg(null);
    try {
      await postJSON(`/solicitudes/empresa/${id}/cambios/${pending.id_cambio}/aprobar`, {
        confirmar_conflicto: confirmar,
      });
      setConflict(null);
      setMsg({ ok: true, text: "Cambios aprobados y aplicados." });
      if (onUpdated) onUpdated();
      await loadCambio();
    } catch (err) {
      if (err.status === 409 && err.body?.requires_confirm) {
        setConflict(err.body);
      } else {
        setMsg({ ok: false, text: err.message || "Error al aprobar." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const rechazar = async () => {
    if (!pending || submitting) return;
    if (!motivo.trim()) {
      setMsg({ ok: false, text: "Indica el motivo del rechazo." });
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      await postJSON(`/solicitudes/empresa/${id}/cambios/${pending.id_cambio}/rechazar`, {
        motivo: motivo.trim(),
      });
      setMotivo("");
      setConflict(null);
      setMsg({ ok: true, text: "Solicitud de cambio rechazada." });
      if (onUpdated) onUpdated();
      await loadCambio();
    } catch (err) {
      setMsg({ ok: false, text: err.message || "Error al rechazar." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {msg && (
        <p className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {msg.text}
        </p>
      )}

      {pending && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-900">La empresa ha solicitado cambios</p>
          <p className="text-xs text-amber-800">Actual → Solicitado</p>
          <CambioDiff diff={pending.diff} />

          {conflict && (
            <div className="rounded-md border border-red-200 bg-white p-3 space-y-2">
              <p className="text-sm font-semibold text-red-800">{conflict.error}</p>
              <p className="text-xs text-gray-600">
                Los datos vigentes han cambiado desde que la empresa envió la solicitud. Si apruebas, se aplicarán los valores solicitados sobre los datos actuales.
              </p>
              <ul className="text-xs text-gray-700 list-disc pl-4">
                {(conflict.conflictos || []).map((c) => (
                  <li key={c.field}>
                    {c.label}: original «{c.original || "—"}» → ahora «{c.actual || "—"}» (solicita «{c.solicitado || "—"}»)
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-800"
                disabled={submitting}
                onClick={() => aprobar(true)}
              >
                Aplicar igualmente
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <button
              type="button"
              className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm text-green-800"
              disabled={submitting}
              onClick={() => aprobar(false)}
            >
              Aprobar
            </button>
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600">Motivo del rechazo</label>
              <input
                className="input mt-1"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Obligatorio para rechazar"
              />
            </div>
            <button
              type="button"
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-800"
              disabled={submitting}
              onClick={rechazar}
            >
              Rechazar
            </button>
          </div>
        </div>
      )}

      {empresa.convocatoria_activa && !editing && (
        <button
          type="button"
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          onClick={startEdit}
        >
          Editar
        </button>
      )}

      {editing && form && (
        <div className="rounded-lg border border-surface-200 bg-white p-4">
          <p className="text-sm font-semibold mb-3">Edición directa (sin aprobación)</p>
          <CompanyEditForm
            key={`admin-${id}`}
            values={form}
            onChange={setForm}
            allowCif
            transports={transports}
            submitting={submitting}
            submitLabel="Guardar cambios"
            onSubmit={handleDirectSave}
            onCancel={() => { setEditing(false); setForm(null); }}
          />
        </div>
      )}
    </div>
  );
};

export default EmpresaDatosActions;
