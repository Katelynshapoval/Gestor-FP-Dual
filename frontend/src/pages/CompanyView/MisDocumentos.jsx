import { useEffect, useState } from "react";
import DocumentoItem from "../../components/DocumentoItem.jsx";

const MisDocumentos = ({ documentos, onRefresh }) => {
  const [items, setItems] = useState(documentos?.items || []);

  useEffect(() => {
    setItems(documentos?.items || []);
  }, [documentos]);

  return (
    <div className="form-card">
      <p className="form-section-title">Mis documentos</p>
      <p className="mb-4 text-sm text-gray-500">
        Convenio, anexos y calendario de tu empresa. El anexo II o III aparece
        cuando el centro indica el tipo de contrato de la reserva.
      </p>
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          Todavía no hay documentos asociados a tu empresa.
        </p>
      ) : (
        <div className="divide-y divide-surface-200 overflow-hidden rounded-xl2 border border-surface-200 bg-white">
          {items.map((doc) => (
            <DocumentoItem
              key={`${doc.clave}-${doc.id_solicitud_empresa || 0}-${doc.id_reserva || 0}-${doc.id_documento || 0}`}
              doc={doc}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MisDocumentos;
