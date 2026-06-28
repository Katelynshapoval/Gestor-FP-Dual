import { useEffect, useState } from 'react';
import { useUser } from '../../globales/User';
import { getJSON, postJSON, putJSON } from '../../utils/api';
import '../../styles/forms.css';

// Formatea una fecha de MySQL (puede llegar como Date ISO o solo fecha) sin desplazamiento de zona horaria
function formatDate(value) {
  if (!value) return '—';
  const dateStr = typeof value === 'string' ? value.split('T')[0] : value;
  const d = new Date(`${dateStr}T12:00:00`);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES');
}

// Devuelve true si la convocatoria aún no ha comenzado
function esFutura(fechaInicio) {
  if (!fechaInicio) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const inicio = new Date(`${String(fechaInicio).split('T')[0]}T00:00:00`);
  return inicio > hoy;
}

export default function Convocatorias() {
  const { user } = useUser();
  const [convocatorias, setConvocatorias] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [form, setForm]         = useState({ nombre: '', fecha_inicio: '', fecha_fin: '' });
  const [saving, setSaving]     = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: '', fecha_inicio: '', fecha_fin: '' });
  const [editSaving, setEditSaving] = useState(false);

  const isAdmin = user?.rol === 'ADMINISTRADOR';

  const cargar = async () => {
    try {
      setError('');
      const data = await getJSON('/convocatorias');
      setConvocatorias(data);
    } catch (err) {
      setError(err.message || 'No se han podido cargar las convocatorias.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const crear = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await postJSON('/convocatorias', form);
      setForm({ nombre: '', fecha_inicio: '', fecha_fin: '' });
      await cargar();
    } catch (err) {
      setError(err.message || 'No se ha podido crear la convocatoria.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c) => {
    setEditingId(c.id_convocatoria);
    const fi = typeof c.fecha_inicio === 'string' ? c.fecha_inicio.split('T')[0] : c.fecha_inicio;
    const ff = typeof c.fecha_fin    === 'string' ? c.fecha_fin.split('T')[0]    : c.fecha_fin;
    setEditForm({ nombre: c.nombre, fecha_inicio: fi, fecha_fin: ff });
  };

  const guardarEdicion = async (id) => {
    setEditSaving(true);
    setError('');
    try {
      await putJSON(`/convocatorias/${id}`, editForm);
      setEditingId(null);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se ha podido actualizar la convocatoria.');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="page-container px-8">
      <h1 className="page-title">Gestión de convocatorias</h1>
      <p className="page-subtitle">Crea nuevas convocatorias y define el periodo en que están abiertas. La activa se determina automáticamente por fechas.</p>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isAdmin && (
        <div className="form-card">
          <div className="form-section-title">Nueva convocatoria</div>
          <form className="space-y-4" onSubmit={crear}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="field md:col-span-1">
                <label htmlFor="nombre">Nombre</label>
                <input
                  id="nombre"
                  className="input"
                  value={form.nombre}
                  onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej. 2027/2028"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="fechaInicio">Fecha de inicio</label>
                <input
                  id="fechaInicio"
                  className="input"
                  type="date"
                  value={form.fecha_inicio}
                  onChange={(e) => setForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="fechaFin">Fecha de fin</label>
                <input
                  id="fechaFin"
                  className="input"
                  type="date"
                  value={form.fecha_fin}
                  onChange={(e) => setForm(f => ({ ...f, fecha_fin: e.target.value }))}
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary !shadow-none"
            >
              {saving ? 'Creando…' : 'Crear convocatoria'}
            </button>
          </form>
        </div>
      )}

      <div className="form-card !p-0 overflow-hidden">
        <div className="px-6 py-5 border-b border-surface-200">
          <div className="form-section-title !mb-0">Convocatorias registradas</div>
        </div>
        {loading ? (
          <p className="px-6 py-8 text-sm text-gray-500">Cargando…</p>
        ) : convocatorias.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-500">No hay convocatorias registradas.</p>
        ) : (
          <div className="divide-y divide-surface-200">
            {convocatorias.map((c) => (
              <div key={c.id_convocatoria} className="px-6 py-4">
                {editingId === c.id_convocatoria ? (
                  // Formulario de edición inline
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="field !mb-0">
                        <label className="!text-xs">Nombre</label>
                        <input
                          className="input !py-1.5 !text-sm"
                          value={editForm.nombre}
                          onChange={(e) => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                        />
                      </div>
                      <div className="field !mb-0">
                        <label className="!text-xs">Fecha inicio</label>
                        <input
                          type="date"
                          className="input !py-1.5 !text-sm"
                          value={editForm.fecha_inicio}
                          onChange={(e) => setEditForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                        />
                      </div>
                      <div className="field !mb-0">
                        <label className="!text-xs">Fecha fin</label>
                        <input
                          type="date"
                          className="input !py-1.5 !text-sm"
                          value={editForm.fecha_fin}
                          onChange={(e) => setEditForm(f => ({ ...f, fecha_fin: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn btn-primary btn-sm !shadow-none"
                        disabled={editSaving}
                        onClick={() => guardarEdicion(c.id_convocatoria)}
                      >
                        {editSaving ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{c.nombre}</p>
                      <p className="text-sm text-gray-500">
                        {formatDate(c.fecha_inicio)} — {formatDate(c.fecha_fin)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.activa ? (
                        <span className="inline-flex items-center justify-center rounded-full w-20 py-1 text-xs font-semibold border border-green-200 bg-green-50 text-green-700">
                          Activa
                        </span>
                      ) : esFutura(c.fecha_inicio) ? (
                        <span className="inline-flex items-center justify-center rounded-full w-20 py-1 text-xs font-semibold border border-gray-200 bg-gray-50 text-gray-500">
                          Próxima
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center rounded-full w-20 py-1 text-xs font-semibold border border-gray-200 bg-gray-50 text-gray-400">
                          Cerrada
                        </span>
                      )}
                      {isAdmin && esFutura(c.fecha_inicio) && !c.activa && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => startEdit(c)}
                        >
                          Editar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
