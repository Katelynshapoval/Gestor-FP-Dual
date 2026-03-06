import React from "react";

const Documentos = ({ r, user, onGetDoc, onGetAnexo }) => {
  const isEmpresa = user?.user_type === "empresa";

  return (
    <div className="border-t pt-4">
      <p className="section-label">Documentos</p>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        <button
          onClick={() => onGetDoc(r.idGestion, "cv")}
          className="btn btn-secondary btn-sm flex items-center justify-center gap-1 w-full sm:w-auto"
        >
          CV
        </button>

        {!isEmpresa && (
          <>
            <button
              onClick={() => onGetAnexo(r)}
              className="btn btn-secondary btn-sm flex items-center justify-center gap-1 w-full sm:w-auto"
            >
              Anexo 2/3
            </button>

            <button
              onClick={() => onGetDoc(r.idGestion, "calendario")}
              className="btn btn-secondary btn-sm flex items-center justify-center gap-1 w-full sm:w-auto"
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
