import { useState } from "react";
import { FaHourglassHalf, FaLock, FaRegCircleCheck, FaRegCircleXmark, FaRegClock } from "react-icons/fa6";

import {
  cardBodyClass,
  cardClass,
  cardEspClass,
  cardNameClass,
  empresaChipClass,
  signedBadgeClass,
} from "../../../components/ui/cardStyles";

import DatosRapidos from "./student-card/DatosRapidos";
import Documentos from "./student-card/Documentos";
import EmpresaControl from "./student-card/EmpresaControl";
import EstadoSolicitud from "./student-card/EstadoSolicitud";
import AlumnoDatosActions from "./student-card/AlumnoDatosActions";
import StatusBadge from "../../../components/ui/StatusBadge";
import EstadoBadge from "../../../components/ui/EstadoBadge.jsx";
import MotivoDialog from "../../../components/ui/MotivoDialog.jsx";
import ReservarDialog from "../../../components/reservas/ReservarDialog.jsx";
import ReservaResumenBadges from "../../../components/reservas/ReservaResumenBadges.jsx";
import CuentaPanel from "../../../components/CuentaPanel.jsx";
import { label } from "../../../utils/labels.js";
import LongText from "../../../components/ui/LongText.jsx";
import CardActions, { cardHeaderActions, cardHeaderBadges, cardHeaderGrid, cardHeaderName } from "../../../components/ui/CardActions.jsx";
import {
  isCancelledReserva,
  isConfirmedReserva,
  isPendingReserva,
} from "../../../utils/reservaEstados.js";

// The reservation whose documents the header summarises: the confirmed one,
// otherwise the most recent pending one (WF-15: badges show real documents).
function reservaDeReferencia(reservas = []) {
  return (
    reservas.find((rv) => isConfirmedReserva(rv.estado_reserva)) ||
    reservas.find((rv) => isPendingReserva(rv.estado_reserva)) ||
    null
  );
}

// Compact chips showing which companies have reserved this student (with status icons).
// The confirmed reservation already has its own badge, so it is left out here.
const ReservasChips = ({ reservas, excludeId }) => {
  const visibles = (reservas || []).filter((rv) => rv.id_reserva !== excludeId);
  if (visibles.length === 0) return null;
  const extra = visibles.length - 3;
  return (
    <>
      {visibles.slice(0, 3).map((rv) => (
        <span
          key={rv.id_reserva}
          className={`${empresaChipClass} max-w-[11rem]`}
          title={`${rv.empresa} · ${label("reserva", rv.estado_reserva)}`}
        >
          {isConfirmedReserva(rv.estado_reserva) && (
            <FaRegCircleCheck className="text-green-600 text-xs" />
          )}
          {isPendingReserva(rv.estado_reserva) && (
            <FaRegClock className="text-amber-600 text-xs" />
          )}
          {isCancelledReserva(rv.estado_reserva) && (
            <FaRegCircleXmark className="text-red-500 text-xs" />
          )}
          <span className="truncate">{rv.empresa}</span>
        </span>
      ))}
      {extra > 0 && (
        <span className={empresaChipClass} title={`${extra} reservas más`}>
          +{extra}
        </span>
      )}
    </>
  );
};

// Reserve / cancel button for empresa users
const ReservaButton = ({ r, companyOffers, onReserve, onCancel }) => {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReserveModal, setShowReserveModal] = useState(false);
  const reservaConfirmada = r.reservas?.some((rv) =>
    isConfirmedReserva(rv.estado_reserva),
  );

  if (reservaConfirmada || r.asignado_definitivo) {
    return (
      <span className="flex items-center gap-1.5 rounded-lg border border-surface-200 bg-surface-50 px-3 py-1.5 text-xs font-medium text-muted">
        <FaLock className="shrink-0" aria-hidden="true" />
        Plaza confirmada en otra empresa
      </span>
    );
  }

  const miReservaId = r.mi_reserva_id;
  if (miReservaId) {
    return (
      <>
        <MotivoDialog
          open={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          onConfirm={async (motivo) => {
            await onCancel(miReservaId, motivo);
            setShowCancelModal(false);
          }}
          title="Cancelar reserva"
          description={`Indica el motivo de la cancelación para ${r.nombre || "este alumno"}.`}
          label="Motivo de la cancelación"
          confirmLabel="Cancelar reserva"
          busyLabel="Cancelando…"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowCancelModal(true);
          }}
          className="btn btn-danger btn-sm"
        >
          Cancelar reserva
        </button>
      </>
    );
  }

  const ofertaMatch = companyOffers.find(
    (o) => o.id_especialidad === r.id_especialidad && o.plazas_disponibles > 0,
  );
  if (!ofertaMatch)
    return (
      <span className="text-xs text-muted">Sin plazas disponibles</span>
    );

  // The company chooses beca or contrato when booking (beca → Anexo III, else Anexo II).
  return (
    <>
      <ReservarDialog
        open={showReserveModal}
        nombre={r.nombre}
        onClose={() => setShowReserveModal(false)}
        onConfirm={async (idTipoContrato) => {
          await onReserve(
            r.id_solicitud_alumno,
            ofertaMatch.id_solicitud_empresa_especialidad,
            idTipoContrato,
          );
          setShowReserveModal(false);
        }}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowReserveModal(true);
        }}
        className="btn btn-outline-brand btn-sm"
      >
        Reservar alumno
      </button>
    </>
  );
};

// Expandable student card used in the linking view
const StudentCard = ({
  r,
  isExpanded,
  onToggle,
  companyOffers,
  onReserve,
  onCancel,
  onAdminReserve,
  onChanged,
  onValidarAlumno,
  onRechazarSolicitud,
  onReabrirSolicitud,
  user,
}) => {
  const isEmpresa = user?.rol === "EMPRESA";
  const confirmedReserva = r.reservas?.find((rv) =>
    isConfirmedReserva(rv.estado_reserva),
  );
  const referencia = reservaDeReferencia(r.reservas);
  // "info" or "reservas" — inner tab state, staff only
  const [innerTab, setInnerTab] = useState("info");
  const [editSignal, setEditSignal] = useState(0);
  const [editingAlumno, setEditingAlumno] = useState(false);
  const isAdmin = user?.rol === "ADMINISTRADOR";
  const handleToggle = () => onToggle(r.id_solicitud_alumno);

  return (
    <div className={cardClass}>
      {/* Card header — always visible, toggles the expanded panel */}
      <div className={cardHeaderGrid} onClick={handleToggle}>
        <div className={cardHeaderName}>
          <p className={`${cardNameClass} break-words`}>
            <LongText>{r.nombre}</LongText>{" "}
            <span className="whitespace-nowrap text-xs font-normal text-muted">
              ({r.dni})
            </span>
          </p>
          {r.especialidad && (
            <p className={`${cardEspClass} break-words text-sm text-muted`}>
              <LongText>{r.especialidad}</LongText>
              {r.turno && r.turno !== "DIURNO" && ` · ${r.turno}`}
            </p>
          )}
        </div>

        {/* In reading order: the application, then its confirmed reservation
            and that reservation's documents, then other reservations. */}
        <div className={cardHeaderBadges}>
          {!isEmpresa ? (
            <>
              {r.id_cambio_pendiente ? (
                <span className={`${signedBadgeClass} max-w-full bg-amber-100 text-amber-800`}>
                  <FaHourglassHalf className="text-sm" />
                  Cambios pendientes
                </span>
              ) : null}
              <EstadoBadge kind="solicitud" value={r.estado_validacion} />
              {/* The reservation and its document icons stay together. */}
              {(confirmedReserva || referencia) && (
                <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
                  {confirmedReserva && (
                    <StatusBadge variant="success">Confirmada: {confirmedReserva.empresa}</StatusBadge>
                  )}
                  {referencia && (
                    <ReservaResumenBadges
                      compact
                      estado={referencia.estado_reserva}
                      resumen={referencia.documentos_resumen}
                      showEstado={false}
                    />
                  )}
                </span>
              )}

              <ReservasChips reservas={r.reservas} excludeId={confirmedReserva?.id_reserva} />
            </>
          ) : (
            <ReservaButton
              r={r}
              companyOffers={companyOffers}
              onReserve={onReserve}
              onCancel={onCancel}
            />
          )}
        </div>

        <div className={cardHeaderActions}>
          <CardActions
            nombre={r.nombre}
            expanded={isExpanded}
            onToggle={handleToggle}
            onEdit={isAdmin && r.convocatoria_activa && !editingAlumno ? () => setEditSignal((v) => v + 1) : null}
          />
        </div>
      </div>

      {/* Expandable details panel */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className={cardBodyClass}>
            {/* Inner tab navigation — staff only */}
            {!isEmpresa && (
              <div className="flex gap-1 mb-5" role="tablist" aria-label="Secciones del alumno">
                <button
                  type="button"
                  role="tab"
                  aria-selected={innerTab === "info"}
                  onClick={() => setInnerTab("info")}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                    innerTab === "info"
                      ? "border-brand-600 text-brand-700"
                      : "border-transparent text-muted hover:text-charcoal-700"
                  }`}
                >
                  Información
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={innerTab === "reservas"}
                  onClick={() => setInnerTab("reservas")}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                    innerTab === "reservas"
                      ? "border-brand-600 text-brand-700"
                      : "border-transparent text-muted hover:text-charcoal-700"
                  }`}
                >
                  Reservas
                  {r.reservas?.length > 0 && (
                    <span className="ml-1.5 text-xs bg-surface-200 text-muted rounded-full px-1.5 py-0.5 leading-none">
                      {r.reservas.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={innerTab === "cuenta"}
                  onClick={() => setInnerTab("cuenta")}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                    innerTab === "cuenta"
                      ? "border-brand-600 text-brand-700"
                      : "border-transparent text-muted hover:text-charcoal-700"
                  }`}
                >
                  Cuenta
                </button>
              </div>
            )}

            {/* Account tab — staff only: portal access, password reset and baja */}
            {!isEmpresa && innerTab === "cuenta" && (
              <CuentaPanel
                tipo="alumno"
                idSolicitud={r.id_solicitud_alumno}
                s={r}
                usuario={r.dni}
                idUsuario={r.id_usuario}
                cuentaActiva={r.cuenta_activa}
                nombre={r.nombre}
                isAdmin={user?.rol === "ADMINISTRADOR"}
                onChanged={onChanged}
              />
            )}

            {/* Information tab */}
            {/* Pending change request (Información tab) and the edit dialog, which
                the header pencil opens without expanding the card. */}
            {isAdmin && (r.id_cambio_pendiente || r.convocatoria_activa) && (
              <div className={innerTab === "info" && isExpanded && r.id_cambio_pendiente ? "mb-5" : ""}>
                <AlumnoDatosActions
                  r={r}
                  onUpdated={onChanged}
                  editSignal={editSignal}
                  onEditHandled={() => setEditSignal(0)}
                  onEditingChange={setEditingAlumno}
                  mostrarPendiente={innerTab === "info" && isExpanded}
                />
              </div>
            )}

            {(isEmpresa || innerTab === "info") && (
              <div
                className={`grid grid-cols-1 gap-6 ${isEmpresa ? "md:grid-cols-2" : "md:grid-cols-[1.2fr_1fr]"}`}
              >
                <div className="space-y-5">
                  <DatosRapidos r={r} />
                  {!isEmpresa && (
                    <EstadoSolicitud
                      r={r}
                      onValidar={onValidarAlumno}
                      onRechazar={onRechazarSolicitud}
                      onReabrir={onReabrirSolicitud}
                    />
                  )}
                </div>
                <div className="space-y-5">
                  <Documentos r={r} user={user} onRefresh={onChanged} />
                </div>
              </div>
            )}

            {/* Reservations tab — staff only */}
            {!isEmpresa && innerTab === "reservas" && (
              <EmpresaControl r={r} onAdminReserve={onAdminReserve} onChanged={onChanged} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentCard;
