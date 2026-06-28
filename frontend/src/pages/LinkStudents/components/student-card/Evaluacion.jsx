import { sectionLabelClass } from "../../../../components/ui/cardStyles";

// Sección de evaluación en la tarjeta del alumno.
// Usa id_solicitud_alumno como identificador principal.
const Evaluacion = ({ r, user, onGetEvaluation }) => {
  const isEmpresa = user?.rol === "EMPRESA";

  return (
    <div className="border-t pt-4">
      <p className={sectionLabelClass}>Evaluación</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xl font-bold text-brand sm:text-[1.3rem]">
          {r.nota_total != null ? Number(r.nota_total).toFixed(2) : "—"}
        </p>

        {!isEmpresa && (
          <button
            onClick={() => onGetEvaluation(r.id_solicitud_alumno)}
            className="btn btn-outline-brand btn-sm w-full sm:w-auto"
          >
            {r.id_evaluacion != null ? "Ver evaluación" : "Evaluar"}
          </button>
        )}
      </div>
    </div>
  );
};

export default Evaluacion;
