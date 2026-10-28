import { useEffect, useState } from "react";
import { useUser } from "../../context/UserContext";
import { getJSON, patchJSON, postJSON } from "../../utils/api";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import ResetPasswordButton from "../../components/ResetPasswordButton.jsx";
import { useConfirm } from "../../components/feedback/ToastProvider.jsx";

const VISIBLE_MS = 2 * 60 * 1000;
const ROL_LABEL = {
  ADMINISTRADOR: "Administrador",
  COORDINADOR: "Coordinador",
};
const VACIO = { nombre: "", email: "", rol: "COORDINADOR" };

function ClaveTemporal({ password, onHide }) {
  if (!password) return null;
  return (
    <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-charcoal-800" role="status">
      Contraseña temporal de <strong>{password.nombre}</strong>:{" "}
      <strong className="font-mono">{password.valor}</strong>
      . Cópiala ahora: se ocultará en 2 minutos y habrá que cambiarla al entrar.
      <button type="button" className="btn btn-ghost btn-sm ml-2" onClick={onHide}>
        Ocultar
      </button>
    </p>
  );
}

export default function Personal() {
  const { user } = useUser();
  const confirm = useConfirm();
  const [personal, setPersonal] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(VACIO);
  const [saving, setSaving] = useState(false);
  const [clave, setClave] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(VACIO);
  const [editSaving, setEditSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const cargar = async () => {
    try {
      setError("");
      const data = await getJSON("/usuarios/personal");
      setPersonal(data);
    } catch (err) {
      setError(err.message || "No se ha podido cargar el personal.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    if (!clave) return undefined;
    const t = setTimeout(() => setClave(null), VISIBLE_MS);
    return () => clearTimeout(t);
  }, [clave]);

  const crear = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await postJSON("/usuarios/personal", form);
      setForm(VACIO);
      setClave({ nombre: res.usuario.nombre_mostrar, valor: res.newPassword });
      await cargar();
    } catch (err) {
      setError(err.message || "No se ha podido dar de alta la cuenta.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (persona) => {
    setEditingId(persona.id_usuario);
    setEditForm({
      nombre: persona.nombre_mostrar,
      email: persona.email,
      rol: persona.rol,
    });
  };

  const guardarEdicion = async (persona) => {
    setEditSaving(true);
    setError("");
    try {
      await patchJSON(`/usuarios/personal/${persona.id_usuario}`, editForm);
      setEditingId(null);
      await cargar();
    } catch (err) {
      setError(err.message || "No se ha podido guardar la cuenta.");
    } finally {
      setEditSaving(false);
    }
  };

  const cambiarEstado = async (persona, baja) => {
    const ok = await confirm({
      title: baja ? "Dar de baja" : "Reactivar cuenta",
      message: baja
        ? `La cuenta de ${persona.nombre_mostrar} dejará de poder entrar. Si tiene la sesión abierta, se cerrará en la siguiente acción.`
        : `La cuenta de ${persona.nombre_mostrar} volverá a poder entrar.`,
      confirmLabel: baja ? "Dar de baja" : "Reactivar",
      tone: baja ? "danger" : "primary",
    });
    if (!ok) return;
    setBusyId(persona.id_usuario);
    setError("");
    try {
      await postJSON(`/usuarios/personal/${persona.id_usuario}/${baja ? "baja" : "reactivar"}`, {});
      await cargar();
    } catch (err) {
      setError(err.message || (baja ? "No se ha podido dar de baja." : "No se ha podido reactivar."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        kicker="Administración"
        title="Personal del centro"
        subtitle="Da de alta a administradores y coordinadores. La contraseña temporal se muestra una sola vez y hay que cambiarla al entrar."
      />

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="form-card">
        <div className="form-section-title">Nueva cuenta</div>
        <form className="space-y-4" onSubmit={crear} autoComplete="off">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="field">
              <label htmlFor="personal-nombre">Nombre</label>
              <input
                id="personal-nombre"
                className="input"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                required
                maxLength={100}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="personal-email">Email</label>
              <input
                id="personal-email"
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
                maxLength={100}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="personal-rol">Rol</label>
              <select
                id="personal-rol"
                className="select-input w-full"
                value={form.rol}
                onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
              >
                <option value="COORDINADOR">Coordinador</option>
                <option value="ADMINISTRADOR">Administrador</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn btn-primary shadow-none">
            {saving ? "Dando de alta…" : "Dar de alta"}
          </button>
        </form>
        <ClaveTemporal password={clave} onHide={() => setClave(null)} />
      </div>

      <div className="overflow-hidden rounded-xl2 border border-surface-200 bg-white shadow-card">
        <div className="border-b border-surface-200 px-6 py-5">
          <div className="form-section-title mb-0">Cuentas</div>
        </div>
        {loading ? (
          <p className="px-6 py-8 text-sm text-muted">Cargando…</p>
        ) : personal.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">No hay cuentas de personal.</p>
        ) : (
          <div className="divide-y divide-surface-200">
            {personal.map((persona) => {
              const propia = Number(persona.id_usuario) === Number(user?.id);
              const editando = editingId === persona.id_usuario;
              return (
                <div key={persona.id_usuario} className="px-6 py-4">
                  {editando ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="field mb-0">
                          <label htmlFor={`personal-${persona.id_usuario}-nombre`} className="text-xs">Nombre</label>
                          <input
                            id={`personal-${persona.id_usuario}-nombre`}
                            className="input py-1.5 text-sm"
                            value={editForm.nombre}
                            onChange={(e) => setEditForm((f) => ({ ...f, nombre: e.target.value }))}
                            maxLength={100}
                          />
                        </div>
                        <div className="field mb-0">
                          <label htmlFor={`personal-${persona.id_usuario}-email`} className="text-xs">Email</label>
                          <input
                            id={`personal-${persona.id_usuario}-email`}
                            type="email"
                            className="input py-1.5 text-sm"
                            value={editForm.email}
                            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                            maxLength={100}
                          />
                        </div>
                        <div className="field mb-0">
                          <label htmlFor={`personal-${persona.id_usuario}-rol`} className="text-xs">Rol</label>
                          <select
                            id={`personal-${persona.id_usuario}-rol`}
                            className="select-input w-full py-1.5 text-sm"
                            value={editForm.rol}
                            disabled={propia}
                            onChange={(e) => setEditForm((f) => ({ ...f, rol: e.target.value }))}
                          >
                            <option value="ADMINISTRADOR">Administrador</option>
                            <option value="COORDINADOR">Coordinador</option>
                          </select>
                        </div>
                      </div>
                      {propia && (
                        <p className="text-xs text-muted">No puedes cambiar tu propio rol.</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-outline-brand btn-sm shadow-none"
                          disabled={editSaving}
                          onClick={() => guardarEdicion(persona)}
                        >
                          {editSaving ? "Guardando…" : "Guardar"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-charcoal-900">
                          {persona.nombre_mostrar}
                          {propia && <span className="ml-2 text-xs font-normal text-muted">(tú)</span>}
                        </p>
                        <p className="truncate text-sm text-muted">{persona.email}</p>
                        {persona.must_change_password && (
                          <p className="text-xs text-amber-700">Debe cambiar la contraseña al entrar.</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge variant="brand">{ROL_LABEL[persona.rol] || persona.rol}</StatusBadge>
                        {persona.activo ? (
                          <StatusBadge variant="success">Activa</StatusBadge>
                        ) : (
                          <StatusBadge variant="neutral">De baja</StatusBadge>
                        )}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(persona)}>
                          Editar
                        </button>
                        {persona.activo ? (
                          !propia && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busyId === persona.id_usuario}
                              onClick={() => cambiarEstado(persona, true)}
                            >
                              Dar de baja
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={busyId === persona.id_usuario}
                            onClick={() => cambiarEstado(persona, false)}
                          >
                            Reactivar
                          </button>
                        )}
                        <ResetPasswordButton idUsuario={persona.id_usuario} nombre={persona.nombre_mostrar} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
