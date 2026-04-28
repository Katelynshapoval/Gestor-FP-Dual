import EmpresaControl, {
  getEmpresaIcon,
  getEmpresaTooltip,
} from "./StudentCardComponents/EmpresaControl.jsx";

import DatosRapidos from "./StudentCardComponents/DatosRapidos.jsx";
import Documentos from "./StudentCardComponents/Documentos.jsx";
import Evaluacion from "./StudentCardComponents/Evaluacion.jsx";

import { IoMdArrowDropdown } from "react-icons/io";
import { FaRegCalendarCheck } from "react-icons/fa6";
import { MdOutlineCancel } from "react-icons/md";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";

// Tarjeta de alumno con cabecera compacta y panel de detalle expandible.
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
  user,
}) => {
  const props = {
    r,
    companyRequests,
    onAssign,
    onSendInfo,
    onCompanyChange,
    sendingInfo,
    canSendInfo,
  };

  const isEmpresa = user?.user_type === "empresa";

  return (
    <div className={`student-card`}>
      <div
        className="student-card-header flex flex-col gap-2 sm:flex-row sm:items-center"
        onClick={() => {
          onToggle(r.idGestion);
        }}
      >
        {/* LEFT SIDE */}
        <div className="flex-1 min-w-0">
          <p className="student-name">
            {r.nombre}{" "}
            <span className="font-normal text-[.8rem] text-[var(--text-muted)]">
              ({r.dni})
            </span>
          </p>

          {r.nombreEsp && (
            <p className="student-esp text-sm text-[var(--text-muted)]">
              {r.nombreEsp}
            </p>
          )}
        </div>

        {/* RIGHT SIDE */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {!isEmpresa ? (
            <div className="student-chips">
              <span
                className={`signed-badge ${
                  !r.anexo2FirmadoRecibido || !r.anexo3FirmadoRecibido
                    ? "bg-red-500/10 text-red-900"
                    : "bg-green-500/20 text-green-900"
                }`}
              >
                {r.anexo2FirmadoRecibido || r.anexo3FirmadoRecibido ? (
                  <IoIosCheckmarkCircleOutline className="-mt-[1px] text-[13px]" />
                ) : (
                  <MdOutlineCancel className="-mt-[1px] text-[13px]" />
                )}
                A2/A3
              </span>

              <span
                className={`signed-badge ${
                  !r.calendarioComprobado
                    ? "bg-red-500/10 text-red-900"
                    : "bg-green-500/20 text-green-900"
                }`}
              >
                <FaRegCalendarCheck className="text-xs -mt-[1px]" />
                Cal
              </span>

              {[1, 2, 3].map((slot) => {
                const em = r[`em${slot}`];
                const estid = r[`estid${slot}`];
                return em ? (
                  <span
                    key={slot}
                    className="empresa-chip"
                    title={getEmpresaTooltip(estid)}
                  >
                    E{slot}: {em} {getEmpresaIcon(estid)}
                  </span>
                ) : null;
              })}
            </div>
          ) : (
            <button
              className="text-sm px-4 py-2 rounded-xl
                  border transition-all duration-200 ease-out border-red-200 text-red-600 bg-white hover:bg-red-50 hover:border-red-300 hover:text-red-700"
            >
              Reservar alumno
            </button>
          )}

          {/* DROPDOWN */}
          <button
            className={`toggle-btn ${isExpanded ? "rotate-180" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(r.idGestion);
            }}
          >
            <IoMdArrowDropdown className="text-[1.5rem]" />
          </button>
        </div>
      </div>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out
  ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div
            className={`student-card-body grid gap-6 grid-cols-1 ${
              isEmpresa ? "md:grid-cols-2" : "md:grid-cols-[1.2fr_1fr]"
            }`}
          >
            {/* LEFT COLUMN */}
            <div className="space-y-5">
              {!isEmpresa ? (
                <>
                  {/* EMPRESAS */}
                  <div>
                    <p className="section-label">Empresas</p>

                    <div className="empresa-grid flex flex-col gap-3">
                      {[1, 2, 3].map((slot) => (
                        <EmpresaControl key={slot} slot={slot} {...props} />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* DATOS RÁPIDOS (empresa view) */}
                  <DatosRapidos r={r} />
                </>
              )}
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-5">
              {!isEmpresa && (
                <>
                  {/* DATOS RÁPIDOS */}
                  <DatosRapidos r={r} />
                </>
              )}

              {/* DOCUMENTOS */}
              <Documentos
                r={r}
                user={user}
                onGetDoc={onGetDoc}
                onGetAnexo={onGetAnexo}
              />

              {/* EVALUACIÓN */}
              <Evaluacion r={r} user={user} onGetEvaluation={onGetEvaluation} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentCard;
