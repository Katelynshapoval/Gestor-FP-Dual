import { ofuscarId } from "../../utils/idObfuscation.js";

import DocViewer from "./components/DocViewer";
import RequestFilters from "./components/RequestFilters";
import StudentCard from "./components/StudentCard";
import { useLinkStudents } from "./hooks/useLinkStudents";

// Página principal de vinculación de alumnos con empresas
const LinkStudents = () => {
  const {
    user,
    navigate,
    companyRequests,
    showDoc,
    expandedCards,
    sendingInfo,
    selectedSpeciality,
    setSelectedSpeciality,
    selectedYear,
    setSelectedYear,
    filtered,
    specialities,
    canSendInfo,
    isEmpresa,
    yearOptionCount,
    toggleCard,
    assign,
    sendInfo,
    handleCompanyChange,
    getDoc,
    getAnexo,
    closeDocViewer,
    validateDoc,
  } = useLinkStudents();

  return (
    <div className="mx-auto w-full max-w-[1100px] flex-1 space-y-6 px-10 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="border-l-4 border-red-600 pl-4 sm:pl-5">
          <h1 className="text-xl font-semibold sm:text-2xl">
            Peticiones de alumnos
          </h1>
          <p className="text-sm text-gray-500">
            {filtered.length} alumno{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>

        <RequestFilters
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          selectedSpeciality={selectedSpeciality}
          onSpecialityChange={setSelectedSpeciality}
          specialities={specialities}
          yearOptionCount={yearOptionCount}
        />
      </div>

      <div className="space-y-4">
        {isEmpresa && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600">
            La asignación de un alumno no es definitiva hasta la firma del
            Anexo 2 o 3. Hasta entonces, el alumno puede ser asignado a otra
            empresa.
          </p>
        )}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-12 text-center text-gray-500">
            No hay alumnos que coincidan con el filtro.
          </div>
        )}

        {filtered.map((r) => (
          <StudentCard
            key={`${r.idGestion}-${r.dni}`}
            r={r}
            isExpanded={expandedCards.has(r.idGestion)}
            onToggle={toggleCard}
            companyRequests={companyRequests}
            sendingInfo={sendingInfo}
            canSendInfo={canSendInfo}
            onAssign={assign}
            onSendInfo={sendInfo}
            onCompanyChange={handleCompanyChange}
            onGetDoc={getDoc}
            onGetAnexo={getAnexo}
            onGetEvaluation={(id) => navigate(`/evaluate/${ofuscarId(id)}`)}
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
  );
};

export default LinkStudents;
