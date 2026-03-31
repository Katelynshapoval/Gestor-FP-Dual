import { useEffect, useState } from "react";
import { useUser } from "../../globales/User";
import { useNavigate } from "react-router-dom";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { MdOutlineCancel, MdPendingActions } from "react-icons/md";
import "../../shared_styles/forms.css";
import "../../pages/LinkStudents/LinkStudents.css";
import ConvenioViewer from "./components/ConvenioViewer";
import { parseEspecialidades } from "./helpers";
import CompanyCard from "./components/CompanyCard";

const AdminCompanyView = () => {
  const { user } = useUser();
  const navigate = useNavigate();

  const [companies, setCompanies] = useState([]);
  const [allSpecialities, setAllSpecialities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [viewingConvenio, setViewingConvenio] = useState(null);
  const [resetResult, setResetResult] = useState({});

  // Filtros
  const [filterEsp, setFilterEsp] = useState("");
  const [filterConvenio, setFilterConvenio] = useState("");
  const [sortBy, setSortBy] = useState("fecha_desc");

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    Promise.all([
      fetch("/getAllCompanies").then((r) => r.json()),
      fetch("/getAllSpecialities").then((r) => r.json()),
    ])
      .then(([companiesData, specData]) => {
        setCompanies(companiesData);
        setAllSpecialities(specData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const fetchCompanies = () =>
    fetch("/getAllCompanies")
      .then((r) => r.json())
      .then(setCompanies)
      .catch(console.error);

  const toggleCard = (id) =>
    setExpandedCards((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleValidateConvenio = async (idAuxEmpresa) => {
    await fetch(`/validateConvenio/${idAuxEmpresa}`, { method: "POST" });
    setViewingConvenio(null);
    fetchCompanies();
  };

  const handleResetPassword = async (idAuxEmpresa) => {
    const res = await fetch(`/resetPassword/${idAuxEmpresa}`, {
      method: "POST",
    });
    if (!res.ok) {
      alert("Error al resetear la contraseña");
      return;
    }
    const { newPassword } = await res.json();
    setResetResult((prev) => ({ ...prev, [idAuxEmpresa]: newPassword }));
  };

  // Especialidades únicas (con nombre si está disponible) para el filtro
  const filterOptions = allSpecialities.filter((s) =>
    companies.some((c) => {
      const items = parseEspecialidades(c.especialidadYCantAlumnos);
      return items.some((i) => i.idEspecialidad === s.idEspecialidad);
    }),
  );

  // Filtrado
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
    return true;
  });

  // Ordenación
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

  const totalValidado = companies.filter((c) => c.convenio_validado).length;
  const totalPendiente = companies.filter(
    (c) => c.tieneConvenio && !c.convenio_validado,
  ).length;
  const totalSin = companies.filter((c) => !c.tieneConvenio).length;

  const selectCls = `bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm
    focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all duration-200`;

  if (loading)
    return (
      <div className="space-y-6 px-10 py-8 max-w-[1100px] mx-auto w-full flex-1">
        <p className="text-center text-gray-500 py-12">Cargando empresas…</p>
      </div>
    );

  if (error)
    return (
      <div className="space-y-6 px-10 py-8 max-w-[1100px] mx-auto w-full flex-1">
        <p className="text-center text-red-500 py-12">Error: {error}</p>
      </div>
    );

  return (
    <div className="space-y-6 px-10 py-8 max-w-[1100px] mx-auto w-full flex-1">
      {/* ── CABECERA ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="border-l-4 border-red-600 pl-4 sm:pl-5">
          <h1 className="text-xl sm:text-2xl font-semibold">
            Gestión de empresas
          </h1>
          <p className="text-sm text-gray-500">
            {filtered.length} empresa{filtered.length !== 1 ? "s" : ""}
            mostradas · {companies.length} en total
          </p>
        </div>

        {/* CONTADORES DE ESTADO */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="signed-badge bg-green-500/10 text-green-800">
            <IoIosCheckmarkCircleOutline /> {totalValidado} validado
            {totalValidado !== 1 ? "s" : ""}
          </span>
          <span className="signed-badge bg-yellow-400/15 text-yellow-800">
            <MdPendingActions /> {totalPendiente} pendiente
            {totalPendiente !== 1 ? "s" : ""}
          </span>
          <span className="signed-badge bg-red-500/10 text-red-800">
            <MdOutlineCancel /> {totalSin} sin convenio
          </span>
        </div>
      </div>

      {/* ── FILTROS Y ORDENACIÓN ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-[0.8rem] font-semibold whitespace-nowrap text-[var(--text-muted)]">
            Especialidad:
          </label>
          <select
            className={selectCls}
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

        <div className="flex items-center gap-2">
          <label className="text-[0.8rem] font-semibold whitespace-nowrap text-[var(--text-muted)]">
            Convenio:
          </label>
          <select
            className={selectCls}
            value={filterConvenio}
            onChange={(e) => setFilterConvenio(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="validado">✅ Validados</option>
            <option value="pendiente">⏳ Pendientes</option>
            <option value="sin_convenio">❌ Sin convenio</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[0.8rem] font-semibold whitespace-nowrap text-[var(--text-muted)]">
            Ordenar:
          </label>
          <select
            className={selectCls}
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

      {/* ── LISTA DE EMPRESAS ── */}
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

      {/* ── MODAL VISOR CONVENIO ── */}
      <ConvenioViewer
        empresa={viewingConvenio}
        onClose={() => setViewingConvenio(null)}
        onValidate={handleValidateConvenio}
      />
    </div>
  );
};

export default AdminCompanyView;
