import { useEffect, useState } from "react";
import { useUrlFilters } from "../../hooks/useUrlFilters.js";
import { useConvocatoriaEstado } from "../../hooks/useConvocatoriaEstado.js";
import { coincide } from "../../utils/busqueda.js";
import { SOLICITUD } from "../../utils/labels.js";
import FilterBar, { FilterSelect, SearchField, countLabel } from "../../components/ui/FilterBar.jsx";
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
import PageHeader from "../../components/ui/PageHeader";
import PaginationBar, { paginate, usePageClamp } from "../../components/ui/PaginationBar";

const FILTER_DEFAULTS = { q: "", curso: "activa", estado: "", convenio: "", especialidad: "", cambios: "", orden: "fecha_desc" };

const AdminCompanyView = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const toast = useToast();

  const [companies, setCompanies] = useState([]);
  const [allReservations, setAllReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [viewingConvenio, setViewingConvenio] = useState(null);
  const [rejectingConvenio, setRejectingConvenio] = useState(false);
  const [convenioBusy, setConvenioBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { filters, setFilter, reset: resetFilters, active: filtersActive } = useUrlFilters(FILTER_DEFAULTS);
  const { q, especialidad: filterEsp, convenio: filterConvenio, curso, cambios: filterCambios, estado: filterEstado, orden: sortBy } = filters;
  const activaNombre = useConvocatoriaEstado().data?.activa?.nombre || null;
  // "activa" resolves to the active convocatoria; with none active, all are shown.
  const filterCourse = curso === "todas" ? "" : curso === "activa" ? activaNombre || "" : curso;
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
      if (filterEstado && c.estado_validacion !== filterEstado) return false;
      return coincide(q, [c.empresa, c.razonSocial, c.cif, c.nombreCoordinador, c.emailCoordinador, c.municipio]);
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
  }, [q, filterEsp, filterConvenio, filterCourse, filterCambios, filterEstado, sortBy]);

  // Counted within the selected convocatoria, so clicking a chip shows exactly that many.
  const enCurso = companies.filter((c) => !filterCourse || c.convocatoria === filterCourse);
  const totalValidado = enCurso.filter((c) => c.convenio_validado).length;
  const totalPendiente = enCurso.filter((c) => c.tieneConvenio && !c.convenio_validado).length;
  const totalSin = enCurso.filter((c) => !c.tieneConvenio).length;
  const totalCambios = enCurso.filter((c) => c.cambio_pendiente).length;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  // Each chip toggles its filter; clicking the active one clears it.
  const chips = [
    { key: "convenio", value: "validado", tone: "bg-green-500/10 text-green-800", Icon: IoIosCheckmarkCircleOutline, text: plural(totalValidado, "validado", "validados") },
    { key: "convenio", value: "pendiente", tone: "bg-yellow-400/15 text-yellow-800", Icon: MdPendingActions, text: plural(totalPendiente, "pendiente", "pendientes") },
    { key: "convenio", value: "sin_convenio", tone: "bg-red-500/10 text-red-800", Icon: MdOutlineCancel, text: `${totalSin} sin convenio` },
    ...(totalCambios
      ? [{ key: "cambios", value: "pendiente", tone: "bg-amber-100 text-amber-800", Icon: MdPendingActions, text: plural(totalCambios, "cambio pendiente", "cambios pendientes") }]
      : []),
  ];

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
          <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={() => setReloadToken((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      </div>
    );

  return (
    <div className="page-container space-y-6">
      <PageHeader
        kicker="Gestión"
        title="Empresas"
        subtitle="Solicitudes de empresa, convenios, ciclos y plazas, tutores y cambios de datos."
        actions={
          <div className="flex flex-wrap gap-2 text-xs">
            {chips.map(({ key, value, tone, Icon, text }) => {
              const on = filters[key] === value;
              return (
                <button
                  key={`${key}-${value}`}
                  type="button"
                  aria-pressed={on}
                  title={on ? "Quitar este filtro" : "Filtrar la lista"}
                  onClick={() => setFilter(key, on ? "" : value)}
                  className={`${signedBadgeClass} ${tone} cursor-pointer transition-shadow hover:ring-1 hover:ring-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 ${
                    on ? "ring-2 ring-current" : ""
                  }`}
                >
                  <Icon aria-hidden="true" /> {text}
                </button>
              );
            })}
          </div>
        }
      />

      <FilterBar
        label="Buscar y filtrar empresas"
        active={filtersActive}
        onReset={resetFilters}
        count={filtersActive ? `${countLabel(filtered.length, "empresa", "empresas")} de ${companies.length}` : countLabel(filtered.length, "empresa", "empresas")}
      >
        <SearchField
          value={q}
          onChange={(v) => setFilter("q", v)}
          placeholder="Empresa, CIF, coordinador o municipio"
          className="sm:col-span-2 lg:col-span-1"
        />
        <FilterSelect
          label="Convocatoria"
          value={curso}
          onChange={(v) => setFilter("curso", v)}
          options={[
            { value: "activa", label: activaNombre ? `Activa (${activaNombre})` : "Activa (ninguna)" },
            { value: "todas", label: "Todas" },
            ...availableCourses.map((c) => ({ value: c, label: c })),
          ]}
        />
        <FilterSelect
          label="Solicitud"
          value={filterEstado}
          onChange={(v) => setFilter("estado", v)}
          allLabel="Todos los estados"
          options={Object.entries(SOLICITUD).map(([value, { label }]) => ({ value, label }))}
        />
        <FilterSelect
          label="Convenio"
          value={filterConvenio}
          onChange={(v) => setFilter("convenio", v)}
          allLabel="Todos"
          options={[
            { value: "validado", label: "Validados" },
            { value: "pendiente", label: "Pendientes" },
            { value: "sin_convenio", label: "Sin convenio" },
          ]}
        />
        <FilterSelect
          label="Especialidad"
          value={filterEsp}
          onChange={(v) => setFilter("especialidad", v)}
          allLabel="Todas"
          options={allEspecialidades.map((e) => ({ value: String(e.id_especialidad), label: e.nombre || e.especialidad }))}
        />
        <FilterSelect
          label="Cambios de datos"
          value={filterCambios}
          onChange={(v) => setFilter("cambios", v)}
          allLabel="Todos"
          options={[{ value: "pendiente", label: "Pendientes de revisión" }]}
        />
        <FilterSelect
          label="Ordenar por"
          value={sortBy}
          onChange={(v) => setFilter("orden", v)}
          options={[
            { value: "fecha_desc", label: "Fecha (más reciente)" },
            { value: "fecha_asc", label: "Fecha (más antigua)" },
            { value: "nombre_az", label: "Nombre A → Z" },
            { value: "nombre_za", label: "Nombre Z → A" },
          ]}
        />
      </FilterBar>

          <div className="space-y-4">
            {filtered.length === 0 && (
              <div role="status" className="rounded-xl2 border border-surface-200 bg-white p-12 text-center shadow-card">
                <p className="font-semibold text-charcoal-950">
                  {filtersActive ? "No hay empresas que coincidan con la búsqueda o los filtros." : "No hay empresas en la convocatoria activa."}
                </p>
                {filtersActive ? (
                  <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={resetFilters}>
                    Quitar filtros
                  </button>
                ) : companies.length > 0 ? (
                  <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={() => setFilter("curso", "todas")}>
                    Ver todas las convocatorias
                  </button>
                ) : null}
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
                isAdmin={user?.rol === "ADMINISTRADOR"}
                onUpdated={refreshCompanyData}
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
              <button type="button" className="btn btn-outline-brand btn-sm" onClick={handleValidateConvenio} disabled={convenioBusy}>
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
