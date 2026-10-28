import { useEffect, useState } from "react";
import { getJSON, postJSON, putJSON } from "../../../../utils/api.js";
import AlumnoEditForm, { datosToAlumnoForm } from "../../../StudentMain/AlumnoEditForm.jsx";
import CambioDiff from "../../../CompanyView/CambioDiff.jsx";
import Modal from "../../../../components/ui/Modal.jsx";
import MotivoDialog from "../../../../components/ui/MotivoDialog.jsx";
import InlineNotice from "../../../../components/ui/InlineNotice.jsx";
import { useConfirm, useToast } from "../../../../components/feedback/ToastProvider.jsx";
import { label } from "../../../../utils/labels.js";

// Administración, on a student card (same layout as EmpresaDatosActions):
// - the student's pending change request, with Aprobar / Rechazar;
// - the direct edit (no approval), in a dialog. The ciclo is locked while the application
//   has pending or confirmed reservations, which can be cancelled from here.
const AlumnoDatosActions = ({ r, onUpdated, editSignal = 0, onEditHandled, onEditingChange, mostrarPendiente = true }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const id = r.id_solicitud_alumno;
  const [cambio, setCambio] = useState(null);
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState(null);
  const [inicial, setInicial] = useState(null);
  const [errores, setErrores] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [motivoError, setMotivoError] = useState("");
  const [conflict, setConflict] = useState(null);
  const [cancelando, setCancelando] = useState(null);
  const editing = Boolean(form);

  const loadCambio = async () => {
    try {
      setCambio(await getJSON(`/solicitudes/alumno/${id}/cambios`));
    } catch {
      setCambio({ pending: null, ultimo: null });
    }
  };

  useEffect(() => {
    if (r.id_cambio_pendiente && mostrarPendiente) loadCambio();
    else setCambio({ pending: null, ultimo: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, r.id_cambio_pendiente, mostrarPendiente]);

  const pending = cambio?.pending;

  const setEditing = (value) => {
    if (!value) {
      setForm(null);
      setErrores({});
    }
    onEditingChange?.(value);
  };

  const loadDatos = async () => {
    const data = await getJSON(`/solicitudes/alumno/${id}/datos`);
    setInfo(data);
    return data;
  };

  const startEdit = async () => {
    try {
      const data = await loadDatos();
      if (!data.editable) {
        toast.error(data.motivo_no_editable);
        return;
      }
      const f = datosToAlumnoForm(data.datos);
      setInicial(f);
      setForm(f);
      setErrores({});
      setEditing(true);
    } catch (err) {
      toast.error(err.message || "No se pudieron cargar los datos.");
    }
  };

  useEffect(() => {
    if (!editSignal) return;
    startEdit();
    onEditHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSignal]);

  const handleDirectSave = async (body) => {
    if (submitting) return;
    if (body.id_especialidad && String(body.id_especialidad) !== inicial.id_especialidad) {
      const ok = await confirm({
        title: "Cambiar el ciclo",
        message: "Se cambiará el ciclo de la solicitud, se sustituirán las preferencias y se avisará al alumno por correo.",
        confirmLabel: "Cambiar ciclo",
        tone: "primary",
      });
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      await putJSON(`/solicitudes/alumno/${id}/datos`, body);
      setEditing(false);
      toast.success("Datos actualizados.");
      onUpdated?.();
      await loadCambio();
    } catch (err) {
      if (err.body?.errores) setErrores(err.body.errores);
      if (err.body?.reservas) setInfo((i) => ({ ...i, reservas_activas: err.body.reservas }));
      toast.error(err.message || "Error al guardar.");
    } finally {
      setSubmitting(false);
    }
  };

  const aprobar = async (confirmar = false) => {
    if (!pending || submitting) return;
    setSubmitting(true);
    try {
      await postJSON(`/solicitudes/alumno/${id}/cambios/${pending.id_cambio}/aprobar`, {
        confirmar_conflicto: confirmar,
      });
      setConflict(null);
      toast.success("Cambios aprobados y aplicados.");
      onUpdated?.();
      await loadCambio();
    } catch (err) {
      if (err.status === 409 && err.body?.requires_confirm) setConflict(err.body);
      else toast.error(err.message || "Error al aprobar.");
    } finally {
      setSubmitting(false);
    }
  };

  const rechazar = async () => {
    if (!pending || submitting) return;
    if (!motivo.trim()) {
      setMotivoError("Indica el motivo del rechazo.");
      return;
    }
    setSubmitting(true);
    setMotivoError("");
    try {
      await postJSON(`/solicitudes/alumno/${id}/cambios/${pending.id_cambio}/rechazar`, { motivo: motivo.trim() });
      setMotivo("");
      setConflict(null);
      toast.success("Petición de cambio rechazada.");
      onUpdated?.();
      await loadCambio();
    } catch (err) {
      toast.error(err.message || "Error al rechazar.");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelarReserva = async (motivoCancelacion) => {
    await postJSON(`/reservas/${cancelando.id_reserva}/cancelar-admin`, { motivo: motivoCancelacion });
    toast.success("Reserva cancelada.");
    setCancelando(null);
    await loadDatos();
    onUpdated?.();
  };

  const reservas = info?.reservas_activas || [];

  return (
    <div className="space-y-4">
      {mostrarPendiente && pending && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-900">El alumno ha pedido corregir sus datos</p>
          <p className="text-xs text-amber-800">Actual → Solicitado</p>
          <CambioDiff diff={pending.diff} />

          {conflict && (
            <div className="rounded-md border border-red-200 bg-white p-3 space-y-2">
              <p className="text-sm font-semibold text-red-800">{conflict.error}</p>
              <p className="text-xs text-muted">
                Alguien del centro ha cambiado estos datos desde que el alumno envió la petición. Si apruebas, se
                aplicarán los valores solicitados sobre los datos actuales.
              </p>
              <ul className="text-xs text-charcoal-700 list-disc pl-4">
                {(conflict.conflictos || []).map((c) => (
                  <li key={c.field}>
                    {c.label}: original «{c.original}» → ahora «{c.actual}» (solicita «{c.solicitado}»)
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
              <label htmlFor={`motivo-cambio-alumno-${id}`} className="text-xs font-semibold text-muted">
                Motivo del rechazo
              </label>
              <input
                id={`motivo-cambio-alumno-${id}`}
                className="input mt-1"
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  if (motivoError) setMotivoError("");
                }}
                placeholder="Obligatorio para rechazar"
              />
              <InlineNotice tone="error" className="mt-2">{motivoError}</InlineNotice>
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

      <Modal
        open={editing && Boolean(info)}
        onClose={() => setEditing(false)}
        title={`Editar datos · ${r.nombre}`}
        description="Edición directa (sin aprobación). El DNI/NIE no se puede modificar."
        size="xl"
        busy={submitting}
      >
        {editing && info && (
          <>
          <InlineNotice tone="info" className="mb-6">
            Los documentos ya generados (convenio, anexos) conservan los datos anteriores. Si alguno depende de estos
            datos, vuelve a generarlo.
          </InlineNotice>
          <AlumnoEditForm
            key={`admin-${id}`}
            values={form}
            onChange={setForm}
            inicial={inicial}
            dni={info.dni}
            errores={errores}
            cicloActualNombre={r.especialidad}
            cicloBloqueado={reservas.length > 0}
            cicloAviso={
              reservas.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <p className="mb-3 font-semibold">
                    El ciclo no se puede cambiar mientras el alumno tenga reservas pendientes o confirmadas.
                  </p>
                  <ul className="space-y-2">
                    {reservas.map((rv) => (
                      <li key={rv.id_reserva} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {rv.empresa} · {rv.especialidad} · {label("reserva", rv.estado_reserva)}
                        </span>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setCancelando(rv)}>
                          Cancelar reserva
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            }
            submitting={submitting}
            submitLabel="Guardar cambios"
            onSubmit={handleDirectSave}
            onCancel={() => setEditing(false)}
          />
          </>
        )}
      </Modal>

      <MotivoDialog
        open={Boolean(cancelando)}
        onClose={() => setCancelando(null)}
        onConfirm={cancelarReserva}
        title="Cancelar reserva"
        description={cancelando ? `Se cancelará la reserva con ${cancelando.empresa}. Se avisará al alumno y a la empresa.` : ""}
        label="Motivo de la cancelación"
        confirmLabel="Cancelar reserva"
        busyLabel="Cancelando…"
      />
    </div>
  );
};

export default AlumnoDatosActions;
