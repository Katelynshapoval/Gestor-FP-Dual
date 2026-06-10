import { useEffect, useState } from "react";
import { useUser } from "../../globales/User";
import { useNavigate } from "react-router-dom";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { MdOutlineCancel, MdPendingActions } from "react-icons/md";

import "../../styles/forms.css";
import { signedBadgeClass } from "../../components/ui/cardStyles";

import ConvenioViewer from "./components/ConvenioViewer";
import CompanyCard from "./components/CompanyCard";
import ReservasAdmin from "./components/ReservasAdmin";
import { parseEspecialidades } from "./helpers";

// El curso es el del año natural de la solicitud: aplicar en 2026 → "2026/2027"
function getCourseLabel(dateStr) {
  if (!dateStr) return null;
  try {
    const y = new Date(dateStr).getFullYear();
    return `${y}/${y + 1}`;
  } catch {
    return null;
  }
}

// Este componente gestiona la vista principal de empresas para el admin
const AdminCompanyView = () => {
  const { user } = useUser();
  const navigate = useNavigate();

  // Estados principales de datos
  const [companies, setCompanies] = useState([]);
  const [allSpecialities, setAllSpecialities] = useState([]);
  const [allReservations, setAllReservations] = useState([]);
  const [showReservas, setShowReservas] = useState(false);

  // Estados de UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [viewingConvenio, setViewingConvenio] = useState(null);
  const [resetResult, setResetResult] = useState({});

  // Estados de filtros
  const [filterEsp, setFilterEsp] = useState("");
  const [filterConvenio, setFilterConvenio] = useState("");
  const [filterCourse, setFilterCourse] = useState("");
  const [sortBy, setSortBy] = useState("fecha_desc");

  // Carga inicial de datos
  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    Promise.all([
      fetch("/getAllCompanies").then((r) => r.json()),
      fetch("/getAllSpecialities").then((r) => r.json()),
      fetch("/getAllReservations").then((r) => r.json()),
    ])
      .then(([companiesData, specData, reservationsData]) => {
        setCompanies(companiesData);
        setAllSpecialities(specData);
        setAllReservations(Array.isArray(reservationsData) ? reservationsData : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Refresca la lista de empresas
  const fetchCompanies = () =>
    fetch("/getAllCompanies")
      .then((r) => r.json())
      .then(setCompanies)
      .catch(console.error);

  // Abre/cierra tarjetas
  const toggleCard = (id) =>
    setExpandedCards((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Valida un convenio
  const handleValidateConvenio = async (idAuxEmpresa) => {
    await fetch(`/validateConvenio/${idAuxEmpresa}`, { method: "POST" });
    setViewingConvenio(null);
    fetchCompanies();
  };

  // Resetea la contraseña de una empresa
  const handleResetPassword = async (idAuxEmpresa) => {
    const res = await fetch(`/resetPassword/${idAuxEmpresa}`, {
      method: "POST",
    });

    if (!res.ok) {
      alert("Error al resetear la contraseña");
      return;
    }

    const { newPassword } = await res.json();

    setResetResult((prev) => ({
      ...prev,
      [idAuxEmpresa]: newPassword,
    }));
  };

  // Opciones de especialidades disponibles para el filtro
  const filterOptions = allSpecialities.filter((s) =>
    companies.some((c) => {
      const items = parseEspecialidades(c.especialidadYCantAlumnos);
      return items.some((i) => i.idEspecialidad === s.idEspecialidad);
    }),
  );

  // Cursos académicos disponibles, ordenados de más reciente a más antiguo
  const availableCourses = [...new Set(
    companies.map((c) => getCourseLabel(c.fechaPeticion)).filter(Boolean)
  )].sort((a, b) => b.localeCompare(a));

  // Aplicación de filtros
  let filtered = companies.filter((c) => {
    if (filterEsp) {
      const items = parseEspecialidades(c.especialidadYCantAlumnos);
      if (!items.some((i) => i.idEspecialidad === parseInt(filterEsp)))
        return false;
    }

    if (filterConvenio === "validado" && !c.convenio_validado) return false;

    if (
      filterConvenio === "pendiente" &&
      (!c.tieneConvenio || c.convenio_validado)
    )
      return false;

    if (filterConvenio === "sin_convenio" && c.tieneConvenio) return false;

    if (filterCourse && getCourseLabel(c.fechaPeticion) !== filterCourse)
      return false;

    return true;
  });

  // Ordenación de resultados
  filtered = [...filtered].sort((a, b) => {
    if (sortBy === "fecha_desc")
      return new Date(b.fechaPeticion) - new Date(a.fechaPeticion);

    if (sortBy === "fecha_asc")
      return new Date(a.fechaPeticion) - new Date(b.fechaPeticion);

    if (sortBy === "nombre_az")
      return a.razonSocial.localeCompare(b.razonSocial);

    if (sortBy === "nombre_za")
      return b.razonSocial.localeCompare(a.razonSocial);

    return 0;
  });

  // Cálculo de contadores
  const totalValidado = companies.filter((c) => c.convenio_validado).length;

  const totalPendiente = companies.filter(
    (c) => c.tieneConvenio && !c.convenio_validado,
  ).length;

  const totalSin = companies.filter((c) => !c.tieneConvenio).length;

  // Clases reutilizables para selects
  const selectCls = `bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm
    focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all duration-200`;

  // Estado de carga
  if (loading)
    return (
      <div className="space-y-6 px-10 py-8 max-w-[1100px] mx-auto w-full flex-1">
        <p className="text-center text-gray-500 py-12">Cargando empresas…</p>
      </div>
    );

  // Estado de error
  if (error)
    return (
      <div className="space-y-6 px-10 py-8 max-w-[1100px] mx-auto w-full flex-1">
        <p className="text-center text-red-500 py-12">Error: {error}</p>
      </div>
    );

  return (
    <div className="space-y-6 px-10 py-8 max-w-[1100px] mx-auto w-full flex-1">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="border-l-4 border-red-600 pl-4 sm:pl-5">
          <h1 className="text-xl sm:text-2xl font-semibold">
            Gestión de empresas
          </h1>

          <p className="text-sm text-gray-500">
            {filtered.length} empresa
            {filtered.length !== 1 ? "s" : ""} mostradas · {companies.length} en
            total
          </p>
        </div>

        {/* Contadores */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`${signedBadgeClass} bg-green-500/10 text-green-800`}>
            <IoIosCheckmarkCircleOutline /> {totalValidado} validado
            {totalValidado !== 1 ? "s" : ""}
          </span>

          <span className={`${signedBadgeClass} bg-yellow-400/15 text-yellow-800`}>
            <MdPendingActions /> {totalPendiente} pendiente
            {totalPendiente !== 1 ? "s" : ""}
          </span>

          <span className={`${signedBadgeClass} bg-red-500/10 text-red-800`}>
            <MdOutlineCancel /> {totalSin} sin convenio
          </span>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-center">
        {/* Filtro por especialidad */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 w-full sm:w-auto">
          <label className="text-[0.8rem] font-semibold sm:whitespace-nowrap text-muted">
            Especialidad:
          </label>

          <select
            className={`${selectCls} w-full sm:w-auto`}
            value={filterEsp}
            onChange={(e) => setFilterEsp(e.target.value)}
          >
            <option value="">Todas</option>

            {filterOptions.map((s) => (
              <option key={s.idEspecialidad} value={s.idEspecialidad}>
                {s.nombreEsp}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro por convenio */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 w-full sm:w-auto">
          <label className="text-[0.8rem] font-semibold sm:whitespace-nowrap text-muted">
            Convenio:
          </label>

          <select
            className={`${selectCls} w-full sm:w-auto`}
            value={filterConvenio}
            onChange={(e) => setFilterConvenio(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="validado">Validados</option>
            <option value="pendiente">Pendientes</option>
            <option value="sin_convenio">Sin convenio</option>
          </select>
        </div>

        {/* Filtro por curso académico */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 w-full sm:w-auto">
          <label className="text-[0.8rem] font-semibold sm:whitespace-nowrap text-muted">
            Curso:
          </label>

          <select
            className={`${selectCls} w-full sm:w-auto`}
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
          >
            <option value="">Todos los cursos</option>
            {availableCourses.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Ordenación */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 w-full sm:w-auto">
          <label className="text-[0.8rem] font-semibold sm:whitespace-nowrap text-muted">
            Ordenar:
          </label>

          <select
            className={`${selectCls} w-full sm:w-auto`}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="fecha_desc">Fecha (más reciente)</option>
            <option value="fecha_asc">Fecha (más antigua)</option>
            <option value="nombre_az">Nombre A → Z</option>
            <option value="nombre_za">Nombre Z → A</option>
          </select>
        </div>
      </div>

      {/* Reservas activas de alumnos */}
      <div className="rounded-xl border bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowReservas((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div>
            <p className="font-semibold text-gray-900">Reservas de alumnos</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {allReservations.length} reserva{allReservations.length !== 1 ? "s" : ""} activa{allReservations.length !== 1 ? "s" : ""}
              {allReservations.filter((r) => r.documentoSubido && !r.anexo2FirmadoRecibido && !r.anexo3FirmadoRecibido).length > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {allReservations.filter((r) => r.documentoSubido && !r.anexo2FirmadoRecibido && !r.anexo3FirmadoRecibido).length} pendiente{allReservations.filter((r) => r.documentoSubido && !r.anexo2FirmadoRecibido && !r.anexo3FirmadoRecibido).length !== 1 ? "s" : ""} de validar
                </span>
              )}
            </p>
          </div>
          <span className={`text-xs text-gray-400 transition-transform duration-200 ${showReservas ? "rotate-180" : ""}`}>
            ▾
          </span>
        </button>

        {showReservas && (
          <div className="border-t px-5 py-4">
            <ReservasAdmin reservations={allReservations} />
          </div>
        )}
      </div>

      {/* Lista de empresas */}
      <div className="space-y-4">
        {filtered.length === 0 && (
          <div className="text-center p-12 text-gray-500 bg-gray-50 border border-gray-200 rounded-xl">
            No hay empresas que coincidan con los filtros.
          </div>
        )}

        {filtered.map((empresa) => (
          <CompanyCard
            key={empresa.idAuxEmpresa}
            empresa={empresa}
            isExpanded={expandedCards.has(empresa.idAuxEmpresa)}
            onToggle={toggleCard}
            onViewConvenio={setViewingConvenio}
            onResetPassword={handleResetPassword}
            resetResult={resetResult}
            allSpecialities={allSpecialities}
          />
        ))}
      </div>

      {/* Modal visor de convenio */}
      <ConvenioViewer
        empresa={viewingConvenio}
        onClose={() => setViewingConvenio(null)}
        onValidate={handleValidateConvenio}
      />
    </div>
  );
};

export default AdminCompanyView;
