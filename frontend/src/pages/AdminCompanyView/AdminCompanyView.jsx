import { useEffect, useState } from "react";
import { useUser } from '../../context/UserContext';
import { useNavigate } from "react-router-dom";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { MdOutlineCancel, MdPendingActions } from "react-icons/md";

import "../../styles/forms.css";
import { signedBadgeClass } from "../../components/ui/cardStyles";
import { getJSON, postJSON } from "../../utils/api.js";

import ConvenioViewer from "./components/ConvenioViewer";
import CompanyCard from "./components/CompanyCard";
import ReservasAdmin from "./components/ReservasAdmin";

function getCourseLabel(dateStr) {
  if (!dateStr) return null;
  try { const y = new Date(dateStr).getFullYear(); return `${y}/${y + 1}`; } catch { return null; }
}

const AdminCompanyView = () => {
  const { user } = useUser();
  const navigate = useNavigate();

  const [mainView, setMainView] = useState("empresas");

  const [companies, setCompanies] = useState([]);
  const [allReservations, setAllReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [viewingConvenio, setViewingConvenio] = useState(null);
  const [resetResult, setResetResult] = useState({});

  const [filterEsp, setFilterEsp] = useState("");
  const [filterConvenio, setFilterConvenio] = useState("");
  const [filterCourse, setFilterCourse] = useState("");
  const [sortBy, setSortBy] = useState("fecha_desc");

  useEffect(() => {
    if (!user) { navigate("/login"); return; }

    Promise.all([getJSON("/solicitudes/empresa/todas"), getJSON("/reservas")])
      .then(([companiesData, reservationsData]) => {
        setCompanies(Array.isArray(companiesData) ? companiesData : []);
        setAllReservations(Array.isArray(reservationsData) ? reservationsData : []);
        setLoading(false);
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [user, navigate]);

  const fetchCompanies = () =>
    getJSON("/solicitudes/empresa/todas").then((d) => setCompanies(Array.isArray(d) ? d : [])).catch(console.error);

  const toggleCard = (id) =>
    setExpandedCards((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleValidateConvenio = async (idDocumento) => {
    try {
      await postJSON(`/documentos/${idDocumento}/validar`, {});
      setViewingConvenio(null);
      fetchCompanies();
    } catch (err) { console.error(err); }
  };

  const handleResetPassword = async (idSolicitudEmpresa) => {
    const empresa = companies.find(c => c.id_solicitud_empresa === idSolicitudEmpresa);
    const idUsuario = empresa?.id_usuario;
    if (!idUsuario) { alert("No se encontró usuario para esta empresa"); return; }
    try {
      const { newPassword } = await postJSON(`/usuarios/${idUsuario}/resetPassword`, {});
      setResetResult((prev) => ({ ...prev, [idSolicitudEmpresa]: newPassword }));
    } catch (err) { alert("Error al resetear la contraseña"); }
  };

  // Build unique speciality and course options for filter dropdowns
  const allEspecialidades = [];
  const espSeen = new Set();
  for (const c of companies) {
    for (const e of (c.especialidades || [])) {
      if (!espSeen.has(e.id_especialidad)) { espSeen.add(e.id_especialidad); allEspecialidades.push(e); }
    }
  }
  const availableCourses = [...new Set(companies.map((c) => getCourseLabel(c.fechaPeticion)).filter(Boolean))].sort((a, b) => b.localeCompare(a));

  let filtered = companies.filter((c) => {
    if (filterEsp && !(c.especialidades || []).some(e => String(e.id_especialidad) === String(filterEsp))) return false;
    if (filterConvenio === "validado"    && !c.convenio_validado) return false;
    if (filterConvenio === "pendiente"   && (!c.tieneConvenio || c.convenio_validado)) return false;
    if (filterConvenio === "sin_convenio" && c.tieneConvenio) return false;
    if (filterCourse && getCourseLabel(c.fechaPeticion) !== filterCourse) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === "fecha_desc") return new Date(b.fechaPeticion) - new Date(a.fechaPeticion);
    if (sortBy === "fecha_asc")  return new Date(a.fechaPeticion) - new Date(b.fechaPeticion);
    const na = a.empresa || ""; const nb = b.empresa || "";
    if (sortBy === "nombre_az") return na.localeCompare(nb);
    if (sortBy === "nombre_za") return nb.localeCompare(na);
    return 0;
  });

  const totalValidado  = companies.filter(c => c.convenio_validado).length;
  const totalPendiente = companies.filter(c => c.tieneConvenio && !c.convenio_validado).length;
  const totalSin       = companies.filter(c => !c.tieneConvenio).length;
  const pendingDocs    = allReservations.filter(r => r.id_documento_reserva && r.estado_documento === "PENDIENTE").length;

  const selectCls = "bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all duration-200";

  if (loading) return <div className="space-y-6 px-10 py-8 max-w-[1100px] mx-auto w-full flex-1"><p className="text-center text-gray-500 py-12">Cargando…</p></div>;
  if (error)   return <div className="space-y-6 px-10 py-8 max-w-[1100px] mx-auto w-full flex-1"><p className="text-center text-red-500 py-12">Error: {error}</p></div>;

  return (
    <div className="space-y-6 px-10 py-8 max-w-[1100px] mx-auto w-full flex-1">
      {/* Page header with summary badges */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="border-l-4 border-red-600 pl-4 sm:pl-5">
          <h1 className="text-xl sm:text-2xl font-semibold">Gestión de empresas</h1>
          <p className="text-sm text-gray-500">
            {companies.length} empresa{companies.length !== 1 ? "s" : ""} · {allReservations.length} reserva{allReservations.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`${signedBadgeClass} bg-green-500/10 text-green-800`}><IoIosCheckmarkCircleOutline /> {totalValidado} validado{totalValidado !== 1 ? "s" : ""}</span>
          <span className={`${signedBadgeClass} bg-yellow-400/15 text-yellow-800`}><MdPendingActions /> {totalPendiente} pendiente{totalPendiente !== 1 ? "s" : ""}</span>
          <span className={`${signedBadgeClass} bg-red-500/10 text-red-800`}><MdOutlineCancel /> {totalSin} sin convenio</span>
        </div>
      </div>

      {/* Primary tab toggle */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setMainView("empresas")}
          className={`px-5 py-2.5 text-sm font-semibold transition border-b-2 ${
            mainView === "empresas" ? "border-red-600 text-red-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Empresas
        </button>
        <button
          onClick={() => setMainView("reservas")}
          className={`px-5 py-2.5 text-sm font-semibold transition border-b-2 ${
            mainView === "reservas" ? "border-red-600 text-red-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Reservas
          {pendingDocs > 0 && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {pendingDocs}
            </span>
          )}
        </button>
      </div>

      {/* Reservations panel */}
      {mainView === "reservas" && (
        <ReservasAdmin
          reservations={allReservations}
          onReservationUpdate={() => getJSON("/reservas").then(setAllReservations)}
        />
      )}

      {/* Companies panel */}
      {mainView === "empresas" && (
        <>
          {/* Filter controls */}
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-center">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 w-full sm:w-auto">
              <label className="text-[0.8rem] font-semibold sm:whitespace-nowrap text-muted">Especialidad:</label>
              <select className={`${selectCls} w-full sm:w-auto`} value={filterEsp} onChange={(e) => setFilterEsp(e.target.value)}>
                <option value="">Todas</option>
                {allEspecialidades.map(e => <option key={e.id_especialidad} value={e.id_especialidad}>{e.nombre || e.especialidad}</option>)}
              </select>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 w-full sm:w-auto">
              <label className="text-[0.8rem] font-semibold sm:whitespace-nowrap text-muted">Convenio:</label>
              <select className={`${selectCls} w-full sm:w-auto`} value={filterConvenio} onChange={(e) => setFilterConvenio(e.target.value)}>
                <option value="">Todos</option>
                <option value="validado">Validados</option>
                <option value="pendiente">Pendientes</option>
                <option value="sin_convenio">Sin convenio</option>
              </select>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 w-full sm:w-auto">
              <label className="text-[0.8rem] font-semibold sm:whitespace-nowrap text-muted">Curso:</label>
              <select className={`${selectCls} w-full sm:w-auto`} value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
                <option value="">Todos los cursos</option>
                {availableCourses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 w-full sm:w-auto">
              <label className="text-[0.8rem] font-semibold sm:whitespace-nowrap text-muted">Ordenar:</label>
              <select className={`${selectCls} w-full sm:w-auto`} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="fecha_desc">Fecha (más reciente)</option>
                <option value="fecha_asc">Fecha (más antigua)</option>
                <option value="nombre_az">Nombre A → Z</option>
                <option value="nombre_za">Nombre Z → A</option>
              </select>
            </div>
          </div>

          <p className="text-sm text-gray-500 -mt-2">
            {filtered.length} empresa{filtered.length !== 1 ? "s" : ""} mostradas
          </p>

          {/* Company card list */}
          <div className="space-y-4">
            {filtered.length === 0 && (
              <div className="text-center p-12 text-gray-500 bg-gray-50 border border-gray-200 rounded-xl">
                No hay empresas que coincidan con los filtros.
              </div>
            )}
            {filtered.map(empresa => (
              <CompanyCard
                key={empresa.id_solicitud_empresa}
                empresa={empresa}
                reservations={allReservations.filter(
                  r => String(r.idempresa) === String(empresa.id_empresa)
                )}
                isExpanded={expandedCards.has(empresa.id_solicitud_empresa)}
                onToggle={toggleCard}
                onViewConvenio={setViewingConvenio}
                onResetPassword={handleResetPassword}
                resetResult={resetResult}
              />
            ))}
          </div>
        </>
      )}

      {/* Convenio document viewer modal */}
      <ConvenioViewer
        empresa={viewingConvenio}
        onClose={() => setViewingConvenio(null)}
        onValidate={handleValidateConvenio}
      />
    </div>
  );
};

export default AdminCompanyView;


