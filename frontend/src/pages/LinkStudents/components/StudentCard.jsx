import { useState } from "react";
import { IoMdArrowDropdown } from "react-icons/io";
import { FaRegCalendarCheck } from "react-icons/fa6";
import { MdOutlineCancel } from "react-icons/md";
import {
  IoIosCheckmarkCircleOutline,
  IoIosCloseCircleOutline,
} from "react-icons/io";
import { RxLockClosed, RxClock } from "react-icons/rx";

import {
  cardBodyClass,
  cardChipsClass,
  cardClass,
  cardEspClass,
  cardHeaderClass,
  cardNameClass,
  empresaChipClass,
  signedBadgeClass,
  toggleBtnClass,
} from "../../../components/ui/cardStyles";

import DatosRapidos from "./student-card/DatosRapidos";
import Documentos from "./student-card/Documentos";
import EmpresaControl from "./student-card/EmpresaControl";
import Evaluacion from "./student-card/Evaluacion";

// A2/A3 badge: green when the student has at least one confirmed reservation
const AnexoBadge = ({ reservas }) => {
  const confirmed = reservas?.some((rv) => rv.estado_reserva === "CONFIRMADA");
  const Icon = confirmed
    ? IoIosCheckmarkCircleOutline
    : IoIosCloseCircleOutline;
  return (
    <span
      className={`${signedBadgeClass} ${confirmed ? "bg-green-500/20 text-green-900" : "bg-red-500/10 text-red-900"}`}
    >
      <Icon className="-mt-[1px] text-[13px]" />
      A2/A3
    </span>
  );
};

// Compact chips showing which companies have reserved this student (with status icons)
const ReservasChips = ({ reservas }) => {
  if (!reservas || reservas.length === 0) return null;
  return (
    <>
      {reservas.slice(0, 3).map((rv) => (
        <span
          key={rv.id_reserva}
          className={empresaChipClass}
          title={rv.estado_reserva}
        >
          {rv.estado_reserva === "CONFIRMADA" && (
            <IoIosCheckmarkCircleOutline className="text-green-600 text-[11px]" />
          )}
          {(rv.estado_reserva === "PENDIENTE" ||
            rv.estado_reserva === "RESERVADA") && (
            <RxClock className="text-yellow-600 text-[11px]" />
          )}
          {rv.estado_reserva === "CANCELADA" && (
            <MdOutlineCancel className="text-red-500 text-[11px]" />
          )}
          {rv.empresa?.substring(0, 14)}
        </span>
      ))}
    </>
  );
};

// Cancellation modal shown to the empresa before a reservation is cancelled
const CancelModal = ({ alumno, onConfirm, onClose }) => {
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!motivo.trim()) return;
    setSubmitting(true);
    await onConfirm(motivo.trim());
    setSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-md space-y-4 rounded-xl2 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900">Cancelar reserva</h3>
        <p className="text-sm text-gray-500">
          Indica el motivo de cancelación para <strong>{alumno}</strong>.
        </p>
        <textarea
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
          rows={3}
          placeholder="Motivo de cancelación…"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={255}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!motivo.trim() || submitting}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150 ${
              !motivo.trim() || submitting
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-red-500 text-white hover:bg-red-600"
            }`}
          >
            {submitting ? "Cancelando…" : "Confirmar cancelación"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Reserve / cancel button for empresa users
const ReservaButton = ({ r, companyOffers, onReserve, onCancel }) => {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const reservaConfirmada = r.reservas?.some(
    (rv) => rv.estado_reserva === "CONFIRMADA",
  );

  if (reservaConfirmada || r.asignado_definitivo) {
    return (
      <span className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-400">
        <RxLockClosed className="shrink-0" />
        Ya asignado
      </span>
    );
  }

  const miReservaId = r.mi_reserva_id;
  if (miReservaId) {
    return (
      <>
        {showCancelModal && (
          <CancelModal
            alumno={r.nombre || "este alumno"}
            onConfirm={async (motivo) => {
              await onCancel(miReservaId, motivo);
              setShowCancelModal(false);
            }}
            onClose={() => setShowCancelModal(false)}
          />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowCancelModal(true);
          }}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 transition-colors duration-150 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
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
      <span className="text-xs text-gray-400">Sin plazas disponibles</span>
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
      className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-600 transition-colors duration-150 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
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
  onGetDoc,
  onGetEvaluation,
  onReserve,
  onCancel,
  user,
}) => {
  const isEmpresa = user?.rol === "EMPRESA";
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
              <AnexoBadge reservas={r.reservas} />

              {/* Calendar badge: green when the student has a confirmed reservation */}
              {(() => {
                const calOk = r.reservas?.some(
                  (rv) => rv.estado_reserva === "CONFIRMADA",
                );
                const CalIcon = calOk
                  ? FaRegCalendarCheck
                  : IoIosCloseCircleOutline;
                return (
                  <span
                    className={`${signedBadgeClass} ${calOk ? "bg-green-500/20 text-green-900" : "bg-red-500/10 text-red-900"}`}
                  >
                    <CalIcon className="-mt-[1px] text-[13px]" />
                    Cal
                  </span>
                );
              })()}

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
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
          >
            <IoMdArrowDropdown className="text-[1.5rem]" />
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
              <div className="flex gap-1 mb-5">
                <button
                  type="button"
                  onClick={() => setInnerTab("info")}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                    innerTab === "info"
                      ? "border-brand-500 text-brand-500"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Información
                </button>
                <button
                  type="button"
                  onClick={() => setInnerTab("reservas")}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                    innerTab === "reservas"
                      ? "border-brand-500 text-brand-500"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Reservas
                  {r.reservas?.length > 0 && (
                    <span className="ml-1.5 text-[0.65rem] bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 leading-none">
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
                </div>
                <div className="space-y-5">
                  <Documentos r={r} user={user} onGetDoc={onGetDoc} />
                  <Evaluacion
                    r={r}
                    user={user}
                    onGetEvaluation={onGetEvaluation}
                  />
                </div>
              </div>
            )}

            {/* Reservations tab — staff only */}
            {!isEmpresa && innerTab === "reservas" && <EmpresaControl r={r} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentCard;
