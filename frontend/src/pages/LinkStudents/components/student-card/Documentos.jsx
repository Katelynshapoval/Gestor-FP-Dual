import { sectionLabelClass } from "../../../../components/ui/cardStyles";

const Documentos = ({ r, user, onGetDoc, onGetAnexo }) => {
  const isEmpresa = user?.user_type === "empresa";

  return (
    <div className={!isEmpresa ? "border-t pt-4" : ""}>
      <p className={sectionLabelClass}>Documentos</p>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          onClick={() => onGetDoc(r.idGestion, "cv")}
          className="btn btn-secondary btn-sm flex w-full items-center justify-center gap-1 sm:w-auto"
        >
          CV
        </button>

        {!isEmpresa && (
          <>
            <button
              onClick={() => onGetAnexo(r)}
              className="btn btn-secondary btn-sm flex w-full items-center justify-center gap-1 sm:w-auto"
            >
              Anexo 2/3
            </button>

            <button
              onClick={() => onGetDoc(r.idGestion, "calendario")}
              className="btn btn-secondary btn-sm flex w-full items-center justify-center gap-1 sm:w-auto"
            >
              Calendario
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Documentos;
