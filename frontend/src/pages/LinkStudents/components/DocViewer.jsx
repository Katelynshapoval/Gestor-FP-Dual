// Modal para visualizar documentos PDF y validar anexos
const DocViewer = ({ showDoc, onClose, onValidate }) => {
  if (!showDoc) return null;

  const canValidate = showDoc.tipo === "anexo2" || showDoc.tipo === "anexo3";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="flex h-[88vh] w-full max-w-[92%] flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_80px_rgb(0_0_0/0.25)] animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-surface-200 px-5 py-3.5">
          <h2 className="m-0 font-display text-[0.95rem] font-semibold text-gray-900">
            {showDoc.nombreAlumno} — {showDoc.nombre}
          </h2>

          <div className="flex items-center gap-2">
            {canValidate && (
              <button onClick={onValidate} className="btn btn-primary btn-sm">
                Validar
              </button>
            )}
            <button
              onClick={() => window.open(showDoc.url, "_blank")}
              className="btn btn-secondary btn-sm"
            >
              Nueva pestaña
            </button>
            <button
              className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full border border-surface-200 bg-white text-[0.85rem] text-gray-500 transition-all duration-200 hover:border-brand-500 hover:text-brand-500"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <iframe
            src={showDoc.url}
            title={`Documento de ${showDoc.nombreAlumno}`}
            className="block h-full w-full border-0"
          >
            <p>
              Tu navegador no soporta PDFs.{" "}
              <a href={showDoc.url} download>
                Descarga el documento
              </a>
              .
            </p>
          </iframe>
        </div>
      </div>
    </div>
  );
};

export default DocViewer;
