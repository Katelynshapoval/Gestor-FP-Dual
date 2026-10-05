import { getJSON } from "../../utils/api.js";
import DocumentoItem from "../../components/DocumentoItem.jsx";

export default function MisDocumentos({ documentos = [], onChange }) {
  return (
    <div className="form-card">
      <p className="form-section-title">Mis documentos</p>
      <p className="mb-4 text-sm text-gray-500">
        Documentos de tu proceso. Si uno está rechazado, puedes sustituir el PDF.
      </p>
      {documentos.length === 0 ? (
        <p className="text-sm text-muted">No hay documentos para mostrar.</p>
      ) : (
        <div className="divide-y divide-surface-200 overflow-hidden rounded-xl2 border border-surface-200 bg-white">
          {documentos.map((doc) => (
            <DocumentoItem
              key={`${doc.clave}-${doc.id_reserva || 0}-${doc.id_solicitud_empresa || 0}-${doc.id_solicitud_alumno || 0}`}
              doc={doc}
              onRefresh={async () => {
                const data = await getJSON("/documentos/alumno/mios");
                onChange(Array.isArray(data?.items) ? data.items : []);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
