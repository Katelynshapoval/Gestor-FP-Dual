import { sectionLabelClass } from "../../../../components/ui/cardStyles";
import DocumentoItem from "../../../../components/DocumentoItem.jsx";

// Application documents (CV, Anexo DGA). Viewing, validating and rejecting
// happen in the shared DocumentoItem / PdfViewer.
const Documentos = ({ r, user, onRefresh }) => {
  const items = Array.isArray(r.documentos) ? r.documentos : [];
  const isEmpresa = user?.rol === "EMPRESA";

  return (
    <div>
      <p className={sectionLabelClass}>Documentos</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted">Sin documentos de solicitud.</p>
      ) : (
        <div className="divide-y divide-surface-200 overflow-hidden rounded-lg border border-surface-200 bg-white">
          {items.map((doc) => (
            <DocumentoItem
              key={doc.clave}
              doc={{ ...doc, alumno: doc.alumno || r.nombre }}
              showStatus={!(isEmpresa && doc.clave === "CV")}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Documentos;
