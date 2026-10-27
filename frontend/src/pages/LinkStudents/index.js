import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import RequestFilters, { countLabel } from "./components/RequestFilters";
import StudentCard from "./components/StudentCard";
import { useLinkStudents } from "./hooks/useLinkStudents";
import PageHeader from "../../components/ui/PageHeader";
import PaginationBar, { paginate, usePageClamp } from "../../components/ui/PaginationBar";

// What a company sees instead of the list when it cannot reserve yet (WF-14).
const COMPANY_STATE = {
  SIN_SOLICITUD: {
    tone: "warning",
    title: "Tu empresa no tiene solicitud en la convocatoria activa",
    text: "Para consultar y reservar alumnos, participa en la convocatoria actual desde tu portal.",
    link: { to: "/companyMain", label: "Ir a mi portal" },
  },
  PENDIENTE: {
    tone: "warning",
    title: "Tu solicitud está pendiente de validación",
    text: "Podrás consultar y reservar alumnos cuando el centro valide el convenio de tu empresa.",
  },
  RECHAZADO: {
    tone: "danger",
    title: "Tu solicitud ha sido rechazada",
    text: "Consulta el motivo en tu portal o contacta con el centro.",
    link: { to: "/companyMain", label: "Ir a mi portal" },
  },
};

const TONE = {
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
};

function StateCard({ children, role }) {
  return (
    <div role={role} className="rounded-xl2 border border-surface-200 bg-white px-6 py-12 text-center shadow-card">
      {children}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="animate-pulse rounded-xl2 border border-surface-200 bg-white px-5 py-4 shadow-card">
          <div className="h-4 w-48 rounded bg-surface-200" />
          <div className="mt-2 h-3 w-32 rounded bg-surface-100" />
        </div>
      ))}
    </div>
  );
}

const LinkStudents = () => {
  const {
    user,
    status,
    error,
    refreshing,
    linkRequests,
    companyOffers,
    companyState,
    expandedCards,
    filters,
    setFilter,
    resetFilters,
    filtersActive,
    activaNombre,
    filtered,
    specialities,
    convocatorias,
    isEmpresa,
    toggleCard,
    validateAlumno,
    rejectSolicitud,
    reopenSolicitud,
    reserveStudent,
    cancelReservation,
    adminReserve,
    fetchLinkRequests,
  } = useLinkStudents();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { pageItems, pagination } = paginate(filtered, page, pageSize);
  usePageClamp(page, pagination.page, setPage);

  useEffect(() => {
    setPage(1);
  }, [filters.q, filters.convocatoria, filters.especialidad, filters.estado, filters.reserva]);

  const blocked = isEmpresa && COMPANY_STATE[companyState];
  const ready = status === "ready" && !blocked;
  const hasFilters = filtersActive;

  const subtitle = isEmpresa
    ? "Alumnos validados de tus ciclos en la convocatoria activa. Reserva a los que te interesen."
    : "Revisa solicitudes y documentos, valida alumnos y gestiona sus reservas.";

  return (
    <div className="flex-1 bg-surface-100">
      <div className="page-container space-y-6">
        <PageHeader
          kicker={isEmpresa ? "Mi empresa" : "Gestión"}
          title={isEmpresa ? "Alumnos disponibles" : "Alumnos"}
          subtitle={subtitle}
          className="mb-0"
        />

        {ready && (
          <RequestFilters
            filters={filters}
            setFilter={setFilter}
            onReset={resetFilters}
            active={filtersActive}
            specialities={specialities}
            convocatorias={convocatorias}
            activaNombre={activaNombre}
            isEmpresa={isEmpresa}
            count={
              hasFilters
                ? `${countLabel(filtered.length, "alumno", "alumnos")} de ${linkRequests.length}`
                : countLabel(filtered.length, "alumno", "alumnos")
            }
          />
        )}

        <div className="space-y-4" aria-busy={status === "loading" || refreshing}>
          {isEmpresa && ready && (
            <p className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium leading-6 text-brand-800">
              Una reserva no es definitiva hasta que el centro la confirma, con el Anexo II o III firmado y validado.
              Hasta entonces, otras empresas también pueden reservar al alumno.
            </p>
          )}

          {status === "loading" ? (
            <SkeletonList />
          ) : status === "error" ? (
            <StateCard role="alert">
              <p className="font-semibold text-charcoal-950">No se pudieron cargar los datos.</p>
              <p className="mt-2 text-sm text-muted">{error?.message}</p>
              <button type="button" className="btn btn-primary btn-sm mt-4" onClick={fetchLinkRequests}>
                Reintentar
              </button>
            </StateCard>
          ) : blocked ? (
            <div className={`rounded-xl2 border p-8 text-center shadow-card ${TONE[blocked.tone]}`}>
              <p className="font-semibold">{blocked.title}</p>
              <p className="mt-2 text-sm">{blocked.text}</p>
              {blocked.link && (
                <Link to={blocked.link.to} className="btn btn-secondary btn-sm mt-4">
                  {blocked.link.label}
                </Link>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <StateCard role="status">
              <p className="font-semibold text-charcoal-950">
                {linkRequests.length === 0
                  ? isEmpresa
                    ? "No hay alumnos validados disponibles para tus ciclos en este momento."
                    : "Todavía no hay solicitudes de alumnos."
                  : hasFilters
                    ? "No hay alumnos que coincidan con la búsqueda o los filtros."
                    : "No hay solicitudes en la convocatoria activa."}
              </p>
              {linkRequests.length > 0 && hasFilters && (
                <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={resetFilters}>
                  Quitar filtros
                </button>
              )}
              {linkRequests.length > 0 && !hasFilters && !isEmpresa && (
                <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={() => setFilter("convocatoria", "todas")}>
                  Ver todas las convocatorias
                </button>
              )}
            </StateCard>
          ) : (
            <>
              {pageItems.map((r) => (
                <StudentCard
                  key={r.id_solicitud_alumno}
                  r={r}
                  isExpanded={expandedCards.has(r.id_solicitud_alumno)}
                  onToggle={toggleCard}
                  companyOffers={companyOffers}
                  onReserve={reserveStudent}
                  onCancel={cancelReservation}
                  onAdminReserve={adminReserve}
                  onChanged={fetchLinkRequests}
                  onValidarAlumno={validateAlumno}
                  onRechazarSolicitud={rejectSolicitud}
                  onReabrirSolicitud={reopenSolicitud}
                  user={user}
                />
              ))}
              <PaginationBar
                pagination={pagination}
                page={pagination.page}
                onPage={setPage}
                onPageSize={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                noun="alumno"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LinkStudents;
