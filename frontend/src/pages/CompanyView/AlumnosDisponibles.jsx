import { useState, useEffect } from "react";
import { getJSON, postJSON } from "../../utils/api";
import { MdOutlineEmail, MdOutlineLocalPhone } from "react-icons/md";

// Tarjeta individual de alumno disponible para reservar
const AlumnoCard = ({ a, cupoId, onReservar, isReservando }) => {
  const available = !!cupoId;

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-sm px-5 py-4 hover:shadow-md transition">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">{a.nombre}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {a.codigo_especialidad} · {a.especialidad} · {a.turno}
          </p>
          <div className="flex flex-wrap gap-4 mt-2">
            {a.email && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <MdOutlineEmail className="text-brand-500" />
                {a.email}
              </span>
            )}
            {a.telalumno && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <MdOutlineLocalPhone className="text-brand-500" />
                {a.telalumno}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0">
          {a.mi_reserva_id ? (
            <span className="inline-block px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-50 border border-yellow-200 text-yellow-800">
              Ya reservado
            </span>
          ) : (
            <button
              onClick={() => onReservar(a)}
              disabled={!available || isReservando}
              className={`btn btn-sm ${
                !available
                  ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed pointer-events-none"
                  : "btn-primary"
              }`}
            >
              {isReservando ? "Reservando…" : !available ? "Sin plazas" : "Reservar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Lista de alumnos validados disponibles para las especialidades de esta empresa
const AlumnosDisponibles = () => {
  const [alumnos, setAlumnos] = useState([]);
  const [cupos, setCupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reservando, setReservando] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [a, c] = await Promise.all([
        getJSON("/alumnos/disponibles"),
        getJSON("/cupos/empresa"),
      ]);
      setAlumnos(Array.isArray(a) ? a : []);
      setCupos(Array.isArray(c) ? c : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function getCupoId(idEspecialidad) {
    const cupo = cupos.find(
      (c) => c.id_especialidad === idEspecialidad && c.plazas_disponibles > 0
    );
    return cupo?.id_solicitud_empresa_especialidad ?? null;
  }

  async function handleReservar(alumno) {
    const cupoId = getCupoId(alumno.id_especialidad);
    if (!cupoId) {
      setError("No hay plazas disponibles para esa especialidad.");
      return;
    }
    setReservando(alumno.id_solicitud_alumno);
    setSuccessMsg(null);
    setError(null);
    try {
      await postJSON("/reservas", {
        id_solicitud_alumno: alumno.id_solicitud_alumno,
        id_solicitud_empresa_especialidad: cupoId,
      });
      setSuccessMsg(`Reserva realizada correctamente para ${alumno.nombre}.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setReservando(null);
    }
  }

  if (loading) {
    return <p className="text-gray-400 text-sm py-8 text-center">Cargando alumnos disponibles…</p>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
    );
  }

  if (alumnos.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-sm text-blue-800">
        No hay alumnos disponibles para tus especialidades en este momento.
        Solo aparecen alumnos con solicitud validada y sin asignación definitiva.
      </div>
    );
  }

  // Agrupa por especialidad
  const byEsp = alumnos.reduce((acc, a) => {
    const key = a.id_especialidad;
    if (!acc[key]) acc[key] = { label: `${a.especialidad || a.codigo_especialidad} (${a.turno})`, items: [] };
    acc[key].items.push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          {successMsg}
        </div>
      )}

      {Object.entries(byEsp).map(([key, grupo]) => (
        <div key={key} className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            {grupo.label} — {grupo.items.length} alumno{grupo.items.length !== 1 ? "s" : ""}
          </p>
          {grupo.items.map((a) => (
            <AlumnoCard
              key={a.id_solicitud_alumno}
              a={a}
              cupoId={getCupoId(a.id_especialidad)}
              onReservar={handleReservar}
              isReservando={reservando === a.id_solicitud_alumno}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export default AlumnosDisponibles;
