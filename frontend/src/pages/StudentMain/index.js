import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { getJSON } from "../../utils/api.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import MisDatos from "./MisDatos.jsx";
import MisReservas from "./MisReservas.jsx";
import MisDocumentos from "./MisDocumentos.jsx";
import Tabs from "../../components/ui/Tabs.jsx";
import Pendientes from "../../components/portal/Pendientes.jsx";
import ReservaDetalle from "../../components/reservas/ReservaDetalle.jsx";
import { anexoNombre, label } from "../../utils/labels.js";
import "../../styles/forms.css";

const firmaPendienteDe = (resumenDoc, rol) =>
  (resumenDoc?.firmas_pendientes || []).some((r) => String(r).toUpperCase() === rol);

// What the student must do, or is waiting for, from the data the portal loads.
export function pendientesAlumno({ solicitud, reservas, documentos, irA, abrirReserva }) {
  const items = [];
  if (!solicitud) {
    items.push({
      key: "sin-solicitud",
      tone: "info",
      title: "No tienes ninguna solicitud de FP Dual.",
      text: "Si el plazo está abierto, puedes presentarla desde la página de inicio.",
    });
    return items;
  }
  const estado = solicitud.estado_validacion;
  if (estado === "RECHAZADO") {
    items.push({
      key: "rechazada",
      tone: "action",
      title: "Tu solicitud ha sido rechazada.",
      text: solicitud.motivo ? `Motivo: ${solicitud.motivo}. Ponte en contacto con el centro.` : "Ponte en contacto con el centro.",
    });
  }
  for (const d of documentos) {
    if ((d.accion_pendiente_de || []).includes("ALUMNO")) {
      const rechazado = d.estado_operativo === "RECHAZADO";
      items.push({
        key: `doc-${d.clave}-${d.id_reserva || 0}`,
        tone: "action",
        title: rechazado
          ? `${d.nombre}: rechazado, sube una versión corregida.`
          : `${d.nombre}: ${label("documento", d.estado_operativo).toLowerCase()}.`,
        text: rechazado && d.motivo ? `Motivo: ${d.motivo}` : null,
        action: { label: "Ir a mis documentos", onClick: () => irA("documentos") },
      });
    }
  }
  const activas = reservas.filter((r) => r.estado_reserva !== "CANCELADA");
  for (const r of activas) {
    const anexo = r.documentos_resumen?.anexo;
    if (anexo && firmaPendienteDe(anexo, "ALUMNO")) {
      items.push({
        key: `firma-${r.id_reserva}`,
        tone: "action",
        title: `Firma el ${anexoNombre(anexo.clave)} de ${r.empresa}.`,
        text: "Ábrelo, revísalo y pulsa Firmar.",
        action: { label: "Abrir reserva", onClick: () => abrirReserva(r.id_reserva) },
      });
    }
  }
  const confirmada = activas.find((r) => r.estado_reserva === "CONFIRMADA");
  if (confirmada) {
    items.push({ key: "confirmada", tone: "done", title: `Tu plaza en ${confirmada.empresa} está confirmada.` });
  } else if (estado === "PENDIENTE") {
    items.push({
      key: "revision",
      tone: "waiting",
      title: "El centro está revisando tu solicitud.",
      text: "Te avisaremos por email cuando se resuelva.",
    });
  } else if (estado === "VALIDADO" && activas.length === 0) {
    items.push({
      key: "esperando",
      tone: "waiting",
      title: "Tu solicitud está validada.",
      text: "Las empresas ya pueden reservar tu candidatura. Te avisaremos por email cuando lo hagan.",
    });
  } else if (activas.length) {
    items.push({
      key: "reservas",
      tone: "waiting",
      title:
        activas.length === 1
          ? "Tienes una reserva pendiente de confirmación."
          : `Tienes ${activas.length} reservas pendientes de confirmación.`,
      text: "El centro confirma la plaza cuando el Anexo II o III está firmado por todos y validado.",
    });
  }
  return items;
}

function StudentMain() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [view, setView] = useState("datos");
  const [solicitud, setSolicitud] = useState(null);
  const [reservas, setReservas] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reservaAbierta, setReservaAbierta] = useState(null);

  // WF-17: "no application" is recognised by status and code, not by message text.
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      getJSON("/solicitudes/alumno/mia").catch((err) => {
        if (err.status === 404 && err.code === "SIN_SOLICITUD") return null;
        throw err;
      }),
      getJSON("/reservas/alumno"),
      getJSON("/documentos/alumno/mios"),
    ])
      .then(([sol, resv, docs]) => {
        setSolicitud(sol);
        setReservas(Array.isArray(resv) ? resv : []);
        setDocumentos(Array.isArray(docs?.items) ? docs.items : []);
      })
      .catch((err) => setError(err.message || "No se pudo cargar tu proceso Dual."))
      .finally(() => setLoading(false));
  }, []);

  // Refresh after an action inside a reservation (e.g. signing), without the loading screen.
  const refresh = useCallback(async () => {
    try {
      const [resv, docs] = await Promise.all([getJSON("/reservas/alumno"), getJSON("/documentos/alumno/mios")]);
      setReservas(Array.isArray(resv) ? resv : []);
      setDocumentos(Array.isArray(docs?.items) ? docs.items : []);
    } catch {
      /* the panel already reported the error */
    }
  }, []);

  useEffect(() => {
    if (!user || user.rol !== "ALUMNO") {
      navigate("/login");
      return;
    }
    load();
  }, [user, navigate, load]);

  if (!user || user.rol !== "ALUMNO") return null;

  const accionesDocs = documentos.filter((d) => (d.accion_pendiente_de || []).includes("ALUMNO")).length;
  const activas = reservas.filter((r) => r.estado_reserva !== "CANCELADA").length;

  return (
    <div className="page-container">
      <PageHeader
        kicker="Mi proceso Dual"
        title={user.nombre || "Portal del alumno"}
        subtitle={
          solicitud
            ? [solicitud.especialidad, solicitud.convocatoria && `Convocatoria ${solicitud.convocatoria}`].filter(Boolean).join(" · ")
            : "Portal del alumno"
        }
      />

      {loading ? (
        <p role="status" className="py-16 text-center text-muted">Cargando tu proceso Dual…</p>
      ) : error ? (
        <div role="alert" className="form-card text-center">
          <p className="font-semibold text-charcoal-950">No se pudo cargar tu proceso Dual.</p>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={load}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <Pendientes
            items={pendientesAlumno({ solicitud, reservas, documentos, irA: setView, abrirReserva: setReservaAbierta })}
          />
          <Tabs
            label="Secciones del portal"
            value={view}
            onChange={setView}
            tabs={[
              { id: "datos", label: "Mi solicitud" },
              { id: "reservas", label: "Mis reservas", badge: activas || null, badgeLabel: "activas" },
              { id: "documentos", label: "Mis documentos", badge: accionesDocs || null, badgeTone: "action", badgeLabel: "pendientes" },
            ]}
          >
            {view === "datos" ? (
              <MisDatos solicitud={solicitud} />
            ) : view === "reservas" ? (
              <MisReservas reservas={reservas} onChanged={refresh} />
            ) : (
              <MisDocumentos documentos={documentos} onChange={setDocumentos} />
            )}
          </Tabs>
          <ReservaDetalle
            idReserva={reservaAbierta}
            open={Boolean(reservaAbierta)}
            onClose={() => setReservaAbierta(null)}
            onChanged={refresh}
          />
        </>
      )}
    </div>
  );
}

export default StudentMain;
