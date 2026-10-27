import { useState } from "react";
import { IoMdArrowDropdown } from "react-icons/io";
import { MdOutlineCancel } from "react-icons/md";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { RxLockClosed, RxClock } from "react-icons/rx";

import {
  cardBodyClass,
  cardChipsClass,
  cardClass,
  cardEspClass,
  cardHeaderClass,
  cardNameClass,
  empresaChipClass,
  toggleBtnClass,
} from "../../../components/ui/cardStyles";

import DatosRapidos from "./student-card/DatosRapidos";
import Documentos from "./student-card/Documentos";
import EmpresaControl from "./student-card/EmpresaControl";
import EstadoSolicitud from "./student-card/EstadoSolicitud";
import StatusBadge from "../../../components/ui/StatusBadge";
import EstadoBadge from "../../../components/ui/EstadoBadge.jsx";
import MotivoDialog from "../../../components/ui/MotivoDialog.jsx";
import ReservaResumenBadges from "../../../components/reservas/ReservaResumenBadges.jsx";
import { label } from "../../../utils/labels.js";
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

// Compact chips showing which companies have reserved this student (with status icons)
const ReservasChips = ({ reservas }) => {
  if (!reservas || reservas.length === 0) return null;
  return (
    <>
      {reservas.slice(0, 3).map((rv) => (
        <span
          key={rv.id_reserva}
          className={empresaChipClass}
          title={label("reserva", rv.estado_reserva)}
        >
          {isConfirmedReserva(rv.estado_reserva) && (
            <IoIosCheckmarkCircleOutline className="text-green-600 text-[11px]" />
          )}
          {isPendingReserva(rv.estado_reserva) && (
            <RxClock className="text-yellow-600 text-[11px]" />
          )}
          {isCancelledReserva(rv.estado_reserva) && (
            <MdOutlineCancel className="text-red-500 text-[11px]" />
          )}
          {rv.empresa?.substring(0, 14)}
        </span>
      ))}
    </>
  );
};

// Reserve / cancel button for empresa users
const ReservaButton = ({ r, companyOffers, onReserve, onCancel }) => {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const reservaConfirmada = r.reservas?.some((rv) =>
    isConfirmedReserva(rv.estado_reserva),
  );

  if (reservaConfirmada || r.asignado_definitivo) {
    return (
      <span className="flex items-center gap-1.5 rounded-lg border border-surface-200 bg-surface-50 px-3 py-1.5 text-xs font-medium text-muted">
        <RxLockClosed className="shrink-0" aria-hidden="true" />
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

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onReserve(
          r.id_solicitud_alumno,
          ofertaMatch.id_solicitud_empresa_especialidad,
        );
      }}
      className="btn btn-primary btn-sm"
    >
      Reservar alumno
    </button>
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
  const handleToggle = () => onToggle(r.id_solicitud_alumno);

  return (
    <div className={cardClass}>
      {/* Card header — always visible, toggles the expanded panel */}
      <div
        className={`${cardHeaderClass} flex flex-col gap-2 sm:flex-row sm:items-center`}
        onClick={handleToggle}
      >
        <div className="min-w-0 flex-1">
          <p className={cardNameClass}>
            {r.nombre}{" "}
            <span className="text-[.8rem] font-normal text-muted">
              ({r.dni})
            </span>
          </p>
          {r.especialidad && (
            <p className={`${cardEspClass} text-sm text-muted`}>
              {r.especialidad}
              {r.turno && r.turno !== "DIURNO" && ` · ${r.turno}`}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          {!isEmpresa ? (
            <div className={cardChipsClass}>
              <EstadoBadge kind="solicitud" value={r.estado_validacion} />
              {Number(r.tiene_cuenta) === 1 && (
                <StatusBadge variant="info">Cuenta</StatusBadge>
              )}
              {confirmedReserva && (
                <StatusBadge variant="success">
                  Confirmada: {confirmedReserva.empresa}
                </StatusBadge>
              )}
              {referencia && (
                <ReservaResumenBadges
                  estado={referencia.estado_reserva}
                  resumen={referencia.documentos_resumen}
                  showEstado={false}
                />
              )}

              <ReservasChips reservas={r.reservas} />
            </div>
          ) : (
            <ReservaButton
              r={r}
              companyOffers={companyOffers}
              onReserve={onReserve}
              onCancel={onCancel}
            />
          )}

          <button
            type="button"
            className={`${toggleBtnClass} ${isExpanded ? "rotate-180" : ""}`}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Ocultar" : "Ver"} detalle de ${r.nombre}`}
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
          >
            <IoMdArrowDropdown className="text-[1.5rem]" aria-hidden="true" />
          </button>
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
                      ? "border-brand-500 text-brand-500"
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
                      ? "border-brand-500 text-brand-500"
                      : "border-transparent text-muted hover:text-charcoal-700"
                  }`}
                >
                  Reservas
                  {r.reservas?.length > 0 && (
                    <span className="ml-1.5 text-[0.65rem] bg-surface-200 text-muted rounded-full px-1.5 py-0.5 leading-none">
                      {r.reservas.length}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Information tab */}
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
