import { useCallback, useEffect, useState } from "react";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { MdOutlineRadioButtonUnchecked } from "react-icons/md";
import Modal from "../ui/Modal.jsx";
import MotivoDialog from "../ui/MotivoDialog.jsx";
import EstadoBadge from "../ui/EstadoBadge.jsx";
import PdfViewer from "../ui/PdfViewer.jsx";
import DocumentoItem from "../DocumentoItem.jsx";
import TipoContratoSelect from "../TipoContratoSelect.jsx";
import TutorAssignSelect from "../TutorAssignSelect.jsx";
import { useConfirm, useToast } from "../feedback/ToastProvider.jsx";
import { getJSON, postJSON } from "../../utils/api.js";
import { ACTOR, tipoContratoLabel } from "../../utils/labels.js";
import { formatDocumentDate } from "../../utils/documentos.js";

// The whole lifecycle of one reservation in one place (Phase 3, D.1):
// state, contract type, Anexo II/III and calendar (upload, generate, sign,
// validate, reject), tutor, confirmation checklist, cancellation and
// reassignment. Used from Enlazar, Empresas colaboradoras, Documentos ›
// Seguimiento and the company and student portals.
//
// Everything shown comes from GET /reservas/:id/detalle, which projects the
// document catalogue and the Phase 2 rules for the caller's role, so a role
// never sees an action it cannot take. The endpoints check the rules again.
export default function ReservaDetalle({ idReserva, open, onClose, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // "cancelar" | "reasignar"
  const [viewingHist, setViewingHist] = useState(null);

  const load = useCallback(async () => {
    if (!idReserva) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getJSON(`/reservas/${idReserva}/detalle`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [idReserva]);

  useEffect(() => {
    if (open) load();
    else {
      setData(null);
      setDialog(null);
    }
  }, [open, load]);

  // After any change: reload this panel and tell the screen behind it.
  const changed = useCallback(async () => {
    await load();
    if (onChanged) await onChanged();
  }, [load, onChanged]);

  const r = data?.reserva;
  const acciones = data?.acciones || {};

  const confirmar = async () => {
    const accepted = await confirm({
      title: "Confirmar reserva",
      message: `${r.alumno} quedará asignado definitivamente a ${r.empresa}. Sus otras reservas pendientes se cancelarán.`,
      confirmLabel: "Confirmar reserva",
      tone: "primary",
    });
    if (!accepted) return;
    setBusy(true);
    try {
      // The stored contract type is used (D2): no type is sent.
      const res = await postJSON(`/reservas/${r.id_reserva}/confirmar`, {});
      toast.success(res.message || "Reserva confirmada.");
      await changed();
    } catch (err) {
      toast.error(err.message || "No se pudo confirmar la reserva.");
    } finally {
      setBusy(false);
    }
  };

  const cancelar = async (motivo) => {
    const via = acciones.cancelar?.via || "cancelar-admin";
    const res = await postJSON(`/reservas/${r.id_reserva}/${via}`, { motivo });
    toast.success(res.message || "Reserva cancelada.");
    setDialog(null);
    await changed();
  };

  const title = r ? `${r.alumno} · ${r.empresa}` : "Reserva";
  const description = r ? [r.especialidad, r.convocatoria].filter(Boolean).join(" · ") : undefined;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={title}
        description={description}
        size="lg"
        busy={busy}
        footer={
          r && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>
                Cerrar
              </button>
              {acciones.reasignar?.permitido && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog("reasignar")} disabled={busy}>
                  Reasignar
                </button>
              )}
              {acciones.cancelar?.permitido && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setDialog("cancelar")} disabled={busy}>
                  Cancelar reserva
                </button>
              )}
            </>
          )
        }
      >
        {loading && !data ? (
          <PanelState>Cargando la reserva…</PanelState>
        ) : error ? (
          <PanelState>
            <p className="font-semibold text-charcoal-950">
              {error.status === 403 ? "No tienes acceso a esta reserva." : "No se pudo cargar la reserva."}
            </p>
            <p className="mt-1 text-sm text-muted">{error.message}</p>
            {error.status !== 403 && error.status !== 404 && (
              <button type="button" className="btn btn-primary btn-sm mt-4" onClick={load}>
                Reintentar
              </button>
            )}
          </PanelState>
        ) : r ? (
          <div className="space-y-5" aria-busy={loading}>
            <Resumen r={r} />

            <Section title="Tipo de contrato">
              {acciones.cambiar_tipo?.permitido ? (
                <>
                  <TipoContratoSelect
                    idReserva={r.id_reserva}
                    idTipoContrato={r.id_tipo_contrato}
                    onSaved={changed}
                    familiaFija={r.anexo_clave && acciones.cambio_familia && !acciones.cambio_familia.permitido ? r.anexo_clave : null}
                  />
                  {r.anexo_clave && !acciones.cambio_familia?.permitido && (
                    <p className="mt-2 text-xs text-amber-800">{acciones.cambio_familia.motivo}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-charcoal-800">
                  {tipoContratoLabel(r.tipo_contrato) || "Sin indicar"}
                  {!r.tipo_contrato && r.estado_reserva === "PENDIENTE" && (
                    <span className="block text-xs text-muted">
                      El centro indicará el tipo de contrato; entonces aparecerá el Anexo II o III.
                    </span>
                  )}
                </p>
              )}
            </Section>

            <Section title="Documentos de la reserva">
              {r.estado_reserva === "CANCELADA" && (
                <p className="mb-2 text-xs text-muted">La reserva está cancelada: sus documentos solo se pueden consultar.</p>
              )}
              {!r.anexo_clave && r.estado_reserva !== "CANCELADA" && (
                <p className="mb-2 text-xs text-muted">El Anexo II o III aparece cuando se indica el tipo de contrato.</p>
              )}
              {data.documentos.length === 0 ? (
                <p className="text-sm text-muted">No hay documentos visibles para tu perfil.</p>
              ) : (
                <div className="divide-y divide-surface-200 rounded-lg border border-surface-200 bg-white px-3">
                  {data.documentos.map((doc) => (
                    <DocumentoItem key={doc.clave} doc={doc} onRefresh={changed} compact />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Tutor de empresa">
              {acciones.asignar_tutor?.permitido ? (
                <TutorAssignSelect
                  idReserva={r.id_reserva}
                  idEmpresa={r.id_empresa}
                  idEmpresaTutor={r.id_empresa_tutor}
                  tutorNombre={r.tutor_nombre}
                  onAssigned={changed}
                />
              ) : (
                <p className="text-sm text-charcoal-800">
                  {r.tutor_nombre || "Sin tutor asignado"}
                  {r.tutor_email && <span className="block text-xs text-muted">{r.tutor_email}</span>}
                </p>
              )}
            </Section>

            {r.estado_reserva === "PENDIENTE" && (
              <Section title="Confirmación">
                <ul className="space-y-1.5" aria-label="Requisitos para confirmar">
                  {data.confirmacion.requisitos.map((req) => (
                    <li key={req.clave} className="flex items-start gap-2 text-sm">
                      {req.ok ? (
                        <IoIosCheckmarkCircleOutline className="mt-0.5 shrink-0 text-green-600" aria-hidden="true" />
                      ) : (
                        <MdOutlineRadioButtonUnchecked className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                      )}
                      <span className={req.ok ? "text-charcoal-800" : "text-muted"}>
                        {req.texto}
                        <span className="sr-only">{req.ok ? " (cumplido)" : " (pendiente)"}</span>
                        {!req.ok && req.pendientes?.length > 0 && (
                          <span className="block text-xs text-amber-800">
                            Falta: {req.pendientes.map((p) => ACTOR[p === "GESTOR" ? "CENTRO" : p] || p).join(", ")}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {acciones.confirmar?.permitido ? (
                  <button type="button" className="btn btn-primary btn-sm mt-3" onClick={confirmar} disabled={busy}>
                    Confirmar reserva
                  </button>
                ) : (
                  <p className="mt-3 text-xs text-muted">{acciones.confirmar?.motivo}</p>
                )}
              </Section>
            )}

            {data.historial.length > 0 && (
              <Section title="Historial de documentos">
                <ul className="divide-y divide-surface-200 rounded-lg border border-surface-200 bg-white">
                  {data.historial.map((h) => (
                    <li key={h.id_documento} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-charcoal-950">{h.nombre}</p>
                        <p className="text-xs text-muted">
                          {h.motivo_historial === "LEGACY" ? "Documento del procedimiento anterior" : "Versión anterior, ya no vigente"}
                          {h.registrado_en ? ` · ${formatDocumentDate(h.registrado_en)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <EstadoBadge kind="validacion" value={h.estado_validacion} />
                        {h.tiene_archivo && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setViewingHist(h)}>
                            Ver
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        ) : null}
      </Modal>

      <MotivoDialog
        open={dialog === "cancelar"}
        onClose={() => setDialog(null)}
        onConfirm={cancelar}
        title="Cancelar reserva"
        description={r ? `${r.alumno} en ${r.empresa}. La reserva y sus documentos quedan en el historial.` : undefined}
        label="Motivo de la cancelación"
        confirmLabel="Cancelar reserva"
        busyLabel="Cancelando…"
      />

      {r && (
        <ReasignarDialog
          open={dialog === "reasignar"}
          reserva={r}
          onClose={() => setDialog(null)}
          onDone={async () => {
            setDialog(null);
            await changed();
          }}
        />
      )}

      <PdfViewer
        open={Boolean(viewingHist)}
        onClose={() => setViewingHist(null)}
        idDocumento={viewingHist?.id_documento}
        title={viewingHist ? `${viewingHist.nombre} (histórico)` : ""}
        estado={viewingHist ? { kind: "validacion", value: viewingHist.estado_validacion } : undefined}
        motivo={viewingHist?.estado_validacion === "RECHAZADO" ? viewingHist.motivo : null}
      />
    </>
  );
}

// WF-8: reassignment is offered for pending AND confirmed reservations; the
// backend lists destinations with free places and creates a new PENDIENTE
// reservation there (sp_reasignar_reserva).
function ReasignarDialog({ open, reserva, onClose, onDone }) {
  const toast = useToast();
  const [ofertas, setOfertas] = useState(null);
  const [error, setError] = useState(null);
  const [idOferta, setIdOferta] = useState("");

  useEffect(() => {
    if (!open) return;
    setOfertas(null);
    setError(null);
    setIdOferta("");
    getJSON(`/reservas/ofertas-elegibles?id_solicitud_alumno=${reserva.id_solicitud_alumno}&reasignar_desde=${reserva.id_reserva}`)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setOfertas(list);
        setIdOferta(list[0] ? String(list[0].id_solicitud_empresa_especialidad) : "");
      })
      .catch((err) => setError(err.message || "No se pudieron cargar las ofertas."));
  }, [open, reserva.id_solicitud_alumno, reserva.id_reserva]);

  const submit = async (motivo) => {
    const res = await postJSON(`/reservas/${reserva.id_reserva}/reasignar`, {
      id_solicitud_empresa_especialidad: Number(idOferta),
      motivo,
    });
    toast.success(res.message || "Alumno reasignado.");
    await onDone();
  };

  const confirmed = reserva.estado_reserva === "CONFIRMADA";

  return (
    <MotivoDialog
      open={open}
      onClose={onClose}
      onConfirm={submit}
      title="Reasignar alumno"
      description={
        confirmed
          ? "La plaza confirmada se cancelará y se creará una reserva pendiente en la nueva empresa, que tendrá que completar su documentación y confirmarse de nuevo."
          : "Esta reserva se cancelará y se creará una reserva pendiente en la empresa elegida. Si no puede crearse, se mantiene la actual."
      }
      label="Motivo de la reasignación"
      confirmLabel="Reasignar"
      busyLabel="Reasignando…"
      tone="primary"
      canConfirm={Boolean(idOferta)}
    >
      <div className="field">
        <label htmlFor="reasignar-oferta">Nueva oferta</label>
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : ofertas === null ? (
          <p className="text-sm text-muted">Cargando ofertas…</p>
        ) : ofertas.length === 0 ? (
          <p className="text-sm text-muted">
            No hay otras ofertas de la misma especialidad y convocatoria con plazas libres.
          </p>
        ) : (
          <select
            id="reasignar-oferta"
            className="select-input w-full py-2 text-sm"
            value={idOferta}
            onChange={(e) => setIdOferta(e.target.value)}
          >
            {ofertas.map((o) => (
              <option key={o.id_solicitud_empresa_especialidad} value={o.id_solicitud_empresa_especialidad}>
                {o.empresa} · {o.especialidad} ({o.plazas_disponibles} {o.plazas_disponibles === 1 ? "plaza" : "plazas"})
              </option>
            ))}
          </select>
        )}
      </div>
    </MotivoDialog>
  );
}

function Resumen({ r }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <Item term="Alumno" value={[r.alumno, r.dni].filter(Boolean).join(" · ")} />
        <Item term="Empresa" value={r.empresa} />
        <Item term="Especialidad" value={r.especialidad} />
        <Item term="Convocatoria" value={`${r.convocatoria}${r.convocatoria_activa ? " (activa)" : ""}`} />
      </dl>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <EstadoBadge kind="reserva" value={r.estado_reserva} />
        {r.estado_reserva === "CANCELADA" && r.motivo && (
          <p className="max-w-xs text-xs text-muted sm:text-right">Motivo: {r.motivo}</p>
        )}
      </div>
    </div>
  );
}

function Item({ term, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted">{term}</dt>
      <dd className="break-words text-charcoal-900">{value || "—"}</dd>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">{title}</h3>
      {children}
    </section>
  );
}

function PanelState({ children }) {
  return <div className="py-10 text-center text-sm text-muted">{children}</div>;
}

