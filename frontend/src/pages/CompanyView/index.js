import { useEffect, useState, useCallback } from "react";
import { useUser } from '../../context/UserContext';
import { useNavigate } from "react-router-dom";
import { getJSON, postJSON } from "../../utils/api.js";
import MisReservas from "./MisReservas.jsx";
import MisDocumentos from "./MisDocumentos.jsx";
import SpecialitySelector from "../AddCompanyRequest/SpecialitySelector.jsx";
import TransportSelector from "../AddCompanyRequest/TransportSelector.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import CompanyEditForm, { applyProposed, datosToForm } from "./CompanyEditForm.jsx";
import CambioDiff from "./CambioDiff.jsx";
import EspecialidadCuposEditor from "./EspecialidadCuposEditor.jsx";
import "../../styles/forms.css";

// Read-only field styled to match the rest of the form layout
const ReadField = ({ label, value }) => (
  <div className="field">
    <label>{label}</label>
    <p className="input bg-gray-50 cursor-default">{value || "—"}</p>
  </div>
);

// Company data panel with optional re-apply form
const MisDatos = ({ solicitud, specialities, transports, cambio, onReapplySuccess, onCambioChange, onCupoChange }) => {
  const [showReapply, setShowReapply] = useState(false);
  const [reapplyDone, setReapplyDone] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => datosToForm(solicitud));
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

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
  const pending = cambio?.pending;
  const rejected = !pending && cambio?.ultimo?.estado === "RECHAZADO" ? cambio.ultimo : null;

  const startEdit = () => {
    setForm(pending ? applyProposed(solicitud, pending.proposed) : datosToForm(solicitud));
    setMsg(null);
    setEditing(true);
  };

  const handleSubmitCambio = async (body) => {
    if (submitting) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const data = await postJSON(`/solicitudes/empresa/${solicitud.id_solicitud_empresa}/cambios`, body);
      setEditing(false);
      setMsg({ ok: true, text: data.message || "Cambios enviados para revisión" });
      if (onCambioChange) await onCambioChange();
    } catch (err) {
      setMsg({ ok: false, text: err.message || "Error al enviar los cambios." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="form-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="form-section-title mb-1">Datos vigentes</p>
          <p className="text-sm text-gray-500">Estos son los datos aprobados actualmente. Las modificaciones se envían al centro para revisión.</p>
        </div>
        {solicitud.convocatoria_activa && !editing && (
          <button type="button" className="btn btn-primary" onClick={startEdit}>
            {pending ? "Modificar solicitud pendiente" : "Editar datos"}
          </button>
        )}
      </div>

      {msg && (
        <p className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {msg.text}
        </p>
      )}

      {pending && (
        <div className="form-card border-amber-200 bg-amber-50">
          <p className="form-section-title text-amber-900">Cambios enviados para revisión</p>
          <p className="mb-3 text-sm text-amber-800">
            La solicitud está pendiente de aprobación. Los datos vigentes no cambian hasta que el centro la revise.
          </p>
          <CambioDiff diff={pending.diff} />
        </div>
      )}

      {rejected && (
        <div className="form-card border-red-200 bg-red-50">
          <p className="form-section-title text-red-900">Solicitud de cambios rechazada</p>
          <p className="text-sm text-red-800">{rejected.motivo || "Sin motivo indicado."}</p>
        </div>
      )}

      {editing && (
        <CompanyEditForm
          key={pending?.id_cambio || "new"}
          values={form}
          onChange={setForm}
          transports={transports}
          submitting={submitting}
          submitLabel={pending ? "Actualizar solicitud de cambios" : "Enviar para revisión"}
          onSubmit={handleSubmitCambio}
          onCancel={() => setEditing(false)}
        />
      )}

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
        <EspecialidadCuposEditor
          solicitudId={solicitud.id_solicitud_empresa}
          especialidades={esps}
          onUpdated={onCupoChange}
        />
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

// Main empresa portal: Mis datos / Mis reservas / Mis documentos
const CompanyView = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const [view, setView] = useState("datos");

  const [solicitud, setSolicitud]     = useState(null);
  const [cambio, setCambio]           = useState({ pending: null, ultimo: null });
  const [reservations, setReservations] = useState([]);
  const [documentos, setDocumentos]   = useState({ solicitudes: [], reservas: [] });
  const [specialities, setSpecialities] = useState([]);
  const [transports, setTransports]   = useState([]);
  const [loading, setLoading]         = useState(true);

  const fetchSolicitud = useCallback(async () => {
    try {
      const basic = await getJSON("/solicitudes/empresa/mia");
      const idSol = basic.id_solicitud_empresa;
      const [full, docs, esps, cambios] = await Promise.all([
        getJSON(`/solicitudes/empresa/${idSol}`),
        getJSON(`/solicitudes/empresa/${idSol}/documentos`),
        getJSON(`/solicitudes/empresa/${idSol}/especialidades`),
        getJSON(`/solicitudes/empresa/${idSol}/cambios`),
      ]);
      setSolicitud({ ...basic, ...full, documentos: docs, especialidades: esps });
      setCambio(cambios || { pending: null, ultimo: null });
    } catch { setSolicitud(null); }
  }, []);

  const fetchReservations = useCallback(async () => {
    try {
      const data = await getJSON("/reservas/empresa");
      setReservations(Array.isArray(data) ? data : []);
    } catch { setReservations([]); }
  }, []);

  const fetchDocumentos = useCallback(async () => {
    try {
      const data = await getJSON("/documentos/empresa");
      setDocumentos({
        solicitudes: Array.isArray(data?.solicitudes) ? data.solicitudes : [],
        reservas: Array.isArray(data?.reservas) ? data.reservas : [],
      });
    } catch {
      setDocumentos({ solicitudes: [], reservas: [] });
    }
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
    Promise.all([fetchSolicitud(), fetchReservations(), fetchDocumentos()]).finally(() => setLoading(false));
  }, [user, navigate, fetchSolicitud, fetchReservations, fetchDocumentos]);

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
        subtitle={`${user.nombre}${user.email ? ` · ${user.email}` : user.cif ? ` · ${user.cif}` : ""}`}
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
        <button className={tabCls(view === "documentos")} onClick={() => setView("documentos")}>
          Mis documentos
          {(documentos.solicitudes.filter((d) => d.id_documento).length + documentos.reservas.length) > 0 && (
            <span className="ml-1.5 inline-block text-[0.7rem] bg-brand-500 text-white rounded-full px-1.5 py-0.5 leading-none">
              {documentos.solicitudes.filter((d) => d.id_documento).length + documentos.reservas.length}
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
          cambio={cambio}
          onReapplySuccess={fetchSolicitud}
          onCambioChange={fetchSolicitud}
          onCupoChange={async () => {
            await fetchSolicitud();
            await fetchReservations();
          }}
        />
      ) : view === "reservas" ? (
        <div className="form-card">
          <p className="form-section-title">Mis reservas</p>
          <MisReservas
            reservations={reservations}
            onUpload={async () => {
              await fetchReservations();
              await fetchDocumentos();
            }}
            onCancel={handleCancelReservation}
          />
        </div>
      ) : (
        <MisDocumentos
          documentos={documentos}
          onRefresh={async () => {
            await fetchDocumentos();
            await fetchReservations();
          }}
        />
      )}
    </div>
  );
};

export default CompanyView;


