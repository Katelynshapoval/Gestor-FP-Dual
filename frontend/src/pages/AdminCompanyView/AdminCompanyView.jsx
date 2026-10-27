import { useEffect, useState } from "react";
import { useUser } from "../../context/UserContext";
import { useNavigate } from "react-router-dom";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { MdOutlineCancel, MdPendingActions } from "react-icons/md";

import "../../styles/forms.css";
import { signedBadgeClass } from "../../components/ui/cardStyles";
import { getJSON, postJSON } from "../../utils/api.js";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

import CompanyCard from "./components/CompanyCard";
import PdfViewer from "../../components/ui/PdfViewer.jsx";
import MotivoDialog from "../../components/ui/MotivoDialog.jsx";
import ReservasAdmin from "./components/ReservasAdmin";
import PageHeader from "../../components/ui/PageHeader";
import PaginationBar, { paginate, usePageClamp } from "../../components/ui/PaginationBar";

const AdminCompanyView = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const toast = useToast();

  const [mainView, setMainView] = useState("empresas");

  const [companies, setCompanies] = useState([]);
  const [allReservations, setAllReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [viewingConvenio, setViewingConvenio] = useState(null);
  const [rejectingConvenio, setRejectingConvenio] = useState(false);
  const [convenioBusy, setConvenioBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [resetResult, setResetResult] = useState({});

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterEsp, setFilterEsp] = useState("");
  const [filterConvenio, setFilterConvenio] = useState("");
  const [filterCourse, setFilterCourse] = useState("");
  const [filterCambios, setFilterCambios] = useState("");
  const [sortBy, setSortBy] = useState("fecha_desc");
  const [transports, setTransports] = useState([]);
  const [catalogo, setCatalogo] = useState([]);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    setLoading(true);
    setError(null);
    Promise.all([
      getJSON("/solicitudes/empresa/todas"),
      getJSON("/reservas"),
      getJSON("/transportes"),
      getJSON("/especialidades"),
    ])
      .then(([companiesData, reservationsData, transportsData, especialidadesData]) => {
        setCompanies(Array.isArray(companiesData) ? companiesData : []);
        setAllReservations(
          Array.isArray(reservationsData) ? reservationsData : [],
        );
        setTransports(Array.isArray(transportsData) ? transportsData : []);
        setCatalogo(Array.isArray(especialidadesData) ? especialidadesData : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [user, navigate, reloadToken]);

  const fetchCompanies = () =>
    getJSON("/solicitudes/empresa/todas")
      .then((d) => setCompanies(Array.isArray(d) ? d : []))
      .catch(console.error);

  const fetchReservations = () =>
    getJSON("/reservas")
      .then((d) => setAllReservations(Array.isArray(d) ? d : []))
      .catch(console.error);

  const refreshCompanyData = () => Promise.all([fetchCompanies(), fetchReservations()]);

  const toggleCard = (id) =>
    setExpandedCards((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Validation requires the company's signature (Phase 2, D1): the backend
  // explains what is missing and the message is shown as it comes.
  const handleValidateConvenio = async () => {
    setConvenioBusy(true);
    try {
      const data = await postJSON(`/documentos/${viewingConvenio.id_documento_convenio}/validar`, {});
      toast.success(data.message || "Convenio validado.");
      setViewingConvenio(null);
      fetchCompanies();
    } catch (err) {
      toast.error(err.message || "No se pudo validar el convenio.");
    } finally {
      setConvenioBusy(false);
    }
  };

  // WF-7: the convenio can be rejected from its viewer. The company application
  // itself is not changed (decision D6 is still open).
  const handleRejectConvenio = async (motivo) => {
    await postJSON(`/documentos/${viewingConvenio.id_documento_convenio}/rechazar`, { motivo });
    toast.success("Convenio rechazado. La empresa debe subir uno nuevo.");
    setRejectingConvenio(false);
    setViewingConvenio(null);
    fetchCompanies();
  };

  // The temporary password stays on screen for two minutes at most (WF-10)
  const clearResetResult = (idSolicitudEmpresa) =>
    setResetResult((prev) => {
      const next = { ...prev };
      delete next[idSolicitudEmpresa];
      return next;
    });

  const handleResetPassword = async (idSolicitudEmpresa) => {
    const empresa = companies.find(
      (c) => c.id_solicitud_empresa === idSolicitudEmpresa,
    );
    const idUsuario = empresa?.id_usuario;
    if (!idUsuario) {
      toast.error("No se encontró usuario para esta empresa");
      return;
    }
    try {
      const { newPassword } = await postJSON(
        `/usuarios/${idUsuario}/resetPassword`,
        {},
      );
      setResetResult((prev) => ({
        ...prev,
        [idSolicitudEmpresa]: newPassword,
      }));
      setTimeout(() => clearResetResult(idSolicitudEmpresa), 2 * 60 * 1000);
      toast.success("Contraseña restablecida. Cópiala ahora: se ocultará en 2 minutos.");
    } catch (err) {
      toast.error(err.message || "Error al resetear la contraseña");
    }
  };

  // Build unique speciality and course options for filter dropdowns
  const allEspecialidades = [];
  const espSeen = new Set();
  for (const c of companies) {
    for (const e of c.especialidades || []) {
      if (!espSeen.has(e.id_especialidad)) {
        espSeen.add(e.id_especialidad);
        allEspecialidades.push(e);
      }
    }
  }
  // WF-9: the course is the application's convocatoria, not its submission date.
  const availableCourses = [
    ...new Set(companies.map((c) => c.convocatoria).filter(Boolean)),
  ].sort((a, b) => b.localeCompare(a));

  let filtered = companies
    .filter((c) => {
      if (
        filterEsp &&
        !(c.especialidades || []).some(
          (e) => String(e.id_especialidad) === String(filterEsp),
        )
      )
        return false;
      if (filterConvenio === "validado" && !c.convenio_validado) return false;
      if (
        filterConvenio === "pendiente" &&
        (!c.tieneConvenio || c.convenio_validado)
      )
        return false;
      if (filterConvenio === "sin_convenio" && c.tieneConvenio) return false;
      if (filterCourse && c.convocatoria !== filterCourse) return false;
      if (filterCambios === "pendiente" && !c.cambio_pendiente) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "fecha_desc")
        return new Date(b.fechaPeticion) - new Date(a.fechaPeticion);
      if (sortBy === "fecha_asc")
        return new Date(a.fechaPeticion) - new Date(b.fechaPeticion);
      const na = a.empresa || "";
      const nb = b.empresa || "";
      if (sortBy === "nombre_az") return na.localeCompare(nb);
      if (sortBy === "nombre_za") return nb.localeCompare(na);
      return 0;
    });

  const { pageItems: companyPage, pagination: companyPagination } = paginate(filtered, page, pageSize);
  usePageClamp(page, companyPagination.page, setPage);

  useEffect(() => {
    setPage(1);
  }, [filterEsp, filterConvenio, filterCourse, filterCambios, sortBy]);

  const totalValidado = companies.filter((c) => c.convenio_validado).length;
  const totalPendiente = companies.filter(
    (c) => c.tieneConvenio && !c.convenio_validado,
  ).length;
  const totalSin = companies.filter((c) => !c.tieneConvenio).length;
  const totalCambios = companies.filter((c) => c.cambio_pendiente).length;
  const pendingDocs = allReservations.filter(
    (r) => r.documentos_resumen?.anexo?.estado_operativo === "PENDIENTE_VALIDACION",
  ).length;

  const selectCls =
    "rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-charcoal-900 outline-none transition-colors duration-150 focus:outline-none focus-visible:border-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/20";

  if (loading)
    return (
      <div className="page-container">
        <p role="status" className="rounded-xl2 border border-surface-200 bg-white py-12 text-center text-sm text-muted shadow-card">
          Cargando empresas y reservas…
        </p>
      </div>
    );
  if (error)
    return (
      <div className="page-container">
        <div role="alert" className="rounded-xl2 border border-surface-200 bg-white px-6 py-12 text-center shadow-card">
          <p className="font-semibold text-charcoal-950">No se pudieron cargar las empresas.</p>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button type="button" className="btn btn-primary btn-sm mt-4" onClick={() => setReloadToken((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      </div>
    );

  return (
    <div className="page-container space-y-6">
      <PageHeader
        kicker="Administración"
        title="Gestión de empresas"
        subtitle={`${companies.length} empresa${companies.length !== 1 ? "s" : ""} · ${allReservations.length} reserva${allReservations.length !== 1 ? "s" : ""}`}
        actions={
          <div className="flex flex-wrap gap-2 text-xs">
            <span
              className={`${signedBadgeClass} bg-green-500/10 text-green-800`}
            >
              <IoIosCheckmarkCircleOutline /> {totalValidado} validado
              {totalValidado !== 1 ? "s" : ""}
            </span>
            <span
              className={`${signedBadgeClass} bg-yellow-400/15 text-yellow-800`}
            >
              <MdPendingActions /> {totalPendiente} pendiente
              {totalPendiente !== 1 ? "s" : ""}
            </span>
            <span className={`${signedBadgeClass} bg-red-500/10 text-red-800`}>
              <MdOutlineCancel /> {totalSin} sin convenio
            </span>
            {totalCambios ? (
              <span
                className={`${signedBadgeClass} bg-amber-100 text-amber-800`}
              >
                <MdPendingActions /> {totalCambios} cambio
                {totalCambios !== 1 ? "s" : ""} pendiente
                {totalCambios !== 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
        }
      />

      <div className="flex gap-1 border-b border-surface-200" role="tablist" aria-label="Vista">
        <button
          type="button"
          role="tab"
          aria-selected={mainView === "empresas"}
          onClick={() => setMainView("empresas")}
          className={`px-5 py-2.5 text-sm font-semibold transition border-b-2 ${
            mainView === "empresas"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-muted hover:text-charcoal-900"
          }`}
        >
          Empresas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainView === "reservas"}
          onClick={() => setMainView("reservas")}
          className={`px-5 py-2.5 text-sm font-semibold transition border-b-2 ${
            mainView === "reservas"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-muted hover:text-charcoal-900"
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

      {mainView === "reservas" && (
        <ReservasAdmin reservations={allReservations} onReservationUpdate={refreshCompanyData} />
      )}

      {mainView === "empresas" && (
        <>
          <div className="flex flex-col flex-wrap gap-3 rounded-xl2 border border-surface-200 bg-white p-3 shadow-card sm:flex-row sm:items-center">
            <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              <label className="text-[0.8rem] font-semibold sm:whitespace-nowrap text-muted">
                Especialidad:
              </label>
              <select
                className={`${selectCls} w-full sm:w-auto`}
                value={filterEsp}
                onChange={(e) => setFilterEsp(e.target.value)}
              >
                <option value="">Todas</option>
                {allEspecialidades.map((e) => (
                  <option key={e.id_especialidad} value={e.id_especialidad}>
                    {e.nombre || e.especialidad}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
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
            <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
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
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              <label className="text-[0.8rem] font-semibold sm:whitespace-nowrap text-muted">
                Cambios:
              </label>
              <select
                className={`${selectCls} w-full sm:w-auto`}
                value={filterCambios}
                onChange={(e) => setFilterCambios(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="pendiente">Pendientes de revisión</option>
              </select>
            </div>
            <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
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

          <div className="space-y-4">
            {filtered.length === 0 && (
              <div className="rounded-xl2 border border-surface-200 bg-white p-12 text-center text-muted shadow-card">
                No hay empresas que coincidan con los filtros.
              </div>
            )}
            {companyPage.map((empresa) => (
              <CompanyCard
                key={empresa.id_solicitud_empresa}
                empresa={empresa}
                reservations={allReservations.filter(
                  (r) => String(r.id_solicitud_empresa) === String(empresa.id_solicitud_empresa),
                )}
                transports={transports}
                catalogo={catalogo}
                isExpanded={expandedCards.has(empresa.id_solicitud_empresa)}
                onToggle={toggleCard}
                onViewConvenio={setViewingConvenio}
                onResetPassword={
                  user?.rol === "ADMINISTRADOR" ? handleResetPassword : undefined
                }
                onClearResetPassword={clearResetResult}
                onUpdated={refreshCompanyData}
                resetResult={resetResult}
              />
            ))}
            <PaginationBar
              pagination={companyPagination}
              page={companyPagination.page}
              onPage={setPage}
              onPageSize={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              noun="empresa"
            />
          </div>
        </>
      )}

      {/* Convenio viewer: the shared PdfViewer with review actions */}
      <PdfViewer
        open={Boolean(viewingConvenio)}
        onClose={() => setViewingConvenio(null)}
        idDocumento={viewingConvenio?.id_documento_convenio}
        title={`Convenio · ${viewingConvenio?.empresa || viewingConvenio?.razonSocial || ""}`}
        description={viewingConvenio?.convocatoria}
        estado={
          viewingConvenio
            ? { kind: "validacion", value: viewingConvenio.convenio_estado || (viewingConvenio.convenio_validado ? "VALIDADO" : "PENDIENTE") }
            : undefined
        }
        busy={convenioBusy}
        actions={
          viewingConvenio && viewingConvenio.convenio_estado === "PENDIENTE" && viewingConvenio.id_documento_convenio ? (
            <>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setRejectingConvenio(true)} disabled={convenioBusy}>
                Rechazar convenio
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleValidateConvenio} disabled={convenioBusy}>
                Validar convenio
              </button>
            </>
          ) : null
        }
      />
      <MotivoDialog
        open={rejectingConvenio}
        onClose={() => setRejectingConvenio(false)}
        onConfirm={handleRejectConvenio}
        title="Rechazar convenio"
        description="La empresa verá el motivo y tendrá que subir un convenio nuevo. La solicitud de la empresa no cambia de estado."
        label="Motivo del rechazo"
        confirmLabel="Rechazar convenio"
        busyLabel="Rechazando…"
      />
    </div>
  );
};

export default AdminCompanyView;
