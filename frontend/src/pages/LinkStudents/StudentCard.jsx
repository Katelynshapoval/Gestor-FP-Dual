import EmpresaControl, {
  getEmpresaIcon,
  getEmpresaTooltip,
} from "./EmpresaControl.jsx";

import { RxCheck, RxCross2 } from "react-icons/rx";
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
}) => {
  const props = {
    r,
    isExpanded,
    companyRequests,
    onAssign,
    onSendInfo,
    onCompanyChange,
    sendingInfo,
    canSendInfo,
  };

  return (
    <div className="student-card">
      <div
        className="student-card-header"
        onClick={() => onToggle(r.idGestion)}
      >
        <div>
          <p className="student-name">
            {r.nombre}{" "}
            <span className="font-normal text-[.8rem] text-[var(--text-muted)]">
              ({r.dni})
            </span>
          </p>
          {r.nombreEsp && <p className="student-esp">{r.nombreEsp}</p>}
        </div>

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
            className={`signed-badge mr-4 ${
              !r.calendarioComprobado
                ? "bg-red-500/10 text-red-900"
                : "bg-green-500/20 text-green-900"
            }`}
          >
            <FaRegCalendarCheck className={`text-xs -mt-[1px] `} />
            Cal
            {/* {r.calendarioComprobado ? (
              <RxCheck className="status-icon text-green-600" />
            ) : (
              <RxCross2 className="status-icon text-red-600" />
            )} */}
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

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out
  ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="student-card-body grid grid-cols-[1.2fr_1fr] gap-6">
            {/* LEFT COLUMN — EMPRESAS */}
            <div>
              <p className="section-label  ">Empresas</p>

              <div className="empresa-grid flex flex-col gap-3">
                {[1, 2, 3].map((slot) => (
                  <EmpresaControl key={slot} slot={slot} {...props} />
                ))}
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-5">
              {/* DATOS RÁPIDOS */}
              <div>
                <p className="section-label ">Datos rápidos</p>

                <div className="grid grid-cols-2 gap-y-1 gap-x-6 text-sm">
                  <div className="contact-item">
                    <span>Email: </span>
                    {r.email || "—"}
                  </div>

                  <div className="contact-item">
                    <span>Teléfono: </span>
                    {r.telalumno || "—"}
                  </div>

                  <div className="contact-item flex items-center gap-1">
                    <span>Carnet:</span>
                    {r.carnetDeConducir ? (
                      <RxCheck className="status-icon text-green-600" />
                    ) : (
                      <RxCross2 className="status-icon text-red-600" />
                    )}
                  </div>

                  <div className="contact-item flex items-center gap-1">
                    <span>Vehículo:</span>
                    {r.tieneCoche ? (
                      <RxCheck className="status-icon text-green-600" />
                    ) : (
                      <RxCross2 className="status-icon text-red-600" />
                    )}
                  </div>
                </div>
              </div>

              {/* DOCUMENTOS */}
              <div className="border-t pt-4">
                <p className="section-label ">Documentos</p>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onGetDoc(r.idGestion, "cv")}
                    className="btn btn-secondary btn-sm flex items-center gap-1"
                  >
                    CV
                  </button>

                  <button
                    onClick={() => onGetAnexo(r)}
                    className="btn btn-secondary btn-sm flex items-center gap-1"
                  >
                    Anexo 2/3
                  </button>

                  <button
                    onClick={() => onGetDoc(r.idGestion, "calendario")}
                    className="btn btn-secondary btn-sm flex items-center gap-1"
                  >
                    Calendario
                  </button>
                </div>
              </div>

              {/* EVALUACIÓN */}
              <div className="border-t pt-4">
                <p className="section-label ">Evaluación</p>

                <div className="flex items-center justify-between">
                  <p className="text-[1.3rem] font-bold text-[var(--brand)]">
                    {r.notaTotal ? r.notaTotal.toFixed(2) : "—"}
                  </p>

                  <button
                    onClick={() => onGetEvaluation(r.idGestion)}
                    className="btn btn-outline-brand btn-sm"
                  >
                    {r.idEvaluacion !== null ? "Ver evaluación" : "Evaluar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentCard;
