import React from "react";

const Documentos = ({ r, user, onGetDoc, onGetAnexo }) => {
  const isEmpresa = user?.user_type === "empresa";

  return (
    <div className="border-t pt-4">
      <p className="section-label">Documentos</p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onGetDoc(r.idGestion, "cv")}
          className="btn btn-secondary btn-sm flex items-center gap-1"
        >
          CV
        </button>

        {!isEmpresa && (
          <>
            <button
              onClick={() => onGetAnexo(r)}
              className="btn btn-secondary btn-sm flex items-center gap-1"
            >
              Anexo 2/3
            </button>

            <button
              onClick={() => onGetDoc(r.idGestion, "calendario")}
              className="btn btn-secondary btn-sm flex items-center gap-1"
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
