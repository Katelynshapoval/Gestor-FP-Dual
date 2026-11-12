import { useEffect, useState, useCallback } from "react";
import ReadField from "../../components/ui/ReadField.jsx";
import { useUser } from "../../context/UserContext";
import { useNavigate } from "react-router-dom";
import { getJSON, postJSON } from "../../utils/api.js";
import MisReservas from "./MisReservas.jsx";
import MisDocumentos from "./MisDocumentos.jsx";
import SpecialitySelector from "../AddCompanyRequest/SpecialitySelector.jsx";
import TransportSelector from "../AddCompanyRequest/TransportSelector.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import CompanyEditForm, {
  COMPANY_SECTIONS,
  applyProposed,
  datosToForm,
} from "./CompanyEditForm.jsx";
import EditDialog, { countChanges } from "../../components/forms/EditDialog.jsx";
import CambioDiff from "./CambioDiff.jsx";
import EspecialidadCuposEditor from "./EspecialidadCuposEditor.jsx";
import TutoresEmpresa from "./TutoresEmpresa.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";
import InlineNotice from "../../components/ui/InlineNotice.jsx";
import Tabs from "../../components/ui/Tabs.jsx";
import Pendientes from "../../components/portal/Pendientes.jsx";
import ReservaDetalle from "../../components/reservas/ReservaDetalle.jsx";
import { anexoNombre, label } from "../../utils/labels.js";
import "../../styles/forms.css";

const pendienteDeEmpresa = (doc) =>
  doc &&
  ((doc.firmas_pendientes || []).some((r) => String(r).toUpperCase() === "EMPRESA") ||
    ["PENDIENTE_SUBIDA", "RECHAZADO"].includes(doc.estado_operativo));

// What the company must do, or is waiting for, from the data the portal loads.
export function pendientesEmpresa({ solicitud, cambio, reservations, documentos, irA, abrirReserva, irAlumnos }) {
  const items = [];
  if (!solicitud) {
    items.push({
      key: "sin-solicitud",
      tone: "info",
      title: "Vuestra empresa no tiene ninguna solicitud registrada.",
      text: "Si creéis que es un error, contactad con el centro.",
    });
    return items;
  }
  if (solicitud.puede_reaplicar) {
    items.push({
      key: "reaplicar",
      tone: "action",
      title: `Participad en la convocatoria ${solicitud.convocatoria_abierta?.nombre || "abierta"}.`,
      text: "Vuestra última solicitud es de una convocatoria anterior.",
      action: { label: "Participar", onClick: () => irA("datos") },
    });
  }
  const activa = Boolean(solicitud.convocatoria_activa);
  if (activa && solicitud.estado_validacion === "RECHAZADO") {
    items.push({
      key: "rechazada",
      tone: "action",
      title: "Vuestra solicitud ha sido rechazada.",
      text: solicitud.motivo ? `Motivo: ${solicitud.motivo}. Contactad con el centro.` : "Contactad con el centro.",
    });
  }
  for (const d of documentos) {
    if (d.id_reserva) continue; // reservation documents are listed per reservation below
    if ((d.accion_pendiente_de || []).includes("EMPRESA")) {
      items.push({
        key: `doc-${d.clave}-${d.id_solicitud_empresa || 0}`,
        tone: "action",
        title: `${d.nombre}: ${label("documento", d.estado_operativo).toLowerCase()}.`,
        text: d.estado_operativo === "RECHAZADO" && d.motivo ? `Motivo: ${d.motivo}` : null,
        action: { label: "Ir a documentos", onClick: () => irA("documentos") },
      });
    }
  }
  for (const r of reservations.filter((x) => x.estado_reserva !== "CANCELADA")) {
    const resumen = r.documentos_resumen || {};
    const tareas = [];
    if (pendienteDeEmpresa(resumen.anexo)) {
      const firmar = (resumen.anexo.firmas_pendientes || []).some((x) => String(x).toUpperCase() === "EMPRESA") && resumen.anexo.id_documento;
      tareas.push(`${firmar ? "firmar" : resumen.anexo.estado_operativo === "RECHAZADO" ? "subir de nuevo" : "subir"} el ${anexoNombre(resumen.anexo.clave)}`);
    }
    if (pendienteDeEmpresa(resumen.calendario)) tareas.push(resumen.calendario.estado_operativo === "RECHAZADO" ? "subir de nuevo el Calendario" : "subir el Calendario");
    if (tareas.length) {
      items.push({
        key: `reserva-${r.id_reserva}`,
        tone: "action",
        title: `Reserva de ${r.alumno}: ${tareas.join(" y ")}.`,
        action: { label: "Abrir reserva", onClick: () => abrirReserva(r.id_reserva) },
      });
    }
  }
  if (cambio?.pending) {
    items.push({
      key: "cambio",
      tone: "waiting",
      title: "Vuestros cambios de datos están pendientes de aprobación por el centro.",
      text: "Mientras tanto se muestran los datos aprobados.",
    });
  }
  if (activa && solicitud.estado_validacion === "PENDIENTE") {
    items.push({
      key: "revision",
      tone: "waiting",
      title: "El centro validará vuestra solicitud cuando el convenio esté firmado.",
      text: "Hasta entonces no podéis reservar alumnos.",
    });
  }
  if (activa && solicitud.estado_validacion === "VALIDADO") {
    const activas = reservations.filter((x) => x.estado_reserva !== "CANCELADA").length;
    items.push({
      key: "reservar",
      tone: "info",
      title: activas
        ? `Tenéis ${activas} ${activas === 1 ? "reserva activa" : "reservas activas"}.`
        : "Vuestra solicitud está validada: ya podéis reservar alumnos.",
      action: { label: "Ver alumnos disponibles", onClick: irAlumnos },
    });
  }
  return items;
}

// Read-only field styled to match the rest of the form layout

// Company data panel with optional re-apply form
const MisDatos = ({
  solicitud,
  specialities,
  transports,
  cambio,
  onReapplySuccess,
  onCambioChange,
  onCupoChange,
}) => {
  const toast = useToast();
  const [showReapply, setShowReapply] = useState(!!solicitud?.puede_reaplicar);
  const [reapplyDone, setReapplyDone] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => datosToForm(solicitud));
  // What the dialog opened with (the pending request, if any), to count changes.
  const [base, setBase] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (!solicitud) {
    return (
      <div className="form-card">
        <p className="py-8 text-center text-muted">
          Tu empresa todavía no tiene ninguna solicitud registrada. Contacta con el centro si crees que es un error.
        </p>
      </div>
    );
  }
  const esAnterior = !solicitud.convocatoria_activa;

  const esps = solicitud.especialidades || [];
  const transporteNombres = (solicitud.transportes || [])
    .map((t) => {
      const catalogo = transports.find(
        (tr) => Number(tr.id_transporte) === Number(t.id_transporte),
      );

      return (
        catalogo?.nombre_mostrar ||
        t.nombre_mostrar ||
        catalogo?.nombre ||
        t.nombre
      );
    })
    .filter(Boolean);
  const pending = cambio?.pending;
  const rejected =
    !pending && cambio?.ultimo?.estado === "RECHAZADO" ? cambio.ultimo : null;

  const startEdit = () => {
    const f = pending
      ? applyProposed(solicitud, pending.proposed)
      : datosToForm(solicitud);
    setBase(f);
    setForm(f);
    setEditing(true);
  };

  const handleSubmitCambio = async (body) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const data = await postJSON(
        `/solicitudes/empresa/${solicitud.id_solicitud_empresa}/cambios`,
        body,
      );
      setEditing(false);
      toast.success(data.message || "Cambios enviados para revisión");
      if (onCambioChange) await onCambioChange();
    } catch (err) {
      toast.error(err.message || "Error al enviar los cambios.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {esAnterior && (
        <InlineNotice
          tone={solicitud.puede_reaplicar ? "warning" : "info"}
          className="mb-5"
        >
          {solicitud.puede_reaplicar
            ? `Tu empresa todavía no participa en la convocatoria ${solicitud.convocatoria_abierta?.nombre || "abierta"}. Se muestran los datos de tu última solicitud (${solicitud.convocatoria || "convocatoria anterior"}). Usa «Participar en la nueva convocatoria» para presentarte.`
            : `No hay ninguna convocatoria abierta. Se muestran los datos de tu última solicitud (${solicitud.convocatoria || "convocatoria anterior"}).`}
        </InlineNotice>
      )}

      <div className="form-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="form-section-title mb-1">Datos vigentes</h2>
          <p className="text-sm text-muted">
            Estos son los datos aprobados actualmente. Las modificaciones se
            envían al centro para revisión.
          </p>
        </div>
        {solicitud.convocatoria_activa && !editing && (
          <button type="button" className="btn btn-primary" onClick={startEdit}>
            {pending ? "Modificar solicitud pendiente" : "Editar datos"}
          </button>
        )}
      </div>

      {pending && (
        <div className="form-card border-amber-200 bg-amber-50">
          <h2 className="form-section-title text-amber-900">
            Cambios enviados para revisión
          </h2>
          <p className="mb-3 text-sm text-amber-800">
            La solicitud está pendiente de aprobación. Los datos vigentes no
            cambian hasta que el centro la revise.
          </p>
          <CambioDiff diff={pending.diff} />
        </div>
      )}

      {rejected && (
        <div className="form-card border-red-200 bg-red-50">
          <h2 className="form-section-title text-red-900">
            Solicitud de cambios rechazada
          </h2>
          <p className="text-sm text-red-800">
            {rejected.motivo || "Sin motivo indicado."}
          </p>
        </div>
      )}

      <EditDialog
        open={editing}
        onClose={() => setEditing(false)}
        title={pending ? "Modificar solicitud de cambios" : "Editar datos"}
        subject={solicitud.empresa || solicitud.razonSocial}
        mode="review"
        sections={COMPANY_SECTIONS}
        notice={
          <InlineNotice tone={pending ? "warning" : "info"}>
            {pending
              ? "Estás modificando vuestra solicitud pendiente. Se sustituirá por la nueva."
              : "Los datos vigentes no cambian hasta que el centro apruebe la solicitud."}
          </InlineNotice>
        }
        formId="editar-datos-empresa"
        submitLabel={pending ? "Actualizar solicitud de cambios" : "Enviar para revisión"}
        submitting={submitting}
        changes={countChanges(base, form)}
      >
        {editing && (
          <CompanyEditForm
            key={pending?.id_cambio || "new"}
            formId="editar-datos-empresa"
            values={form}
            onChange={setForm}
            transports={transports}
            onSubmit={handleSubmitCambio}
          />
        )}
      </EditDialog>

      {/* Principal coordinator section */}
      <div className="form-card">
        <h2 className="form-section-title">Coordinador principal</h2>
        <p className="field-hint">
          <strong>Importante:</strong> Esta persona recibe las notificaciones y
          documentos del proyecto DUAL y gestiona el acceso al portal con el CIF.
          Los tutores de alumnos se gestionan en la pestaña «Tutores».
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <ReadField
            label="Email coordinador principal"
            value={solicitud.emailCoordinador || solicitud.coordinador_email}
          />
          <ReadField
            label="Nombre coordinador principal"
            value={solicitud.nombreCoordinador || solicitud.coordinador_nombre}
          />
          <ReadField
            label="Teléfono coordinador principal"
            value={
              solicitud.telefonoCoordinador || solicitud.coordinador_telefono
            }
          />
        </div>
      </div>

      {/* Company info section */}
      <div className="form-card">
        <h2 className="form-section-title">Datos de la empresa</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <ReadField
            label="Razón Social"
            value={solicitud.razonSocial || solicitud.empresa}
          />
          <ReadField label="CIF" value={solicitud.cif} />
          <ReadField
            label="Teléfono empresa"
            value={solicitud.telEmpresa || solicitud.telefono}
          />
          <ReadField
            label="Dirección Razón Social"
            value={solicitud.dirRazSocial || solicitud.domicilio_legal}
          />
          <ReadField
            label="Municipio"
            value={solicitud.municipio || solicitud.localidad_legal}
          />
          <ReadField
            label="Provincia"
            value={solicitud.provincia || solicitud.provincia_legal}
          />
          <ReadField
            label="Código Postal"
            value={solicitud.cpRazSoc || solicitud.cp_legal}
          />
        </div>
      </div>

      {/* Legal representative */}
      <div className="form-card">
        <h2 className="form-section-title">Responsable Legal</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <ReadField
            label="Nombre responsable legal"
            value={solicitud.responsableLegal || solicitud.representante_nombre}
          />
          <ReadField
            label="DNI responsable"
            value={solicitud.dniRl || solicitud.representante_dni}
          />
          <ReadField
            label="Cargo"
            value={solicitud.cargo || solicitud.representante_cargo}
          />
        </div>
      </div>

      {/* Job position details */}
      <div className="form-card">
        <h2 className="form-section-title">Puesto de trabajo</h2>
        <div className="space-y-4">
          <ReadField
            label="Descripción del puesto"
            value={<span className="whitespace-pre-wrap">{solicitud.descripcionPuesto || solicitud.descripcion_puesto || "—"}</span>}
          />
          <ReadField
            label="Dirección del lugar de trabajo"
            value={
              solicitud.direccionLugarTrabajo || solicitud.domicilio_trabajo
            }
          />
        </div>
      </div>

      {/* Requested specialities and student counts */}
      <div className="form-card">
        <h2 className="form-section-title">Ciclo(s) de Grado solicitados</h2>
        <EspecialidadCuposEditor
          solicitudId={solicitud.id_solicitud_empresa}
          especialidades={esps}
          catalogo={specialities}
          onUpdated={onCupoChange}
          canEdit={!!solicitud.convocatoria_activa}
          soloReducir={solicitud.estado_validacion === "VALIDADO"}
        />
      </div>

      {/* Transport options */}
      <div className="form-card">
        <h2 className="form-section-title">Métodos de Transporte posibles</h2>
        <p className="field-hint">
          Medios de transporte con los que el alumno puede acceder al puesto.
        </p>
        {transporteNombres.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {transporteNombres.map((name, i) => (
              <li key={i} className="rounded-md border border-surface-200 bg-surface-50 px-3 py-1.5 text-sm text-charcoal-800">
                {name}
              </li>
            ))}
          </ul>
        ) : solicitud.transportes_conocidos === false ? (
          <p className="text-muted text-sm">
            No registrado: los datos de transporte de esta convocatoria no se conservaron.
          </p>
        ) : (
          <p className="text-muted text-sm">Sin datos</p>
        )}
      </div>

      {/* Re-apply section: only when a convocatoria is open and the company is not in it yet */}
      {solicitud.puede_reaplicar && (
      <div className="form-card">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowReapply((v) => !v)}
        >
          <h2 className="form-section-title mb-0">
            Participar en la nueva convocatoria
          </h2>
          <span
            className={`text-muted text-lg transition-transform ${showReapply ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </div>

        {showReapply && (
          <div className="mt-5">
            {reapplyDone ? (
              <p className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                Tu reaplicación ha sido enviada correctamente.
              </p>
            ) : (
              <ReapplyForm
                solicitud={solicitud}
                specialities={specialities}
                transports={transports}
                onSuccess={() => {
                  setReapplyDone(true);
                  toast.success("Tu solicitud para la nueva convocatoria se ha enviado. El centro la revisará.");
                  if (onReapplySuccess) onReapplySuccess();
                }}
              />
            )}
          </div>
        )}
      </div>
      )}
    </>
  );
};

// Re-apply form — lets the empresa re-submit with updated coordinator data and speciality picks
const ReapplyForm = ({ solicitud, specialities, transports, onSuccess }) => {
  const toast = useToast();
  // { [id_especialidad]: plazas }, starting from the last application.
  const initEsps = () =>
    Object.fromEntries((solicitud?.especialidades || []).map((e) => [e.id_especialidad, Number(e.cantidad_alumnos) || 1]));
  const initTransports = () =>
    (solicitud?.transportes || []).map((t) => t.id_transporte);

  const [nombreCoordinador, setNombreCoordinador] = useState(
    solicitud?.nombreCoordinador || solicitud?.coordinador_nombre || "",
  );
  const [emailCoordinador, setEmailCoordinador] = useState(
    solicitud?.emailCoordinador || solicitud?.coordinador_email || "",
  );
  const [telefonoCoordinador, setTelefonoCoordinador] = useState(
    solicitud?.telefonoCoordinador || solicitud?.coordinador_telefono || "",
  );
  const [descripcionPuesto, setDescripcionPuesto] = useState(
    solicitud?.descripcion_puesto || solicitud?.descripcionPuesto || "",
  );
  const [selectedEsps, setSelectedEsps] = useState(initEsps);
  const [selectedTransps, setSelectedTransps] = useState(initTransports);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState("");

  const handleEspToggle = (id) =>
    setSelectedEsps((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = 1;
      return next;
    });

  const handleAmountChange = (id, val) => setSelectedEsps((prev) => ({ ...prev, [id]: val }));

  const handleTranspToggle = (id) => {
    const n = Number(id);
    setSelectedTransps((prev) =>
      prev.includes(n) ? prev.filter((t) => t !== n) : [...prev, n],
    );
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const plazas = Object.values(selectedEsps);
    if (plazas.length === 0) {
      setFieldError("Selecciona al menos un ciclo.");
      return;
    }
    if (plazas.some((a) => !(a >= 1))) {
      setFieldError("Indica al menos un alumno por ciclo.");
      return;
    }
    setSubmitting(true);
    setFieldError("");
    try {
      await postJSON("/solicitudes/empresa/reapply", {
        nombreCoordinador,
        emailCoordinador,
        telefonoCoordinador,
        descripcion_puesto: descripcionPuesto,
        especialidades: Object.entries(selectedEsps).map(([id, n]) => ({
          idEspecialidad: Number(id),
          cantidadAlumnos: n,
        })),
        transportes: selectedTransps,
      });
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(
        err.code === "SOLICITUD_EXISTENTE"
          ? "Ya existe una solicitud para la convocatoria activa."
          : err.code === "SIN_CONVOCATORIA"
            ? "No hay ninguna convocatoria abierta en este momento."
            : err.message || "Error al enviar.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Puedes modificar los datos del coordinador principal, el puesto y los ciclos. Los datos de la empresa se mantienen.
        La nueva solicitud queda pendiente hasta que el centro valide su convenio.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="field">
          <label htmlFor="reapply-nombre">Nombre coordinador principal</label>
          <input
            id="reapply-nombre"
            className="input"
            value={nombreCoordinador}
            onChange={(e) => setNombreCoordinador(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="reapply-email">Email coordinador principal</label>
          <input
            id="reapply-email"
            className="input"
            type="email"
            value={emailCoordinador}
            onChange={(e) => setEmailCoordinador(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="reapply-tel">Teléfono coordinador principal</label>
          <input
            id="reapply-tel"
            className="input"
            value={telefonoCoordinador}
            onChange={(e) => setTelefonoCoordinador(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="reapply-puesto">Descripción del puesto</label>
        <textarea
          id="reapply-puesto"
          className="textarea"
          value={descripcionPuesto}
          onChange={(e) => setDescripcionPuesto(e.target.value)}
          maxLength={500}
        />
      </div>

      <SpecialitySelector
        dataSpecialities={specialities}
        selected={selectedEsps}
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

      <InlineNotice tone="error">{fieldError}</InlineNotice>
    </div>
  );
};

// Main empresa portal: Mis datos / Mis reservas / Mis documentos
const CompanyView = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const [view, setView] = useState("datos");
  const [reservaAbierta, setReservaAbierta] = useState(null);

  const [solicitud, setSolicitud] = useState(null);
  const [cambio, setCambio] = useState({ pending: null, ultimo: null });
  const [reservations, setReservations] = useState([]);
  const [documentos, setDocumentos] = useState({
    solicitudes: [],
    reservas: [],
  });
  const [specialities, setSpecialities] = useState([]);
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(true);
  // Per-tab load errors: a failed request is never shown as "no data".
  const [loadErrors, setLoadErrors] = useState({});
  const setLoadError = (key, err) =>
    setLoadErrors((prev) => ({ ...prev, [key]: err ? err.message || "Error al cargar." : null }));

  const fetchSolicitud = useCallback(async () => {
    try {
      const basic = await getJSON("/solicitudes/empresa/mia?incluir_anteriores=1");
      const idSol = basic.id_solicitud_empresa;
      const [full, docs, esps, cambios] = await Promise.all([
        getJSON(`/solicitudes/empresa/${idSol}`),
        getJSON(`/solicitudes/empresa/${idSol}/documentos`),
        getJSON(`/solicitudes/empresa/${idSol}/especialidades`),
        getJSON(`/solicitudes/empresa/${idSol}/cambios`),
      ]);
      setSolicitud({
        ...basic,
        ...full,
        convocatoria_activa: basic.convocatoria_activa,
        documentos: docs,
        especialidades: esps,
      });
      setCambio(cambios || { pending: null, ultimo: null });
      setLoadError("solicitud", null);
    } catch (err) {
      setSolicitud(null);
      // 404 SIN_SOLICITUD = the company has no application at all (not an error).
      setLoadError("solicitud", err.status === 404 && err.code === "SIN_SOLICITUD" ? null : err);
    }
  }, []);

  const fetchReservations = useCallback(async () => {
    try {
      const data = await getJSON("/reservas/empresa");
      setReservations(Array.isArray(data) ? data : []);
      setLoadError("reservas", null);
    } catch (err) {
      setLoadError("reservas", err);
    }
  }, []);

  const fetchDocumentos = useCallback(async () => {
    try {
      const data = await getJSON("/documentos/empresa");
      setDocumentos({
        items: Array.isArray(data?.items) ? data.items : [],
      });
      setLoadError("documentos", null);
    } catch (err) {
      setLoadError("documentos", err);
    }
  }, []);

  const refreshReservasYDocumentos = useCallback(async () => {
    await Promise.all([fetchReservations(), fetchDocumentos()]);
  }, [fetchReservations, fetchDocumentos]);

  useEffect(() => {
    if (!user || user.rol !== "EMPRESA") {
      navigate("/login");
      return;
    }
    Promise.all([getJSON("/especialidades"), getJSON("/transportes")])
      .then(([s, t]) => {
        setSpecialities(s);
        setTransports(t);
      })
      .catch(console.error);
    Promise.all([
      fetchSolicitud(),
      fetchReservations(),
      fetchDocumentos(),
    ]).finally(() => setLoading(false));
  }, [user, navigate, fetchSolicitud, fetchReservations, fetchDocumentos]);

  if (!user || user.rol !== "EMPRESA") return null;

  const docItems = documentos.items || [];
  const accionesDocs = docItems.filter((d) => !d.id_reserva && (d.accion_pendiente_de || []).includes("EMPRESA")).length;
  const activas = reservations.filter((r) => r.estado_reserva !== "CANCELADA").length;
  const empresaNombre = solicitud?.empresa || solicitud?.razonSocial || user.nombre;

  return (
    <div className="page-container">
      <PageHeader
        kicker="Mi empresa"
        title={empresaNombre}
        subtitle={[solicitud?.cif || user.cif, solicitud?.convocatoria && `Convocatoria ${solicitud.convocatoria}`].filter(Boolean).join(" · ")}
      />

      {loading ? (
        <p role="status" className="py-16 text-center text-muted">Cargando el portal de tu empresa…</p>
      ) : (
        <>
          <Pendientes
            items={pendientesEmpresa({
              solicitud,
              cambio,
              reservations,
              documentos: docItems,
              irA: setView,
              abrirReserva: setReservaAbierta,
              irAlumnos: () => navigate("/alumnos"),
            })}
          />
          <Tabs
            label="Secciones del portal"
            value={view}
            onChange={setView}
            tabs={[
              { id: "datos", label: "Datos de la empresa" },
              { id: "tutores", label: "Tutores" },
              { id: "reservas", label: "Reservas", badge: activas || null, badgeLabel: "activas" },
              { id: "documentos", label: "Documentos", badge: accionesDocs || null, badgeTone: "action", badgeLabel: "pendientes" },
            ]}
          >
            {loadErrors[{ datos: "solicitud", reservas: "reservas", documentos: "documentos" }[view]] ? (
              <div role="alert" className="form-card text-center">
                <p className="font-semibold text-charcoal-950">No se pudieron cargar los datos.</p>
                <p className="mt-2 text-sm text-muted">
                  {loadErrors[{ datos: "solicitud", reservas: "reservas", documentos: "documentos" }[view]]}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm mt-4"
                  onClick={() =>
                    view === "datos" ? fetchSolicitud() : view === "reservas" ? fetchReservations() : fetchDocumentos()
                  }
                >
                  Reintentar
                </button>
              </div>
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
            ) : view === "tutores" ? (
              <TutoresEmpresa />
            ) : view === "reservas" ? (
              <div className="form-card">
                <h2 className="form-section-title">Reservas</h2>
                <MisReservas reservations={reservations} onChanged={refreshReservasYDocumentos} />
              </div>
            ) : (
              <MisDocumentos documentos={documentos} onRefresh={refreshReservasYDocumentos} />
            )}
          </Tabs>
          <ReservaDetalle
            idReserva={reservaAbierta}
            open={Boolean(reservaAbierta)}
            onClose={() => setReservaAbierta(null)}
            onChanged={refreshReservasYDocumentos}
          />
        </>
      )}
    </div>
  );
};

export default CompanyView;
