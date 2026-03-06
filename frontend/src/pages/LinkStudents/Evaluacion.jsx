import React from "react";

const Evaluacion = ({ r, user, onGetEvaluation }) => {
  const isEmpresa = user?.user_type === "empresa";

  return (
    <div className="border-t pt-4">
      <p className="section-label">Evaluación</p>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xl sm:text-[1.3rem] font-bold text-[var(--brand)]">
          {r.notaTotal ? r.notaTotal.toFixed(2) : "—"}
        </p>

        {!isEmpresa && (
          <button
            onClick={() => onGetEvaluation(r.idGestion)}
            className="btn btn-outline-brand btn-sm w-full sm:w-auto"
          >
            {r.idEvaluacion !== null ? "Ver evaluación" : "Evaluar"}
          </button>
        )}
      </div>
    </div>
  );
};

export default Evaluacion;
