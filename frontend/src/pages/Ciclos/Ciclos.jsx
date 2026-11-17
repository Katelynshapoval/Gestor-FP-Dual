// Configuración › Ciclos: the ciclos the centre offers. Adding, renaming and
// switching them on or off; a ciclo is never deleted. Its code and shift are
// fixed once applications, offers or students use it (the API refuses too).
import { useCallback, useEffect, useId, useState } from "react";
import { FaPlus } from "react-icons/fa6";
import { getJSON, postJSON, putJSON } from "../../utils/api.js";
import { SeccionIntro } from "../Configuracion/Configuracion.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import InlineNotice from "../../components/ui/InlineNotice.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { SkeletonCards } from "../../components/ui/Loading.jsx";
import { useConfirm, useToast } from "../../components/feedback/ToastProvider.jsx";

const TURNOS = [
  { value: 0, label: "Diurno" },
  { value: 1, label: "Vespertino" },
];
const turnoTexto = (t) => TURNOS.find((x) => x.value === Number(t))?.label || "";

function usoTexto(c) {
  const partes = [];
  if (c.solicitudes) partes.push(`${c.solicitudes} ${c.solicitudes === 1 ? "solicitud" : "solicitudes"}`);
  if (c.ofertas) partes.push(`${c.ofertas} ${c.ofertas === 1 ? "oferta" : "ofertas"}`);
  if (c.alumnos) partes.push(`${c.alumnos} ${c.alumnos === 1 ? "alumno" : "alumnos"}`);
  return partes.length ? partes.join(" · ") : "Sin uso todavía";
}

function FilaCiclo({ ciclo, onEditar, onActiva, ocupado }) {
  return (
    <li className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${ciclo.activa ? "" : "bg-surface-50"}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`m-0 break-words font-semibold ${ciclo.activa ? "text-charcoal-900" : "text-muted"}`}>{ciclo.nombre}</p>
          <StatusBadge variant="neutral">{ciclo.codigo}</StatusBadge>
          <StatusBadge variant="info">{turnoTexto(ciclo.turno)}</StatusBadge>
          {!ciclo.activa && <StatusBadge variant="neutral">Desactivado</StatusBadge>}
        </div>
        <p className="mt-1 text-sm text-muted">{usoTexto(ciclo)}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEditar(ciclo)} disabled={ocupado}>
          Editar
        </button>
        <button
          type="button"
          className={`btn btn-sm ${ciclo.activa ? "btn-secondary" : "btn-outline-brand"}`}
          onClick={() => onActiva(ciclo)}
          disabled={ocupado}
        >
          {ciclo.activa ? "Desactivar" : "Activar"}
        </button>
      </div>
    </li>
  );
}

const VACIO = { codigo: "", nombre: "", turno: "" };

// Create (`ciclo` null) or edit. onSave(body) may throw: the message stays here.
export function CicloDialog({ open, ciclo, onClose, onSave }) {
  const id = useId();
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const editando = Boolean(ciclo);
  const fijo = editando && ciclo.en_uso;

  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(false);
    setForm(ciclo ? { codigo: ciclo.codigo, nombre: ciclo.nombre, turno: Number(ciclo.turno) } : VACIO);
  }, [open, ciclo]);

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setError("");
  };

  const codigo = form.codigo.trim().toUpperCase();
  const nombre = form.nombre.trim().replace(/\s+/g, " ");
  const problema = !codigo
    ? "Escribe el código del ciclo."
    : nombre.length < 3
      ? "Escribe el nombre del ciclo."
      : form.turno === ""
        ? "Elige el turno."
        : null;

  const submit = async (e) => {
    e?.preventDefault();
    if (problema) {
      setError(problema);
      return;
    }
    setBusy(true);
    setError("");
    try {
      // While in use, code and shift are not sent: only what can change.
      await onSave(fijo ? { nombre } : { codigo, nombre, turno: Number(form.turno) });
    } catch (err) {
      setError(err?.message || "No se ha podido guardar el ciclo.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="md"
      title={editando ? `Editar «${ciclo.nombre}»` : "Nuevo ciclo"}
      description="Los ciclos activos aparecen en las solicitudes de alumnos y empresas."
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form={`${id}-form`} className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? "Guardando…" : editando ? "Guardar cambios" : "Añadir ciclo"}
          </button>
        </>
      }
    >
      <form id={`${id}-form`} className="space-y-5" onSubmit={submit} noValidate>
        {fijo && (
          <InlineNotice tone="info">
            Este ciclo ya tiene {usoTexto(ciclo).toLowerCase()}: su código y su turno no se pueden cambiar. Si el centro deja
            de ofrecerlo, desactívalo y añade uno nuevo.
          </InlineNotice>
        )}
        <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="field mb-0">
            <label htmlFor={`${id}-codigo`}>Código</label>
            <input
              id={`${id}-codigo`}
              data-autofocus={fijo ? undefined : true}
              className="input uppercase"
              maxLength={20}
              placeholder="Ej. DAM"
              value={form.codigo}
              onChange={(e) => set({ codigo: e.target.value })}
              disabled={busy || fijo}
            />
          </div>
          <div className="field mb-0">
            <label htmlFor={`${id}-nombre`}>Nombre</label>
            <input
              id={`${id}-nombre`}
              data-autofocus={fijo ? true : undefined}
              className="input"
              maxLength={150}
              placeholder="Ej. Desarrollo de Aplicaciones Multiplataforma"
              value={form.nombre}
              onChange={(e) => set({ nombre: e.target.value })}
              disabled={busy}
            />
          </div>
        </div>

        <fieldset className="space-y-2" disabled={busy || fijo}>
          <legend className="mb-1.5 text-sm font-semibold text-charcoal-900">Turno</legend>
          <div className="radio-group">
            {TURNOS.map((t) => (
              <label key={t.value} className="radio-option">
                <input
                  type="radio"
                  name={`${id}-turno`}
                  checked={form.turno !== "" && Number(form.turno) === t.value}
                  onChange={() => set({ turno: t.value })}
                />
                <span>{t.label}</span>
              </label>
            ))}
          </div>
          <p className="m-0 text-xs text-muted">Un mismo código puede existir una vez en cada turno.</p>
        </fieldset>

        <InlineNotice tone="error">{error}</InlineNotice>
      </form>
    </Modal>
  );
}

export default function Ciclos() {
  const toast = useToast();
  const confirm = useConfirm();
  const [ciclos, setCiclos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dialogo, setDialogo] = useState(null); // { ciclo: null | ciclo }
  const [ocupado, setOcupado] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setLoadError("");
      const data = await getJSON("/especialidades/todas");
      setCiclos(Array.isArray(data?.ciclos) ? data.ciclos : []);
    } catch (err) {
      setLoadError(err.message || "No se han podido cargar los ciclos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async (body) => {
    const ciclo = dialogo?.ciclo;
    const data = ciclo
      ? await putJSON(`/especialidades/${ciclo.id_especialidad}`, body)
      : await postJSON("/especialidades", body);
    toast.success(data?.message || "Ciclo guardado.");
    setDialogo(null);
    await cargar();
  };

  const cambiarActiva = async (ciclo) => {
    if (ciclo.activa) {
      const ok = await confirm({
        title: `Desactivar «${ciclo.nombre}» (${turnoTexto(ciclo.turno).toLowerCase()})`,
        message:
          "Dejará de aparecer en las solicitudes nuevas de alumnos y empresas. Las solicitudes, ofertas y reservas que ya lo usan no cambian. Puedes volver a activarlo cuando quieras.",
        confirmLabel: "Desactivar",
      });
      if (!ok) return;
    }
    setOcupado(ciclo.id_especialidad);
    try {
      const data = await putJSON(`/especialidades/${ciclo.id_especialidad}`, { activa: !ciclo.activa });
      toast.success(data?.message || "Ciclo guardado.");
      await cargar();
    } catch (err) {
      toast.error(err.message || "No se ha podido guardar el ciclo.");
    } finally {
      setOcupado(null);
    }
  };

  const activos = ciclos.filter((c) => c.activa);
  const inactivos = ciclos.filter((c) => !c.activa);

  const lista = (titulo, idTitulo, filas, vacio) => (
    <section aria-labelledby={idTitulo} className="overflow-hidden rounded-lg border border-surface-200 bg-white shadow-card">
      <header className="border-b border-surface-200 px-5 py-4 sm:px-6">
        <h2 id={idTitulo} className="form-section-title mb-0">
          {titulo}
        </h2>
      </header>
      {filas.length === 0 ? (
        <p className="m-0 px-6 py-5 text-sm text-muted">{vacio}</p>
      ) : (
        <ul className="m-0 list-none divide-y divide-surface-200 p-0">
          {filas.map((c) => (
            <FilaCiclo
              key={c.id_especialidad}
              ciclo={c}
              ocupado={ocupado === c.id_especialidad}
              onEditar={(ciclo) => setDialogo({ ciclo })}
              onActiva={cambiarActiva}
            />
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div>
      <SeccionIntro
        meta={
          !loading &&
          !loadError && (
            <>
              <StatusBadge variant="brand">
                {activos.length} {activos.length === 1 ? "activo" : "activos"}
              </StatusBadge>
              {inactivos.length > 0 && (
                <StatusBadge variant="neutral">
                  {inactivos.length} {inactivos.length === 1 ? "desactivado" : "desactivados"}
                </StatusBadge>
              )}
            </>
          )
        }
      >
        Los ciclos que ofrece el centro. Los activos aparecen en las solicitudes de alumnos y empresas. Un ciclo no se
        borra: se desactiva, y lo que ya lo usa se conserva.
      </SeccionIntro>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!loading && !loadError && activos.length === 0 ? (
          <InlineNotice tone="warning" className="sm:flex-1">
            No hay ningún ciclo activo: nadie puede presentar una solicitud hasta que añadas uno.
          </InlineNotice>
        ) : (
          <span />
        )}
        <button type="button" className="btn btn-primary shrink-0 shadow-none" onClick={() => setDialogo({ ciclo: null })}>
          <FaPlus aria-hidden="true" className="text-xs" />
          Nuevo ciclo
        </button>
      </div>

      {loading ? (
        <SkeletonCards count={3} label="Cargando ciclos…" />
      ) : loadError ? (
        <div className="rounded-lg border border-surface-200 bg-white px-6 py-6 shadow-card">
          <InlineNotice tone="error">{loadError}</InlineNotice>
          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={cargar}>
            Reintentar
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {lista("Activos", "ciclos-activos", activos, "Ningún ciclo activo.")}
          {inactivos.length > 0 && lista("Desactivados", "ciclos-desactivados", inactivos, "")}
        </div>
      )}

      <CicloDialog open={Boolean(dialogo)} ciclo={dialogo?.ciclo || null} onClose={() => setDialogo(null)} onSave={guardar} />
    </div>
  );
}
