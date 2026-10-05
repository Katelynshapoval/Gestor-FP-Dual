import { useCallback, useEffect, useState } from "react";
import { getJSON, patchJSON, postJSON } from "../../utils/api.js";

const emptyForm = () => ({
  nombre: "",
  dni: "",
  email: "",
  telefono: "",
  cargo: "TUTOR EMPRESA",
});

const TutoresEmpresa = () => {
  const [tutores, setTutores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await getJSON("/tutores/empresa");
      setTutores(Array.isArray(data) ? data : []);
    } catch {
      setTutores([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (setter, key, value) => {
    setter((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    if (submitting) return;
    setSubmitting(true);
    setMsg(null);
    try {
      await postJSON("/tutores/empresa", form);
      setForm(emptyForm());
      setAdding(false);
      setMsg({ ok: true, text: "Tutor añadido." });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err.message || "Error al añadir el tutor." });
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id_empresa_tutor);
    setEditForm({
      nombre: t.nombre || "",
      dni: t.dni || "",
      email: t.email || "",
      telefono: t.telefono || "",
      cargo: t.cargo || "",
    });
    setMsg(null);
  };

  const handleUpdate = async () => {
    if (!editingId || submitting) return;
    setSubmitting(true);
    setMsg(null);
    try {
      await patchJSON(`/tutores/${editingId}`, editForm);
      setEditingId(null);
      setMsg({ ok: true, text: "Tutor actualizado." });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err.message || "Error al actualizar el tutor." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (t) => {
    if (!window.confirm(`¿Desactivar a ${t.nombre}? Seguirá visible en reservas históricas.`)) {
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      await postJSON(`/tutores/${t.id_empresa_tutor}/desactivar`, {});
      setMsg({ ok: true, text: "Tutor desactivado." });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err.message || "Error al desactivar el tutor." });
    } finally {
      setSubmitting(false);
    }
  };

  const activos = tutores.filter((t) => Number(t.activo) === 1).length;

  if (loading) {
    return <p className="py-8 text-center text-gray-400">Cargando tutores…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="form-card flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="form-section-title mb-1">Tutores de empresa</p>
          <p className="text-sm leading-6 text-gray-500">
            Una empresa puede tener varios tutores. Cada alumno reservado se asigna a uno
            de ellos. El coordinador principal del acceso con CIF se gestiona en «Mis datos».
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-muted">
            {activos} activo{activos === 1 ? "" : "s"} · {tutores.length} en total
          </p>
        </div>
        {!adding && (
          <button type="button" className="btn btn-primary shrink-0" onClick={() => setAdding(true)}>
            Añadir tutor
          </button>
        )}
      </div>

      {msg && (
        <p
          className={`rounded-lg px-4 py-2 text-sm ${
            msg.ok
              ? "border border-green-200 bg-green-50 text-green-800"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </p>
      )}

      {adding && (
        <div className="form-card">
          <p className="form-section-title">Nuevo tutor</p>
          <div className="grid gap-x-4 md:grid-cols-2">
            <div className="field">
              <label htmlFor="new_tutor_nombre">Nombre</label>
              <input id="new_tutor_nombre" className="input" value={form.nombre} onChange={(e) => setField(setForm, "nombre", e.target.value)} maxLength={100} />
            </div>
            <div className="field">
              <label htmlFor="new_tutor_dni">DNI / NIE</label>
              <input id="new_tutor_dni" className="input" value={form.dni} onChange={(e) => setField(setForm, "dni", e.target.value.toUpperCase())} maxLength={15} />
            </div>
            <div className="field">
              <label htmlFor="new_tutor_email">Email</label>
              <input id="new_tutor_email" className="input" type="email" value={form.email} onChange={(e) => setField(setForm, "email", e.target.value)} maxLength={100} />
            </div>
            <div className="field">
              <label htmlFor="new_tutor_tel">Teléfono</label>
              <input id="new_tutor_tel" className="input" value={form.telefono} onChange={(e) => setField(setForm, "telefono", e.target.value)} maxLength={20} />
            </div>
            <div className="field md:col-span-2">
              <label htmlFor="new_tutor_cargo">Cargo</label>
              <input id="new_tutor_cargo" className="input" value={form.cargo} onChange={(e) => setField(setForm, "cargo", e.target.value)} maxLength={100} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setAdding(false);
                setForm(emptyForm());
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={`btn btn-primary btn-sm ${
                submitting || !form.nombre || !form.email || !form.telefono ? "btn-disabled" : ""
              }`}
              onClick={handleCreate}
              disabled={submitting || !form.nombre || !form.email || !form.telefono}
            >
              {submitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {tutores.length === 0 ? (
        <div className="rounded-xl2 border border-surface-200 bg-white px-6 py-10 text-center shadow-card">
          <p className="text-sm text-gray-400">Todavía no hay tutores registrados.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tutores.map((t) => {
            const isEditing = editingId === t.id_empresa_tutor;
            const activo = Number(t.activo) === 1;

            return (
              <article
                key={t.id_empresa_tutor}
                className={`rounded-xl2 border bg-white p-5 shadow-card ${
                  activo ? "border-surface-200" : "border-surface-200 bg-surface-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`truncate text-base font-semibold ${activo ? "text-charcoal-950" : "text-gray-500"}`}>
                      {t.nombre}
                    </p>
                    <span
                      className={`mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                        activo
                          ? "border-green-200 bg-green-50 text-green-800"
                          : "border-gray-200 bg-white text-gray-500"
                      }`}
                    >
                      {activo ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  {!isEditing && (
                    <div className="flex shrink-0 gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(t)}>
                        Editar
                      </button>
                      {activo && (
                        <button
                          type="button"
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          onClick={() => handleDeactivate(t)}
                          disabled={submitting}
                        >
                          Desactivar
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-surface-200 pt-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-widest text-muted">Email</dt>
                      <dd className="mt-1 break-all text-charcoal-800">{t.email || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-widest text-muted">Teléfono</dt>
                      <dd className="mt-1 text-charcoal-800">{t.telefono || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-widest text-muted">DNI / NIE</dt>
                      <dd className="mt-1 text-charcoal-800">{t.dni || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-widest text-muted">Cargo</dt>
                      <dd className="mt-1 text-charcoal-800">{t.cargo || "—"}</dd>
                    </div>
                  </dl>
                )}

                {isEditing && (
                  <div className="mt-4 border-t border-surface-200 pt-4">
                    <div className="grid gap-x-4 md:grid-cols-2">
                      <div className="field">
                        <label>Nombre</label>
                        <input className="input" value={editForm.nombre} onChange={(e) => setField(setEditForm, "nombre", e.target.value)} maxLength={100} />
                      </div>
                      <div className="field">
                        <label>DNI / NIE</label>
                        <input className="input" value={editForm.dni} onChange={(e) => setField(setEditForm, "dni", e.target.value.toUpperCase())} maxLength={15} />
                      </div>
                      <div className="field">
                        <label>Email</label>
                        <input className="input" type="email" value={editForm.email} onChange={(e) => setField(setEditForm, "email", e.target.value)} maxLength={100} />
                      </div>
                      <div className="field">
                        <label>Teléfono</label>
                        <input className="input" value={editForm.telefono} onChange={(e) => setField(setEditForm, "telefono", e.target.value)} maxLength={20} />
                      </div>
                      <div className="field md:col-span-2">
                        <label>Cargo</label>
                        <input className="input" value={editForm.cargo} onChange={(e) => setField(setEditForm, "cargo", e.target.value)} maxLength={100} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className={`btn btn-primary btn-sm ${submitting ? "btn-disabled" : ""}`}
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
