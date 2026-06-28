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
    reserveStudent,
    cancelReservation,
  } = useLinkStudents();

  return (
    <div className="flex-1 bg-surface-100">
      <div className="page-container space-y-6">
        <PageHeader
          kicker="Asignaciones"
          title="Peticiones de alumnos"
          subtitle={`${filtered.length} alumno${filtered.length !== 1 ? "s" : ""} disponibles según los filtros actuales.`}
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
              Anexo 2 o 3. Hasta entonces, el alumno puede ser asignado a otra empresa.
            </p>
          )}

          {filtered.length === 0 && (
            <div className="rounded-xl2 border border-surface-200 bg-white p-12 text-center text-muted shadow-card">
              No hay alumnos que coincidan con el filtro.
            </div>
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
              user={user}
            />
          ))}
        </div>

        <DocViewer
          showDoc={showDoc}
          onClose={closeDocViewer}
          onValidate={validateDoc}
        />
      </div>
    </div>
  );
};

export default LinkStudents;
