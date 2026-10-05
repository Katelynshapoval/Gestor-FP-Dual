import { sectionLabelClass } from "../../../../components/ui/cardStyles";
import DocumentoItem from "../../../../components/DocumentoItem.jsx";

const Documentos = ({ r, onGetDoc }) => {
  const items = Array.isArray(r.documentos) ? r.documentos : [];

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
              doc={doc}
              onOpen={(item) =>
                onGetDoc(item.id_documento, item.clave, r.nombre, {
                  idSolicitudAlumno: r.id_solicitud_alumno,
                  estado: item.estado_validacion,
                  motivo: item.motivo,
                  canReview: item.puede_revisar,
                  nombre: item.nombre,
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Documentos;
