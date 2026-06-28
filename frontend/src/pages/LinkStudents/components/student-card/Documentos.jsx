import { sectionLabelClass } from "../../../../components/ui/cardStyles";

// Sección de documentos del alumno en la tarjeta de vinculación.
// Los documentos se identifican por su ID en dual_documentos.
const Documentos = ({ r, user, onGetDoc }) => {
  const isEmpresa = user?.rol === "EMPRESA";

  const hasCv = !!r.cv_id;
  const hasAnexo = !!r.anexo2_id;

  return (
    <div className={!isEmpresa ? "border-t pt-4" : ""}>
      <p className={sectionLabelClass}>Documentos</p>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {hasCv ? (
          <button
            onClick={() => onGetDoc(r.cv_id, "cv", r.nombre)}
            className="btn btn-secondary btn-sm flex w-full items-center justify-center gap-1 sm:w-auto"
          >
            CV
          </button>
        ) : (
          <span className="btn btn-secondary btn-sm flex w-full items-center justify-center gap-1 sm:w-auto opacity-40 cursor-default">
            CV
          </span>
        )}

        {!isEmpresa && (
          <>
            {hasAnexo ? (
              <button
                onClick={() => onGetDoc(r.anexo2_id, "anexo2", r.nombre)}
                className="btn btn-secondary btn-sm flex w-full items-center justify-center gap-1 sm:w-auto"
              >
                Anexo 2
              </button>
            ) : (
              <span className="btn btn-secondary btn-sm flex w-full items-center justify-center gap-1 sm:w-auto opacity-40 cursor-default">
                Anexo 2
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Documentos;
