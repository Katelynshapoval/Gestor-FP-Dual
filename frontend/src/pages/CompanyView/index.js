import { useEffect, useState, useCallback } from "react";
import { useUser } from '../../context/UserContext';
import { useNavigate } from "react-router-dom";
import { getJSON, postJSON } from "../../utils/api.js";
import MisReservas from "./MisReservas.jsx";
import SpecialitySelector from "../AddCompanyRequest/SpecialitySelector.jsx";
import TransportSelector from "../AddCompanyRequest/TransportSelector.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import "../../styles/forms.css";

// Read-only field styled to match the rest of the form layout
const ReadField = ({ label, value }) => (
  <div className="field">
    <label>{label}</label>
    <p className="input bg-gray-50 cursor-default">{value || "—"}</p>
  </div>
);

// Company data panel with optional re-apply form
const MisDatos = ({ solicitud, specialities, transports, onReapplySuccess }) => {
  const [showReapply, setShowReapply] = useState(false);
  const [reapplyDone, setReapplyDone] = useState(false);

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
  const transporteNombres = (solicitud.transportes || []).map(t => t.nombre).filter(Boolean);

  return (
    <>
      {/* Coordinator section */}
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

      {/* Company info section */}
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

      {/* Legal representative */}
      <div className="form-card">
        <p className="form-section-title">Responsable Legal</p>
        <div className="grid gap-4 md:grid-cols-3">
          <ReadField label="Nombre responsable legal" value={solicitud.responsableLegal || solicitud.representante_nombre} />
          <ReadField label="DNI responsable"          value={solicitud.dniRl || solicitud.representante_dni} />
          <ReadField label="Cargo"                    value={solicitud.cargo || solicitud.representante_cargo} />
        </div>
      </div>

      {/* Job position details */}
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

      {/* Requested specialities and student counts */}
      <div className="form-card">
        <p className="form-section-title">Ciclo(s) de Grado solicitados</p>
        {esps.length > 0 ? (
          <div className="space-y-2">
            {esps.map((e, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 border">
                <span className="text-sm font-medium">{e.nombre || `ID ${e.id_especialidad}`}</span>
                <span className="text-sm text-gray-500">{e.cantidad_alumnos} alumno{e.cantidad_alumnos !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Sin datos</p>
        )}
      </div>

      {/* Transport options */}
      <div className="form-card">
        <p className="form-section-title">Métodos de Transporte posibles</p>
        <p className="field-hint">Medios de transporte con los que el alumno puede acceder al puesto.</p>
        {transporteNombres.length > 0 ? (
          <div className="checkbox-grid">
            {transporteNombres.map((name, i) => (
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

      {/* Re-apply section for the next convocatoria */}
      <div className="form-card">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowReapply(v => !v)}
        >
          <p className="form-section-title mb-0">Participar en la nueva convocatoria</p>
          <span className={`text-gray-400 text-lg transition-transform ${showReapply ? "rotate-180" : ""}`}>▾</span>
        </div>

        {showReapply && (
          <div className="mt-5">
            {reapplyDone ? (
              <p className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                Tu reaplicación ha sido enviada. Recibirás un correo con el nuevo convenio en breve.
              </p>
            ) : (
              <ReapplyForm
                solicitud={solicitud}
                specialities={specialities}
                transports={transports}
                onSuccess={() => { setReapplyDone(true); if (onReapplySuccess) onReapplySuccess(); }}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
};

// Re-apply form — lets the empresa re-submit with updated coordinator data and speciality picks
const ReapplyForm = ({ solicitud, specialities, transports, onSuccess }) => {
  const initEsps = () => {
    const ids = (solicitud?.especialidades || []).map(e => e.id_especialidad);
    const amts = (solicitud?.especialidades || []).map(e => e.cantidad_alumnos);
    return [ids, amts];
  };
  const initTransports = () => (solicitud?.transportes || []).map(t => t.id_transporte);

  const [nombreCoordinador, setNombreCoordinador]   = useState(solicitud?.nombreCoordinador || solicitud?.coordinador_nombre || "");
  const [emailCoordinador, setEmailCoordinador]     = useState(solicitud?.emailCoordinador  || solicitud?.coordinador_email  || "");
  const [telefonoCoordinador, setTelefonoCoordinador] = useState(solicitud?.telefonoCoordinador || solicitud?.coordinador_telefono || "");
  const [descripcionPuesto, setDescripcionPuesto]   = useState(solicitud?.descripcion_puesto || solicitud?.descripcionPuesto || "");
  const [selectedEsps, setSelectedEsps]             = useState(initEsps);
  const [selectedTransps, setSelectedTransps]       = useState(initTransports);
  const [submitting, setSubmitting]                 = useState(false);
  const [msg, setMsg]                               = useState(null);

  const handleEspToggle = (id) =>
    setSelectedEsps(([ids, amts]) => {
      const idx = ids.indexOf(id);
      if (idx === -1) return [[...ids, id], [...amts, 1]];
      return [ids.filter((_, i) => i !== idx), amts.filter((_, i) => i !== idx)];
    });

  const handleAmountChange = (id, val) =>
    setSelectedEsps(([ids, amts]) => {
      const idx = ids.indexOf(id);
      if (idx === -1) return [ids, amts];
      const next = [...amts]; next[idx] = val;
      return [ids, next];
    });

  const handleTranspToggle = (id) => {
    const n = Number(id);
    setSelectedTransps(prev => prev.includes(n) ? prev.filter(t => t !== n) : [...prev, n]);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (selectedEsps[0].length === 0) { setMsg({ ok: false, text: "Selecciona al menos un ciclo." }); return; }
    if (selectedEsps[1].some(a => a <= 0)) { setMsg({ ok: false, text: "Indica al menos un alumno por ciclo." }); return; }
    setSubmitting(true); setMsg(null);
    try {
      await postJSON("/solicitudes/empresa/reapply", {
        nombreCoordinador, emailCoordinador, telefonoCoordinador,
        descripcion_puesto: descripcionPuesto,
        especialidades: selectedEsps[0].map((id, i) => ({ idEspecialidad: id, cantidadAlumnos: selectedEsps[1][i] })),
        transportes: selectedTransps,
      });
      if (onSuccess) onSuccess();
    } catch (err) {
      const dup = err.message?.includes("ya existe") || err.message?.includes("409");
      setMsg({ ok: false, text: dup ? "Ya existe una solicitud para la convocatoria activa." : (err.message || "Error al enviar.") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">Puedes modificar los datos del coordinador y las especialidades. Los datos de empresa se mantienen.</p>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="field"><label>Nombre coordinador</label><input className="input" value={nombreCoordinador} onChange={e => setNombreCoordinador(e.target.value)} /></div>
        <div className="field"><label>Email coordinador</label><input className="input" type="email" value={emailCoordinador} onChange={e => setEmailCoordinador(e.target.value)} /></div>
        <div className="field"><label>Teléfono coordinador</label><input className="input" value={telefonoCoordinador} onChange={e => setTelefonoCoordinador(e.target.value)} /></div>
      </div>

      <div className="field">
        <label>Descripción del puesto</label>
        <textarea className="textarea" value={descripcionPuesto} onChange={e => setDescripcionPuesto(e.target.value)} maxLength={500} />
      </div>

      <SpecialitySelector
        dataSpecialities={specialities}
        specialities={selectedEsps}
        onToggle={handleEspToggle}
        onAmountChange={handleAmountChange}
      />
      <TransportSelector
        dataTransports={transports}
        metodosTransporte={selectedTransps}
        onToggle={handleTranspToggle}
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className={`btn btn-primary ${submitting ? "btn-disabled" : ""}`}
      >
        {submitting ? "Enviando…" : "Enviar reaplicación"}
      </button>

      {msg && (
        <p className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
};

// Main empresa portal with two tabs: Mis datos / Mis reservas
const CompanyView = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const [view, setView] = useState("datos");

  const [solicitud, setSolicitud]     = useState(null);
  const [reservations, setReservations] = useState([]);
  const [specialities, setSpecialities] = useState([]);
  const [transports, setTransports]   = useState([]);
  const [loading, setLoading]         = useState(true);

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
    } catch { setSolicitud(null); }
  }, []);

  const fetchReservations = useCallback(async () => {
    try {
      const data = await getJSON("/reservas/empresa");
      setReservations(Array.isArray(data) ? data : []);
    } catch { setReservations([]); }
  }, []);

  const handleCancelReservation = async (idReserva, motivo) => {
    try {
      await postJSON(`/reservas/${idReserva}/cancelar`, { motivo });
      fetchReservations();
    } catch (err) { alert(err.message || "Error al cancelar la reserva."); }
  };

  useEffect(() => {
    if (!user || user.rol !== "EMPRESA") { navigate("/login"); return; }
    Promise.all([
      getJSON("/especialidades"),
      getJSON("/transportes"),
    ]).then(([s, t]) => { setSpecialities(s); setTransports(t); }).catch(console.error);
    Promise.all([fetchSolicitud(), fetchReservations()]).finally(() => setLoading(false));
  }, [user, navigate, fetchSolicitud, fetchReservations]);

  if (!user || user.rol !== "EMPRESA") return null;

  const tabCls = (active) =>
    `px-5 py-2.5 text-sm font-semibold transition border-b-2 ${
      active ? "border-brand-500 text-brand-500" : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="page-container">
      <PageHeader
        kicker="Empresa"
        title="Portal Empresa — Dual"
        subtitle={`${user.nombre} · ${user.email}`}
      />

      <div className="mb-6 flex border-b border-surface-200">
        <button className={tabCls(view === "datos")} onClick={() => setView("datos")}>Mis datos</button>
        <button className={tabCls(view === "reservas")} onClick={() => setView("reservas")}>
          Mis reservas
          {reservations.length > 0 && (
            <span className="ml-1.5 inline-block text-[0.7rem] bg-brand-500 text-white rounded-full px-1.5 py-0.5 leading-none">
              {reservations.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-16">Cargando…</p>
      ) : view === "datos" ? (
        <MisDatos
          solicitud={solicitud}
          specialities={specialities}
          transports={transports}
          onReapplySuccess={fetchSolicitud}
        />
      ) : (
        <div className="form-card">
          <p className="form-section-title">Mis reservas</p>
          <MisReservas
            reservations={reservations}
            onUpload={fetchReservations}
            onCancel={handleCancelReservation}
          />
        </div>
      )}
    </div>
  );
};

export default CompanyView;


