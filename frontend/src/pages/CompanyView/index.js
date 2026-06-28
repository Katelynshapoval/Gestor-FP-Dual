import { useEffect, useState, useCallback } from "react";
import { useUser } from "../../globales/User";
import { useNavigate } from "react-router-dom";
import { getJSON, postJSON } from "../../utils/api.js";
import MisReservas from "./MisReservas.jsx";
import "../../styles/forms.css";

// Campo de solo lectura con estilo formulario
const ReadField = ({ label, value }) => (
  <div className="field">
    <label>{label}</label>
    <p className="input bg-gray-50 cursor-default">{value || "—"}</p>
  </div>
);

// Sección de información de empresa en formato form-card
const CompanyInfoSection = ({ solicitud }) => {
  if (!solicitud) {
    return (
      <div className="form-card">
        <p className="text-center text-gray-500 py-8">
          No se encontraron datos de solicitud para la convocatoria activa.
        </p>
      </div>
    );
  }

  const esps = solicitud.especialidades || [];
  const transportes = (solicitud.transportes || []).map(t => t.nombre).filter(Boolean);

  return (
    <>
      {/* Coordinador */}
      <div className="form-card">
        <p className="form-section-title">Datos del coordinador</p>
        <p className="field-hint">
          <strong>Importante:</strong> Esta persona recibe todas las notificaciones y documentos del proyecto DUAL.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <ReadField label="Email coordinador"    value={solicitud.emailCoordinador || solicitud.coordinador_email} />
          <ReadField label="Nombre coordinador"   value={solicitud.nombreCoordinador || solicitud.coordinador_nombre} />
          <ReadField label="Teléfono coordinador" value={solicitud.telefonoCoordinador || solicitud.coordinador_telefono} />
        </div>
      </div>

      {/* Empresa */}
      <div className="form-card">
        <p className="form-section-title">Datos de la empresa</p>
        <div className="grid gap-4 md:grid-cols-2">
          <ReadField label="Razón Social"           value={solicitud.razonSocial || solicitud.empresa} />
          <ReadField label="CIF"                    value={solicitud.cif} />
          <ReadField label="Teléfono empresa"       value={solicitud.telEmpresa || solicitud.telefono} />
          <ReadField label="Dirección Razón Social" value={solicitud.dirRazSocial || solicitud.domicilio_legal} />
          <ReadField label="Municipio"              value={solicitud.municipio || solicitud.localidad_legal} />
          <ReadField label="Provincia"              value={solicitud.provincia || solicitud.provincia_legal} />
          <ReadField label="Código Postal"          value={solicitud.cpRazSoc || solicitud.cp_legal} />
        </div>
      </div>

      {/* Responsable Legal */}
      <div className="form-card">
        <p className="form-section-title">Responsable Legal</p>
        <div className="grid gap-4 md:grid-cols-3">
          <ReadField label="Nombre responsable legal" value={solicitud.responsableLegal || solicitud.representante_nombre} />
          <ReadField label="DNI responsable"          value={solicitud.dniRl || solicitud.representante_dni} />
          <ReadField label="Cargo"                    value={solicitud.cargo || solicitud.representante_cargo} />
        </div>
      </div>

      {/* Puesto */}
      <div className="form-card">
        <p className="form-section-title">Puesto de trabajo</p>
        <div className="space-y-4">
          <div className="field">
            <label>Descripción del puesto</label>
            <p className="input bg-gray-50 cursor-default min-h-[60px] whitespace-pre-wrap">
              {solicitud.descripcionPuesto || solicitud.descripcion_puesto || "—"}
            </p>
          </div>
          <ReadField label="Dirección del lugar de trabajo" value={solicitud.direccionLugarTrabajo || solicitud.domicilio_trabajo} />
        </div>
      </div>

      {/* Ciclos */}
      <div className="form-card">
        <p className="form-section-title">Ciclo(s) de Grado solicitados</p>
        {esps.length > 0 ? (
          <div className="space-y-2">
            {esps.map((e, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 border">
                <span className="text-sm font-medium">{e.nombre || `ID ${e.id_especialidad}`}</span>
                <span className="text-sm text-gray-500">
                  {e.cantidad_alumnos} alumno{e.cantidad_alumnos !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Sin datos</p>
        )}
      </div>

      {/* Transportes */}
      <div className="form-card">
        <p className="form-section-title">Métodos de Transporte posibles</p>
        <p className="field-hint">Medios de transporte con los que el alumno puede acceder al puesto.</p>
        {transportes.length > 0 ? (
          <div className="checkbox-grid">
            {transportes.map((name, i) => (
              <div key={i} className="checkbox-item checked">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked readOnly className="accent-brand-500" />
                  <span className="item-label">{name}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Sin datos</p>
        )}
      </div>
    </>
  );
};

const CompanyView = () => {
  const { user } = useUser();
  const navigate = useNavigate();

  const [solicitud, setSolicitud] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSolicitud = useCallback(async () => {
    try {
      const basic = await getJSON("/solicitudes/empresa/mia");
      const idSol = basic.id_solicitud_empresa;
      const [full, docs, esps] = await Promise.all([
        getJSON(`/solicitudes/empresa/${idSol}`),
        getJSON(`/solicitudes/empresa/${idSol}/documentos`),
        getJSON(`/solicitudes/empresa/${idSol}/especialidades`),
      ]);
      setSolicitud({ ...basic, ...full, documentos: docs, especialidades: esps });
    } catch {
      setSolicitud(null);
    }
  }, []);

  const fetchReservations = useCallback(async () => {
    try {
      const data = await getJSON("/reservas/empresa");
      setReservations(Array.isArray(data) ? data : []);
    } catch {
      setReservations([]);
    }
  }, []);

  const handleCancelReservation = async (idReserva, motivo) => {
    try {
      await postJSON(`/reservas/${idReserva}/cancelar`, { motivo });
      fetchReservations();
    } catch (err) {
      alert(err.message || "Error al cancelar la reserva.");
    }
  };

  useEffect(() => {
    if (!user || user.rol !== "EMPRESA") {
      navigate("/login");
      return;
    }
    Promise.all([fetchSolicitud(), fetchReservations()]).finally(() => setLoading(false));
  }, [user, navigate, fetchSolicitud, fetchReservations]);

  if (!user || user.rol !== "EMPRESA") return null;

  if (loading) {
    return (
      <div className="page-container">
        <p className="text-center text-gray-400 py-16">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Portal Empresa — Dual</h1>
      <p className="page-subtitle">
        Consulta los datos de tu solicitud y gestiona tus alumnos reservados.
      </p>

      <CompanyInfoSection solicitud={solicitud} />

      {/* Reservas */}
      <div className="form-card">
        <p className="form-section-title">
          Mis reservas
          {reservations.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({reservations.length})
            </span>
          )}
        </p>
        <MisReservas
          reservations={reservations}
          onUpload={fetchReservations}
          onCancel={handleCancelReservation}
        />
      </div>
    </div>
  );
};

export default CompanyView;
