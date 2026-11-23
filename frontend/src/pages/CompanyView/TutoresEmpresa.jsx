import { useCallback, useEffect, useState } from "react";
import { getJSON, patchJSON, postJSON } from "../../utils/api.js";
import { useConfirm, useToast } from "../../components/feedback/ToastProvider.jsx";
import { SkeletonRows } from "../../components/ui/Loading.jsx";
import { dniNieValido, normalizarEmail, normalizarTelefono, telefonoValido } from "../../utils/formatValidation.js";

const emptyForm = () => ({
  nombre: "",
  dni: "",
  email: "",
  telefono: "",
  cargo: "TUTOR EMPRESA",
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// What is wrong with the form, field by field (the server checks the same).
function validar(form, tutores, exceptoId = null) {
  const e = {};
  if (!form.nombre.trim()) e.nombre = "El nombre es obligatorio.";
  const email = normalizarEmail(form.email);
  if (!email) e.email = "El email es obligatorio.";
  else if (!EMAIL_RE.test(email)) e.email = "No es un email válido (ej.: nombre@empresa.com).";
  else if (tutores.some((t) => t.id_empresa_tutor !== exceptoId && String(t.email || "").toLowerCase() === email)) {
    e.email = "Ya hay un tutor de esta empresa con ese email.";
  }
  if (!form.telefono.trim()) e.telefono = "El teléfono es obligatorio.";
  else if (!telefonoValido(form.telefono)) e.telefono = "No es un teléfono válido (9 cifras).";
  const dni = form.dni.trim().toUpperCase();
  if (dni) {
    if (!dniNieValido(dni)) e.dni = "No es un DNI/NIE válido (8 números y letra, o X/Y/Z, 7 números y letra).";
    else if (tutores.some((t) => t.id_empresa_tutor !== exceptoId && String(t.dni || "").toUpperCase() === dni)) {
      e.dni = "Ya hay un tutor de esta empresa con ese DNI/NIE.";
    }
  }
  return e;
}

const FieldError = ({ id, message }) =>
  message ? (
    <p id={id} className="mt-1 text-xs text-red-700" role="alert">
      {message}
    </p>
  ) : null;

// The company's tutors. Without idEmpresa it is the company's own portal tab;
// with it, the same list inside the staff company card (Empresas › Tutores).
// The server enforces every rule; the buttons only avoid sending what it
// would refuse (the coordinator's data, deactivating a tutor in use).
const TutoresEmpresa = ({ idEmpresa = null }) => {
  const staff = idEmpresa != null;
  const base = staff ? `/tutores/empresa/${idEmpresa}` : "/tutores/empresa";
  const toast = useToast();
  const confirm = useConfirm();
  const [tutores, setTutores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [editErrors, setEditErrors] = useState({});

  const load = useCallback(async () => {
    try {
      const data = await getJSON(base);
      setTutores(Array.isArray(data) ? data : []);
      setLoadError("");
    } catch (err) {
      setTutores([]);
      setLoadError(err.message || "No se pudieron cargar los tutores.");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (setter, key, value) => {
    setter((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    if (submitting) return;
    const found = validar(form, tutores);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      await postJSON(base, {
        ...form,
        email: normalizarEmail(form.email),
        telefono: normalizarTelefono(form.telefono),
      });
      setForm(emptyForm());
      setErrors({});
      setAdding(false);
      toast.success("Tutor añadido.");
      await load();
    } catch (err) {
      if (err.code === "EMAIL_REPETIDO") setErrors({ email: err.message });
      else if (err.code === "DNI_REPETIDO") setErrors({ dni: err.message });
      else toast.error(err.message || "Error al añadir el tutor.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id_empresa_tutor);
    setEditErrors({});
    setEditForm({
      nombre: t.nombre || "",
      dni: t.dni || "",
      email: t.email || "",
      telefono: t.telefono || "",
      cargo: t.cargo || "",
    });
  };

  const handleUpdate = async () => {
    if (!editingId || submitting) return;
    const found = validar(editForm, tutores, editingId);
    setEditErrors(found);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      await patchJSON(`/tutores/${editingId}`, {
        ...editForm,
        email: normalizarEmail(editForm.email),
        telefono: normalizarTelefono(editForm.telefono),
      });
      setEditingId(null);
      toast.success("Tutor actualizado.");
      await load();
    } catch (err) {
      if (err.code === "EMAIL_REPETIDO") setEditErrors({ email: err.message });
      else if (err.code === "DNI_REPETIDO") setEditErrors({ dni: err.message });
      else toast.error(err.message || "Error al actualizar el tutor.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (t) => {
    const accepted = await confirm({
      title: "Desactivar tutor",
      message: `¿Desactivar a ${t.nombre}? No se podrá asignar a más alumnos; sigue en las reservas antiguas y se puede reactivar.`,
      confirmLabel: "Desactivar",
    });
    if (!accepted) return;
    setSubmitting(true);
    try {
      await postJSON(`/tutores/${t.id_empresa_tutor}/desactivar`, {});
      toast.success("Tutor desactivado.");
      await load();
    } catch (err) {
      toast.error(err.message || "Error al desactivar el tutor.");
      // Someone may have assigned the tutor meanwhile: show the current counts.
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (t) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await postJSON(`/tutores/${t.id_empresa_tutor}/activar`, {});
      toast.success("Tutor reactivado.");
      await load();
    } catch (err) {
      toast.error(err.message || "Error al reactivar el tutor.");
    } finally {
      setSubmitting(false);
    }
  };

  const activos = tutores.filter((t) => Number(t.activo) === 1).length;

  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-surface-200 bg-white shadow-card">
        <SkeletonRows count={3} label="Cargando tutores…" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {staff ? (
        // Inside the staff company card: a slim row like the Reservas tab's,
        // not a second boxed header.
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-sm text-muted">
            {activos} en activo, {tutores.length} en total. Solo los activos se pueden asignar a una reserva.
          </p>
          {!adding && (
            <button type="button" className="btn btn-outline-brand btn-sm shrink-0" onClick={() => setAdding(true)}>
              Añadir tutor
            </button>
          )}
        </div>
      ) : (
        <div className="form-card flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="form-section-title mb-1">Tutores</h2>
            <p className="text-sm text-muted">
              {activos} en activo, {tutores.length} en total. El acceso al portal sigue siendo el CIF; los datos del coordinador principal están en «Datos de la empresa».
            </p>
          </div>
          {!adding && (
            <button type="button" className="btn btn-primary shrink-0" onClick={() => setAdding(true)}>
              Añadir tutor
            </button>
          )}
        </div>
      )}

      {loadError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {loadError}
        </p>
      )}

      {adding && (
        <div className="form-card">
          <h2 className="form-section-title">Nuevo tutor</h2>
          <div className="grid gap-x-4 md:grid-cols-2">
            <div className="field">
              <label htmlFor="new_tutor_nombre">Nombre</label>
              <input id="new_tutor_nombre" className="input" value={form.nombre} onChange={(e) => setField(setForm, "nombre", e.target.value)} maxLength={100} placeholder="Ej.: María López" aria-invalid={errors.nombre ? "true" : undefined} />
            <FieldError message={errors.nombre} />
              </div>
            <div className="field">
              <label htmlFor="new_tutor_dni">DNI / NIE</label>
              <input id="new_tutor_dni" className="input" value={form.dni} onChange={(e) => setField(setForm, "dni", e.target.value.toUpperCase())} maxLength={15} placeholder="Ej.: 12345678Z" aria-invalid={errors.dni ? "true" : undefined} />
            <FieldError message={errors.dni} />
              </div>
            <div className="field">
              <label htmlFor="new_tutor_email">Email</label>
              <input id="new_tutor_email" className="input" type="email" value={form.email} onChange={(e) => setField(setForm, "email", e.target.value)} maxLength={100} placeholder="Ej.: maria@empresa.com" aria-invalid={errors.email ? "true" : undefined} />
            <FieldError message={errors.email} />
              </div>
            <div className="field">
              <label htmlFor="new_tutor_tel">Teléfono</label>
              <input id="new_tutor_tel" className="input" value={form.telefono} onChange={(e) => setField(setForm, "telefono", e.target.value)} maxLength={20} placeholder="Ej.: 976 123 456" aria-invalid={errors.telefono ? "true" : undefined} />
            <FieldError message={errors.telefono} />
              </div>
            <div className="field md:col-span-2">
              <label htmlFor="new_tutor_cargo">Cargo</label>
              <input id="new_tutor_cargo" className="input" value={form.cargo} onChange={(e) => setField(setForm, "cargo", e.target.value)} maxLength={100} placeholder="Ej.: Responsable de formación" aria-invalid={errors.cargo ? "true" : undefined} />
            <FieldError message={errors.cargo} />
              </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setAdding(false);
                setErrors({});
                setForm(emptyForm());
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={`btn btn-outline-brand btn-sm`}
              onClick={handleCreate}
              disabled={submitting}
            >
              {submitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {tutores.length === 0 && !loadError ? (
        <div className="rounded-lg border border-surface-200 bg-white px-6 py-10 text-center shadow-card">
          <p className="text-sm text-muted">Todavía no hay tutores registrados.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tutores.map((t) => {
            const isEditing = editingId === t.id_empresa_tutor;
            const activo = Number(t.activo) === 1;
            // The principal coordinator's data changes only through «Editar datos»
            // (reviewed by the centre; staff use the pencil on the card). Staff may
            // still switch its tutor entry on and off.
            const esCoordinador = Number(t.es_coordinador) === 1;
            const puedeEditar = !esCoordinador;
            const puedeActivar = !esCoordinador || staff;
            const enCurso = Number(t.reservas_en_curso) || 0;
            const total = Number(t.reservas_total) || 0;

            return (
              <article
                key={t.id_empresa_tutor}
                className={`rounded-lg border bg-white p-5 shadow-card ${
                  activo ? "border-surface-200" : "border-surface-200 bg-surface-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`truncate text-base font-semibold ${activo ? "text-charcoal-950" : "text-muted"}`} title={t.nombre || undefined}>
                      {t.nombre}
                    </p>
                    <span
                      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs ${
                        activo
                          ? "border-green-200 bg-green-50 text-green-800"
                          : "border-surface-200 bg-white text-muted"
                      }`}
                    >
                      {activo ? "Activo" : "Inactivo"}
                    </span>
                    {esCoordinador && (
                      <span className="ml-2 mt-1 inline-flex rounded-full border border-charcoal-200 bg-charcoal-50 px-2 py-0.5 text-xs text-charcoal-800">
                        Coordinador principal
                      </span>
                    )}
                  </div>
                  {!isEditing && (puedeEditar || puedeActivar) && (
                    <div className="flex shrink-0 gap-2">
                      {puedeEditar && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(t)}>
                          Editar
                        </button>
                      )}
                      {puedeActivar && activo && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeactivate(t)}
                          disabled={submitting || enCurso > 0}
                          title={enCurso > 0 ? "Tiene alumnos asignados este curso: asígnales otro tutor antes." : undefined}
                        >
                          Desactivar
                        </button>
                      )}
                      {puedeActivar && !activo && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleActivate(t)}
                          disabled={submitting}
                        >
                          Reactivar
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {!isEditing && esCoordinador && (
                  <p className="mt-2 text-xs text-muted">
                    {staff
                      ? "Sus datos se cambian en «Información» con el lápiz (editar datos de la empresa)."
                      : "Para cambiar sus datos usa «Datos de la empresa › Editar datos»; el centro revisa el cambio."}
                  </p>
                )}

                {!isEditing && enCurso > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    Tutor de {enCurso} {enCurso === 1 ? "alumno" : "alumnos"} este curso.
                    {activo && " Para desactivarlo, primero asígnales otro tutor en sus reservas."}
                  </p>
                )}

                {!isEditing && (
                  <div className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
                    <p className="min-w-0 break-words" title={t.email || undefined}>{t.email || "Sin email"}</p>
                    <p>{t.telefono || "Sin teléfono"}</p>
                    <p>{t.dni || "Sin DNI"}</p>
                    <p>{t.cargo || "Sin cargo"}</p>
                  </div>
                )}

                {isEditing && (
                  <div className="mt-4 border-t border-surface-200 pt-4">
                    {total > 0 && (
                      <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Tiene {total} {total === 1 ? "reserva" : "reservas"}: el cambio se verá en todas, también en las de otros cursos, y en los documentos que se generen desde ahora (los ya generados no cambian). Si es otra persona, añádela como tutor nuevo.
                      </p>
                    )}
                    <div className="grid gap-x-4 md:grid-cols-2">
                      <div className="field">
                        <label htmlFor={`tutor-${t.id_empresa_tutor}-nombre`}>Nombre</label>
                        <input id={`tutor-${t.id_empresa_tutor}-nombre`} className="input" value={editForm.nombre} onChange={(e) => setField(setEditForm, "nombre", e.target.value)} maxLength={100} placeholder="Ej.: María López" aria-invalid={editErrors.nombre ? "true" : undefined} />
                      <FieldError message={editErrors.nombre} />
              </div>
                      <div className="field">
                        <label htmlFor={`tutor-${t.id_empresa_tutor}-dni`}>DNI / NIE</label>
                        <input id={`tutor-${t.id_empresa_tutor}-dni`} className="input" value={editForm.dni} onChange={(e) => setField(setEditForm, "dni", e.target.value.toUpperCase())} maxLength={15} placeholder="Ej.: 12345678Z" aria-invalid={editErrors.dni ? "true" : undefined} />
                      <FieldError message={editErrors.dni} />
              </div>
                      <div className="field">
                        <label htmlFor={`tutor-${t.id_empresa_tutor}-email`}>Email</label>
                        <input id={`tutor-${t.id_empresa_tutor}-email`} className="input" type="email" value={editForm.email} onChange={(e) => setField(setEditForm, "email", e.target.value)} maxLength={100} placeholder="Ej.: maria@empresa.com" aria-invalid={editErrors.email ? "true" : undefined} />
                      <FieldError message={editErrors.email} />
              </div>
                      <div className="field">
                        <label htmlFor={`tutor-${t.id_empresa_tutor}-telefono`}>Teléfono</label>
                        <input id={`tutor-${t.id_empresa_tutor}-telefono`} className="input" value={editForm.telefono} onChange={(e) => setField(setEditForm, "telefono", e.target.value)} maxLength={20} placeholder="Ej.: 976 123 456" aria-invalid={editErrors.telefono ? "true" : undefined} />
                      <FieldError message={editErrors.telefono} />
              </div>
                      <div className="field md:col-span-2">
                        <label htmlFor={`tutor-${t.id_empresa_tutor}-cargo`}>Cargo</label>
                        <input id={`tutor-${t.id_empresa_tutor}-cargo`} className="input" value={editForm.cargo} onChange={(e) => setField(setEditForm, "cargo", e.target.value)} maxLength={100} placeholder="Ej.: Responsable de formación" aria-invalid={editErrors.cargo ? "true" : undefined} />
                      <FieldError message={editErrors.cargo} />
              </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className={`btn btn-primary btn-sm`}
                        onClick={handleUpdate}
                        disabled={submitting}
                      >
                        {submitting ? "Guardando…" : "Guardar"}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TutoresEmpresa;
