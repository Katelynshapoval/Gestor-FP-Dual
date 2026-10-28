import { useCallback, useEffect, useState } from "react";
import EstadoBadge from "../../components/ui/EstadoBadge.jsx";
import ReadField from "../../components/ui/ReadField.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";
import { getJSON, postJSON } from "../../utils/api.js";
import { formatFecha as formatDate } from "../../utils/fechas.js";
import InlineNotice from "../../components/ui/InlineNotice.jsx";
import EditDialog, { countChanges } from "../../components/forms/EditDialog.jsx";
import CambioDiff from "../CompanyView/CambioDiff.jsx";
import AlumnoEditForm, { ALUMNO_SECTIONS, applyPropuesta, datosToAlumnoForm } from "./AlumnoEditForm.jsx";

// The student's application and data. Corrections are sent to the centre for
// review (same flow as companies): nothing changes until Administración
// approves. The DNI/NIE cannot be changed.
export default function MisDatos({ solicitud, onChanged }) {
  const toast = useToast();
  const [misDatos, setMisDatos] = useState(null);
  const [form, setForm] = useState(null);
  const [inicial, setInicial] = useState(null);
  // What the dialog opened with (the pending request, if any), to count changes.
  const [base, setBase] = useState(null);
  const [errores, setErrores] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setMisDatos(await getJSON("/solicitudes/alumno/mia/datos"));
    } catch {
      setMisDatos(null);
    }
  }, []);

  useEffect(() => {
    if (solicitud) load();
  }, [solicitud, load]);

  const pending = misDatos?.pending;
  const rejected = !pending && misDatos?.ultimo?.estado === "RECHAZADO" ? misDatos.ultimo : null;
  const editing = Boolean(form);

  const startEdit = () => {
    const f = pending ? applyPropuesta(misDatos.datos, pending.propuesta) : datosToAlumnoForm(misDatos.datos);
    setInicial(datosToAlumnoForm(misDatos.datos));
    setBase(f);
    setForm(f);
    setErrores({});
  };

  const enviar = async (body) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const data = await postJSON("/solicitudes/alumno/mia/cambios", body);
      setForm(null);
      toast.success(data.message || "Cambios enviados para revisión.");
      await load();
      onChanged?.();
    } catch (err) {
      if (err.body?.errores) setErrores(err.body.errores);
      toast.error(err.message || "Error al enviar los cambios.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!solicitud) {
    return (
      <div className="form-card">
        <h2 className="form-section-title">Mi solicitud</h2>
        <p className="text-sm text-muted">No hay una solicitud Dual asociada a tu cuenta.</p>
      </div>
    );
  }

  return (
    <>
      <div className="form-card">
        <h2 className="form-section-title">Mi solicitud</h2>
        <div className="mb-5">
          <EstadoBadge kind="solicitud" value={solicitud?.estado_validacion} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ReadField label="Nombre" value={solicitud.nombre} />
          <ReadField label="DNI / NIE" value={solicitud.dni} />
          <ReadField label="Especialidad" value={solicitud.especialidad} />
          <ReadField label="Convocatoria" value={solicitud.convocatoria} />
          <ReadField label="Fecha de solicitud" value={formatDate(solicitud.fecha_solicitud)} />
        </div>
        {solicitud.estado_validacion === "RECHAZADO" && solicitud.motivo && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">Motivo</p>
            <p className="mt-1">{solicitud.motivo}</p>
          </div>
        )}
      </div>

      <div className="form-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="form-section-title mb-1">Mis datos</h2>
          <p className="text-sm text-muted">
            {misDatos?.editable === false
              ? misDatos.motivo_no_editable
              : "Si algún dato es incorrecto, pide la corrección. El centro la revisará antes de aplicarla."}
          </p>
        </div>
        {misDatos?.editable && !editing && (
          <button type="button" className="btn btn-primary" onClick={startEdit}>
            {pending ? "Modificar petición pendiente" : "Solicitar corrección"}
          </button>
        )}
      </div>

      {pending && (
        <div className="form-card border-amber-200 bg-amber-50">
          <h2 className="form-section-title text-amber-900">Corrección enviada para revisión</h2>
          <p className="mb-3 text-sm text-amber-800">
            Tu petición está pendiente. Tus datos no cambian hasta que el centro la revise.
          </p>
          <CambioDiff diff={pending.diff} />
        </div>
      )}

      {rejected && (
        <div className="form-card border-red-200 bg-red-50">
          <h2 className="form-section-title text-red-900">Petición de corrección rechazada</h2>
          <p className="text-sm text-red-800">{rejected.motivo || "Sin motivo indicado."}</p>
        </div>
      )}

      <EditDialog
        open={editing}
        onClose={() => setForm(null)}
        title={pending ? "Modificar petición de corrección" : "Solicitar corrección de datos"}
        subject={solicitud.nombre}
        mode="review"
        sections={ALUMNO_SECTIONS}
        notice={
          <InlineNotice tone={pending ? "warning" : "info"}>
            {pending
              ? "Estás modificando tu petición pendiente. Se sustituirá por la nueva."
              : "Cambia solo lo que sea incorrecto. Tus datos no cambian hasta que el centro revise la petición."}
          </InlineNotice>
        }
        formId="corregir-mis-datos"
        submitLabel={pending ? "Actualizar petición" : "Enviar para revisión"}
        submitting={submitting}
        changes={countChanges(base, form)}
      >
        {editing && (
          <AlumnoEditForm
            key={pending?.id_cambio || "new"}
            formId="corregir-mis-datos"
            values={form}
            onChange={setForm}
            inicial={inicial}
            dni={misDatos.dni}
            errores={errores}
            cicloActualNombre={solicitud.especialidad}
            onSubmit={enviar}
          />
        )}
      </EditDialog>
    </>
  );
}
