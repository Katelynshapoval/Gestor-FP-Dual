import { useEffect, useState } from 'react';
import { getBlob, getJSON, postForm } from '../../utils/api';
import { IoIosCheckmarkCircleOutline } from 'react-icons/io';
import { MdOutlineCancel, MdOutlineFileDownload, MdOutlineFileUpload, MdPendingActions } from 'react-icons/md';
import { signedBadgeClass, sectionLabelClass } from '../../components/ui/cardStyles';
import { InfoRow, formatDate } from '../AdminCompanyView/helpers';
import '../../styles/forms.css';

const ESTADO_CONFIG = {
  PENDIENTE: { cls: 'bg-yellow-50 text-yellow-700 border-yellow-200', Icon: MdPendingActions },
  VALIDADO: { cls: 'bg-green-50 text-green-700 border-green-200', Icon: IoIosCheckmarkCircleOutline },
  RECHAZADO: { cls: 'bg-red-50 text-red-700 border-red-200', Icon: MdOutlineCancel },
};

export default function MiSolicitud() {
  const [solicitud, setSolicitud] = useState(null);
  const [cupos, setCupos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sol, cups] = await Promise.all([
        getJSON('/solicitudes/empresa/mia').catch((requestError) => {
          if (requestError.status === 404) return null;
          throw requestError;
        }),
        getJSON('/cupos/empresa').catch(() => []),
      ]);

      setSolicitud(sol);
      setCupos(cups);

      if (sol?.id_solicitud_empresa) {
        const docs = await getJSON(`/solicitudes/empresa/${sol.id_solicitud_empresa}/documentos`).catch(() => []);
        setDocumentos(docs);
      } else {
        setDocumentos([]);
      }
    } catch (requestError) {
      setError(requestError.message || 'No se ha podido cargar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const subirConvenio = async () => {
    if (!file) {
      setMessage({ type: 'error', text: 'Selecciona el convenio firmado en formato PDF.' });
      return;
    }

    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('archivo', file);
      await postForm(`/documentos/empresa/${solicitud.id_solicitud_empresa}/convenio`, formData);
      setFile(null);
      setMessage({ type: 'success', text: 'Convenio subido correctamente.' });
      await cargar();
    } catch (requestError) {
      setMessage({ type: 'error', text: requestError.message || 'No se ha podido subir el convenio.' });
    } finally {
      setUploading(false);
    }
  };

  const descargarConvenio = async (idDocumento) => {
    setDownloading(true);
    setMessage(null);
    try {
      const blob = await getBlob(`/documentos/${idDocumento}/descargar`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'convenio.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setMessage({ type: 'error', text: requestError.message || 'No se ha podido descargar el convenio.' });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <p className="text-gray-400 text-sm py-8 text-center">Cargando solicitud…</p>;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;

  if (!solicitud) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-sm text-yellow-800">
        No tienes solicitud activa para la convocatoria en curso. Si crees que esto es un error,
        contacta con el equipo Dual.
      </div>
    );
  }

  const badge = ESTADO_CONFIG[solicitud.estado_validacion];
  const convenio = documentos.find((documento) => documento.tipo_documento === 'CONVENIO');
  const convenioBadge = convenio ? ESTADO_CONFIG[convenio.estado_validacion] : null;

  return (
    <div className="space-y-6">
      <div className="form-card !mb-0">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{solicitud.empresa}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{solicitud.cif}</p>
          </div>
          {badge && (
            <span className={`${signedBadgeClass} border shrink-0 ${badge.cls}`}>
              <badge.Icon className="text-[15px]" />
              {solicitud.estado_validacion}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <InfoRow label="Convocatoria" value={solicitud.convocatoria} />
          <InfoRow label="Fecha de solicitud" value={formatDate(solicitud.fecha_solicitud)} />
        </div>

        {solicitud.descripcion_puesto && (
          <div className="mt-4">
            <p className={sectionLabelClass}>Descripción del puesto</p>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {solicitud.descripcion_puesto}
            </p>
          </div>
        )}

        {solicitud.motivo && (
          <div className="mt-4 p-3 rounded-lg border border-red-200 bg-red-50">
            <p className="text-sm font-semibold text-red-700 mb-1">Motivo del rechazo:</p>
            <p className="text-sm text-red-600">{solicitud.motivo}</p>
          </div>
        )}
      </div>

      <div className="form-card !mb-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
          <div>
            <div className="form-section-title !mb-2">Convenio firmado</div>
            <p className="text-sm text-gray-500">
              Adjunta el convenio firmado en PDF. Puedes sustituirlo mientras siga pendiente de validación.
            </p>
          </div>
          {convenio && convenioBadge && (
            <span className={`${signedBadgeClass} border shrink-0 ${convenioBadge.cls}`}>
              <convenioBadge.Icon className="text-[15px]" />
              {convenio.estado_validacion}
            </span>
          )}
        </div>

        {message && (
          <div className={`form-message ${message.type === 'error' ? 'form-message-error' : ''}`}>
            {message.text}
          </div>
        )}

        <label className="file-upload mt-4">
          <MdOutlineFileUpload className="file-upload-icon" />
          <span className="file-upload-text">{file ? file.name : 'Seleccionar convenio PDF...'}</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </label>

        <div className="flex flex-wrap gap-3 mt-5">
          <button
            type="button"
            className="btn btn-primary"
            onClick={subirConvenio}
            disabled={uploading}
          >
            <MdOutlineFileUpload />
            {uploading ? 'Subiendo…' : convenio ? 'Sustituir convenio' : 'Subir convenio'}
          </button>

          {convenio && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => descargarConvenio(convenio.id_documento)}
              disabled={downloading}
            >
              <MdOutlineFileDownload />
              {downloading ? 'Descargando…' : 'Descargar convenio'}
            </button>
          )}
        </div>
      </div>

      {cupos.length > 0 && (
        <div className="form-card !mb-0 !p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200">
            <p className={`${sectionLabelClass} !mb-0`}>Especialidades y cupos de plazas</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left">Especialidad</th>
                  <th className="px-5 py-3 text-left">Turno</th>
                  <th className="px-5 py-3 text-center">Plazas</th>
                  <th className="px-5 py-3 text-center">Ocupadas</th>
                  <th className="px-5 py-3 text-center">Disponibles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {cupos.map((cupo) => (
                  <tr key={cupo.id_solicitud_empresa_especialidad} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium">
                      {cupo.especialidad || cupo.codigo_especialidad}
                      {cupo.especialidad && (
                        <span className="ml-2 text-xs text-gray-400">{cupo.codigo_especialidad}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">{cupo.turno}</td>
                    <td className="px-5 py-3 text-center">{cupo.plazas_ofertadas}</td>
                    <td className="px-5 py-3 text-center">{cupo.plazas_ocupadas}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`font-bold ${
                        cupo.plazas_disponibles > 0 ? 'text-green-700' : 'text-red-500'
                      }`}>
                        {cupo.plazas_disponibles}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
