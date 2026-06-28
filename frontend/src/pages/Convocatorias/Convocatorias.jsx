import { useEffect, useState } from 'react';
import { useUser } from '../../globales/User';
import { getJSON, postJSON } from '../../utils/api';
import '../../styles/forms.css';

function formatDate(value) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('es-ES');
}

export default function Convocatorias() {
  const { user } = useUser();
  const [convocatorias, setConvocatorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ nombre: '', fecha_inicio: '', fecha_fin: '' });
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.rol === 'ADMINISTRADOR';

  const cargar = async () => {
    try {
      setError('');
      const data = await getJSON('/convocatorias');
      setConvocatorias(data);
    } catch (requestError) {
      setError(requestError.message || 'No se han podido cargar las convocatorias.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const crear = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await postJSON('/convocatorias', form);
      setForm({ nombre: '', fecha_inicio: '', fecha_fin: '' });
      await cargar();
    } catch (requestError) {
      setError(requestError.message || 'No se ha podido crear la convocatoria.');
    } finally {
      setSaving(false);
    }
  };

  const activar = async (id) => {
    setError('');
    try {
      await postJSON(`/convocatorias/${id}/activar`, {});
      await cargar();
    } catch (requestError) {
      setError(requestError.message || 'No se ha podido activar la convocatoria.');
    }
  };

  return (
    <div className="page-container px-8">
      <h1 className="page-title">Gestión de convocatorias</h1>
      <p className="page-subtitle">Crea nuevas convocatorias y define cuál está abierta para recibir solicitudes.</p>

      {error && <div className="status-note status-note-error mb-6">{error}</div>}

      {isAdmin && (
        <div className="form-card">
          <div className="form-section-title">Nueva convocatoria</div>
          <form className="space-y-4" onSubmit={crear}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="field md:col-span-1">
                <label htmlFor="nombre">Nombre</label>
                <input id="nombre" className="input" value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} placeholder="Ej. 2027/2028" required />
              </div>
              <div className="field">
                <label htmlFor="fechaInicio">Fecha de inicio</label>
                <input id="fechaInicio" className="input" type="date" value={form.fecha_inicio} onChange={(event) => setForm((current) => ({ ...current, fecha_inicio: event.target.value }))} required />
              </div>
              <div className="field">
                <label htmlFor="fechaFin">Fecha de fin</label>
                <input id="fechaFin" className="input" type="date" value={form.fecha_fin} onChange={(event) => setForm((current) => ({ ...current, fecha_fin: event.target.value }))} required />
              </div>
            </div>
            <button type="submit" className={`btn btn-primary ${saving ? 'btn-disabled' : ''}`} disabled={saving}>{saving ? 'Creando…' : 'Crear convocatoria'}</button>
          </form>
        </div>
      )}

      <div className="form-card !p-0 overflow-hidden">
        <div className="px-6 py-5 border-b border-surface-200">
          <div className="form-section-title !mb-0">Convocatorias registradas</div>
        </div>
        {loading ? (
          <p className="px-6 py-8 text-sm text-gray-500">Cargando convocatorias…</p>
        ) : convocatorias.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-500">No hay convocatorias registradas.</p>
        ) : (
          <div className="divide-y divide-surface-200">
            {convocatorias.map((convocatoria) => (
              <div key={convocatoria.id_convocatoria} className="px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{convocatoria.nombre}</p>
                  <p className="text-sm text-gray-500">{formatDate(convocatoria.fecha_inicio)} — {formatDate(convocatoria.fecha_fin)}</p>
                </div>
                {convocatoria.activa ? (
                  <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border border-green-200 bg-green-50 text-green-700">Activa</span>
                ) : isAdmin ? (
                  <button type="button" className="btn btn-outline-brand btn-sm" onClick={() => activar(convocatoria.id_convocatoria)}>Activar</button>
                ) : (
                  <span className="text-sm text-gray-400">Cerrada</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
