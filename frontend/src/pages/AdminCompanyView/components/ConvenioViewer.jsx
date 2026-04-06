// ──────────────────────────────────────────────────────────
// MODAL VISOR DE CONVENIO
// ──────────────────────────────────────────────────────────
const ConvenioViewer = ({ empresa, onClose, onValidate }) => {
  if (!empresa) return null;
  const url = `http://localhost:3001/getConvenioFile/${empresa.idAuxEmpresa}`;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Convenio — {empresa.razonSocial}</h2>
          <div className="modal-actions">
            {!empresa.convenio_validado && (
              <button
                onClick={() => onValidate(empresa.idAuxEmpresa)}
                className="btn btn-primary btn-sm"
              >
                ✓ Validar convenio
              </button>
            )}
            <button
              onClick={() => window.open(url, "_blank")}
              className="btn btn-secondary btn-sm"
            >
              Nueva pestaña
            </button>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>
        <div className="modal-body">
          <iframe src={url} title={`Convenio de ${empresa.razonSocial}`}>
            <p>
              Tu navegador no soporta PDFs.
              <a href={url} download>
                Descarga el convenio
              </a>
              .
            </p>
          </iframe>
        </div>
      </div>
    </div>
  );
};

export default ConvenioViewer;
