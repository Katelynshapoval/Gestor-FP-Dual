import { ofuscarId } from "../../utils/idObfuscation.js";

import DocViewer from "./components/DocViewer";
import RequestFilters from "./components/RequestFilters";
import StudentCard from "./components/StudentCard";
import { useLinkStudents } from "./hooks/useLinkStudents";
import PageHeader from "../../components/ui/PageHeader";

const LinkStudents = () => {
  const {
    user,
    navigate,
    companyOffers,
    companyStatus,
    showDoc,
    expandedCards,
    selectedSpeciality,
    setSelectedSpeciality,
    selectedConvocatoria,
    setSelectedConvocatoria,
    filtered,
    specialities,
    convocatorias,
    isEmpresa,
    toggleCard,
    getDoc,
    closeDocViewer,
    validateDoc,
    rejectDoc,
    validateAlumno,
    rejectSolicitud,
    reserveStudent,
    cancelReservation,
    adminReserve,
    adminCancel,
    adminReassign,
  } = useLinkStudents();

  const companyValidated = !isEmpresa || companyStatus === "VALIDADO";

  return (
    <div className="flex-1 bg-surface-100">
      <div className="page-container space-y-6">
        <PageHeader
          kicker="Asignaciones"
          title="Peticiones de alumnos"
          subtitle={
            isEmpresa && !companyValidated
              ? "Tu empresa debe ser validada antes de poder consultar alumnos."
              : `${filtered.length} alumno${filtered.length !== 1 ? "s" : ""} disponibles según los filtros actuales.`
          }
          actions={
            <RequestFilters
              selectedSpeciality={selectedSpeciality}
              onSpecialityChange={setSelectedSpeciality}
              selectedConvocatoria={selectedConvocatoria}
              onConvocatoriaChange={setSelectedConvocatoria}
              specialities={specialities}
              convocatorias={convocatorias}
              isEmpresa={isEmpresa}
            />
          }
        />

        <div className="space-y-4">
          {isEmpresa && (
            <p className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium leading-6 text-brand-800">
              La asignación de un alumno no es definitiva hasta la firma del
              Anexo 2 o 3. Hasta entonces, el alumno puede ser asignado a otra
              empresa.
            </p>
          )}

          {isEmpresa && !companyValidated ? (
            <div className="rounded-xl2 border border-amber-200 bg-amber-50 p-8 text-center shadow-card">
              <p className="font-semibold text-amber-900">
                Tu empresa todavía no está validada
              </p>

              <p className="mt-2 text-sm text-amber-800">
                Podrás consultar y reservar alumnos cuando el centro valide el
                convenio de tu empresa.
              </p>
            </div>
          ) : (
            filtered.length === 0 && (
              <div className="rounded-xl2 border border-surface-200 bg-white p-12 text-center text-muted shadow-card">
                No hay alumnos que coincidan con los filtros actuales.
              </div>
            )
          )}

          {filtered.map((r) => (
            <StudentCard
              key={r.id_solicitud_alumno}
              r={r}
              isExpanded={expandedCards.has(r.id_solicitud_alumno)}
              onToggle={toggleCard}
              companyOffers={companyOffers}
              onGetDoc={getDoc}
              onGetEvaluation={(id) => navigate(`/evaluate/${ofuscarId(id)}`)}
              onReserve={reserveStudent}
              onCancel={cancelReservation}
              onAdminReserve={adminReserve}
              onAdminCancel={adminCancel}
              onAdminReassign={adminReassign}
              onValidarAlumno={validateAlumno}
              onRechazarSolicitud={rejectSolicitud}
              user={user}
            />
          ))}
        </div>

        <DocViewer
          showDoc={showDoc}
          onClose={closeDocViewer}
          onValidate={validateDoc}
          onReject={(motivo) => rejectDoc(motivo)}
        />
      </div>
    </div>
  );
};

export default LinkStudents;
