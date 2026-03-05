// Modal para visualizar documentos PDF. Permite también validar anexos.
const DocViewer = ({ showDoc, onClose, onValidate }) => {
  if (!showDoc) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{showDoc.nombreAlumno} — {showDoc.nombre}</h2>
          <div className="modal-actions">
            {(showDoc.tipo==='anexo2'||showDoc.tipo==='anexo3') && (
              <button onClick={onValidate} className="btn btn-primary btn-sm">Validar</button>
            )}
            <button onClick={() => window.open(showDoc.url,'_blank')} className="btn btn-secondary btn-sm">
              Nueva pestaña
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body">
          <iframe src={showDoc.url} title={`Documento de ${showDoc.nombreAlumno}`}>
            <p>Tu navegador no soporta PDFs. <a href={showDoc.url} download>Descarga el documento</a>.</p>
          </iframe>
        </div>
      </div>
    </div>
  );
};
export default DocViewer;
