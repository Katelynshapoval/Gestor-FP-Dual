import { IoMdArrowDropdown } from "react-icons/io";
import { FaRegCalendarCheck } from "react-icons/fa6";
import { MdOutlineCancel } from "react-icons/md";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { RxLockClosed } from "react-icons/rx";

import {
  cardBodyClass,
  cardChipsClass,
  cardClass,
  cardEspClass,
  cardHeaderClass,
  cardNameClass,
  empresaChipClass,
  sectionLabelClass,
  signedBadgeClass,
  toggleBtnClass,
} from "../../../components/ui/cardStyles";
import { getEmpresaIcon, getEmpresaTooltip } from "../utils/empresaEstado";

import DatosRapidos from "./student-card/DatosRapidos";
import Documentos from "./student-card/Documentos";
import EmpresaControl from "./student-card/EmpresaControl";
import Evaluacion from "./student-card/Evaluacion";

// Badge para el estado A2/A3 y calendario (vista admin/tutor)
const StatusBadge = ({ ok, icon: Icon, label }) => (
  <span
    className={`${signedBadgeClass} ${
      ok ? "bg-green-500/20 text-green-900" : "bg-red-500/10 text-red-900"
    }`}
  >
    <Icon className="-mt-[1px] text-[13px]" />
    {label}
  </span>
);

// Botón de reserva con los tres estados posibles para empresa:
//  1. alumno asignado definitivamente (bloqueado)
//  2. reservado por esta empresa (cancelar)
//  3. disponible (reservar)
const ReservaButton = ({ r, onReserve, onUnreserve }) => {
  const asignadoDefinitivo = r.anexo2FirmadoRecibido || r.anexo3FirmadoRecibido;

  if (asignadoDefinitivo) {
    return (
      <span className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-400">
        <RxLockClosed className="shrink-0" />
        Ya asignado
      </span>
    );
  }

  if (r.miReserva) {
    return (
      <div className="flex items-center gap-2">
        {r.totalReservas > 1 && (
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
            {r.totalReservas} interesadas
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnreserve(r.idGestion);
          }}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 transition-all duration-200 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
        >
          Cancelar reserva
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onReserve(r.idGestion);
      }}
      className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm text-red-600 transition-all duration-200 ease-out hover:border-red-300 hover:bg-red-50 hover:text-red-700"
    >
      Reservar alumno
    </button>
  );
};

// Tarjeta de alumno con cabecera compacta y panel expandible
const StudentCard = ({
  r,
  isExpanded,
  onToggle,
  companyRequests,
  sendingInfo,
  canSendInfo,
  onAssign,
  onSendInfo,
  onCompanyChange,
  onGetDoc,
  onGetAnexo,
  onGetEvaluation,
  onReserve,
  onUnreserve,
  user,
}) => {
  const isEmpresa = user?.user_type === "empresa";
  const empresaProps = {
    r,
    companyRequests,
    onAssign,
    onSendInfo,
    onCompanyChange,
    sendingInfo,
    canSendInfo,
  };

  const handleToggle = () => onToggle(r.idGestion);

  return (
    <div className={cardClass}>
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

          {r.nombreEsp && (
            <p className={`${cardEspClass} text-sm text-muted`}>
              {r.nombreEsp}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          {!isEmpresa ? (
            <div className={cardChipsClass}>
              <StatusBadge
                ok={r.anexo2FirmadoRecibido || r.anexo3FirmadoRecibido}
                icon={
                  r.anexo2FirmadoRecibido || r.anexo3FirmadoRecibido
                    ? IoIosCheckmarkCircleOutline
                    : MdOutlineCancel
                }
                label="A2/A3"
              />

              <StatusBadge
                ok={r.calendarioComprobado}
                icon={FaRegCalendarCheck}
                label="Cal"
              />

              {[1, 2, 3].map((slot) => {
                const em = r[`em${slot}`];
                const estid = r[`estid${slot}`];
                if (!em) return null;

                return (
                  <span
                    key={slot}
                    className={empresaChipClass}
                    title={getEmpresaTooltip(estid)}
                  >
                    E{slot}: {em} {getEmpresaIcon(estid)}
                  </span>
                );
              })}
            </div>
          ) : (
            <ReservaButton
              r={r}
              onReserve={onReserve}
              onUnreserve={onUnreserve}
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

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div
            className={`${cardBodyClass} grid grid-cols-1 gap-6 ${
              isEmpresa ? "md:grid-cols-2" : "md:grid-cols-[1.2fr_1fr]"
            }`}
          >
            <div className="space-y-5">
              {isEmpresa ? (
                <DatosRapidos r={r} />
              ) : (
                <div>
                  <p className={sectionLabelClass}>Empresas</p>
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3].map((slot) => (
                      <EmpresaControl key={slot} slot={slot} {...empresaProps} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-5">
              {!isEmpresa && <DatosRapidos r={r} />}

              <Documentos
                r={r}
                user={user}
                onGetDoc={onGetDoc}
                onGetAnexo={onGetAnexo}
              />

              <Evaluacion
                r={r}
                user={user}
                onGetEvaluation={onGetEvaluation}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentCard;
