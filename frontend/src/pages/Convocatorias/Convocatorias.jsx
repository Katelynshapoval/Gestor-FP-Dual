import { useEffect, useState } from 'react';
import { getJSON, postJSON, putJSON } from '../../utils/api';
import { SeccionIntro } from '../Configuracion/Configuracion.jsx';
import StatusBadge from '../../components/ui/StatusBadge';
import { useConfirm, useToast } from '../../components/feedback/ToastProvider.jsx';
import '../../styles/forms.css';
import { formatFecha as formatDate } from '../../utils/fechas.js';

const VACIO = { nombre: '', fecha_inicio: '', fecha_fin: '' };
const soloFecha = (f) => (typeof f === 'string' ? f.split('T')[0] : f || '');

// Today as YYYY-MM-DD in local time (the dates have no time zone).
function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const esFutura = (c) => soloFecha(c.fecha_inicio) > hoyIso();

// The same checks the server makes, so mistakes show up before sending.
function problemaFechas(form, { activa = false } = {}) {
  if (!form.nombre.trim()) return 'Escribe un nombre, por ejemplo 2027/2028.';
  if (!form.fecha_inicio || !form.fecha_fin) return 'Indica la fecha de inicio y la de fin.';
  if (form.fecha_inicio > form.fecha_fin) return 'La fecha de inicio no puede ser posterior a la de fin.';
  const hoy = hoyIso();
  if (activa && (form.fecha_inicio > hoy || form.fecha_fin < hoy)) {
    return 'La convocatoria activa tiene que seguir abierta hoy.';
  }
  return null;
}

const Aviso = ({ children }) =>
  children ? (
    <p role="alert" className="animate-fade-in rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {children}
    </p>
  ) : null;

export default function Convocatorias() {
  const toast = useToast();
  const confirm = useConfirm();
  const [convocatorias, setConvocatorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(VACIO);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(VACIO);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const cargar = async () => {
    try {
      setLoadError('');
      setConvocatorias(await getJSON('/convocatorias'));
    } catch (err) {
      setLoadError(err.message || 'No se han podido cargar las convocatorias.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const crear = async (e) => {
    e.preventDefault();
    const problema = problemaFechas(form);
    if (problema) {
      setFormError(problema);
      return;
    }
    const hoy = hoyIso();
    if (form.fecha_inicio <= hoy && form.fecha_fin >= hoy) {
      const ok = await confirm({
        title: 'Se abrirá al momento',
        message: `«${form.nombre.trim()}» incluye el día de hoy, así que pasará a ser la convocatoria activa en cuanto la crees. Las solicitudes nuevas irán a ella.`,
        confirmLabel: 'Crear y abrir',
        tone: 'primary',
      });
      if (!ok) return;
    }
    setSaving(true);
    setFormError('');
    try {
      await postJSON('/convocatorias', { ...form, nombre: form.nombre.trim() });
      toast.success(`Convocatoria ${form.nombre.trim()} creada.`);
      setForm(VACIO);
      await cargar();
    } catch (err) {
      setFormError(err.message || 'No se ha podido crear la convocatoria.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c) => {
    setEditingId(c.id_convocatoria);
    setEditError('');
    setEditForm({ nombre: c.nombre, fecha_inicio: soloFecha(c.fecha_inicio), fecha_fin: soloFecha(c.fecha_fin) });
  };

  const guardarEdicion = async (c) => {
    const problema = problemaFechas(editForm, { activa: Boolean(c.activa) });
    if (problema) {
      setEditError(problema);
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      await putJSON(`/convocatorias/${c.id_convocatoria}`, { ...editForm, nombre: editForm.nombre.trim() });
      toast.success('Convocatoria actualizada.');
      setEditingId(null);
      await cargar();
    } catch (err) {
      setEditError(err.message || 'No se ha podido actualizar la convocatoria.');
    } finally {
      setEditSaving(false);
    }
  };

  const campoNuevo = (key) => ({
    value: form[key],
    onChange: (e) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      setFormError('');
    },
  });
  const campoEdicion = (key) => ({
    value: editForm[key],
    onChange: (e) => {
      setEditForm((f) => ({ ...f, [key]: e.target.value }));
      setEditError('');
    },
  });

  return (
    <div>
      <SeccionIntro>
        Crea nuevas convocatorias y define el periodo en que están abiertas. La
        activa se determina automáticamente por fechas.
      </SeccionIntro>

      <div className="form-card">
        <div className="form-section-title">Nueva convocatoria</div>
        <form className="space-y-4" onSubmit={crear} noValidate>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="field md:col-span-1">
              <label htmlFor="nombre">Nombre</label>
              <input id="nombre" className="input" placeholder="Ej. 2027/2028" maxLength={50} required {...campoNuevo('nombre')} />
            </div>
            <div className="field">
              <label htmlFor="fechaInicio">Fecha de inicio</label>
              <input id="fechaInicio" className="input" type="date" required {...campoNuevo('fecha_inicio')} />
            </div>
            <div className="field">
              <label htmlFor="fechaFin">Fecha de fin</label>
              <input
                id="fechaFin"
                className="input"
                type="date"
                min={form.fecha_inicio || undefined}
                required
                {...campoNuevo('fecha_fin')}
              />
            </div>
          </div>
          <Aviso>{formError}</Aviso>
          <button type="submit" disabled={saving} className="btn btn-primary shadow-none">
            {saving ? 'Creando…' : 'Crear convocatoria'}
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl2 border border-surface-200 bg-white shadow-card">
        <div className="border-b border-surface-200 px-6 py-5">
          <div className="form-section-title mb-0">Convocatorias registradas</div>
        </div>
        {loading ? (
          <p className="px-6 py-8 text-sm text-muted">Cargando…</p>
        ) : loadError ? (
          <div className="px-6 py-6">
            <Aviso>{loadError}</Aviso>
            <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={cargar}>
              Reintentar
            </button>
          </div>
        ) : convocatorias.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Todavía no hay convocatorias. Crea la primera arriba.</p>
        ) : (
          <div className="divide-y divide-surface-200">
            {convocatorias.map((c) => {
              const editable = Boolean(c.activa) || esFutura(c);
              return (
                <div key={c.id_convocatoria} className="px-6 py-4">
                  {editingId === c.id_convocatoria ? (
                    <div className="animate-fade-in space-y-3">
                      {Boolean(c.activa) && (
                        <p className="m-0 text-xs text-muted">
                          Es la convocatoria activa: puedes corregir su nombre y sus fechas, pero tiene que seguir abierta hoy.
                        </p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="field mb-0">
                          <label htmlFor={`conv-${c.id_convocatoria}-nombre`} className="text-xs">Nombre</label>
                          <input id={`conv-${c.id_convocatoria}-nombre`} className="input py-1.5 text-sm" maxLength={50} {...campoEdicion('nombre')} />
                        </div>
                        <div className="field mb-0">
                          <label htmlFor={`conv-${c.id_convocatoria}-inicio`} className="text-xs">Fecha inicio</label>
                          <input
                            id={`conv-${c.id_convocatoria}-inicio`}
                            type="date"
                            className="input py-1.5 text-sm"
                            max={c.activa ? hoyIso() : undefined}
                            {...campoEdicion('fecha_inicio')}
                          />
                        </div>
                        <div className="field mb-0">
                          <label htmlFor={`conv-${c.id_convocatoria}-fin`} className="text-xs">Fecha fin</label>
                          <input
                            id={`conv-${c.id_convocatoria}-fin`}
                            type="date"
                            className="input py-1.5 text-sm"
                            min={c.activa ? hoyIso() : editForm.fecha_inicio || undefined}
                            {...campoEdicion('fecha_fin')}
                          />
                        </div>
                      </div>
                      <Aviso>{editError}</Aviso>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-outline-brand btn-sm shadow-none"
                          disabled={editSaving}
                          onClick={() => guardarEdicion(c)}
                        >
                          {editSaving ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-charcoal-900">{c.nombre}</p>
                        <p className="text-sm text-muted">
                          {formatDate(c.fecha_inicio)} — {formatDate(c.fecha_fin)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {c.activa ? (
                          <StatusBadge variant="success" className="w-20 justify-center">Activa</StatusBadge>
                        ) : esFutura(c) ? (
                          <StatusBadge variant="info" className="w-20 justify-center">Próxima</StatusBadge>
                        ) : (
                          <StatusBadge variant="neutral" className="w-20 justify-center">Cerrada</StatusBadge>
                        )}
                        {editable && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(c)}>
                            Editar
                          </button>
                        )}
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
