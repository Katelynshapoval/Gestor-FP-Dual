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
          <div className="student-card-body">
            {/* Grid de empresas */}
            <div className="empresas-grid">
              {[1, 2, 3].map((slot) => (
                <EmpresaControl key={slot} slot={slot} {...props} />
              ))}
            </div>
            {/* Datos de contacto */}
            <div className="grid grid-cols-2 gap-y-1 gap-x-6 mb-4">
              <div className="contact-item">
                <span>Email: </span>
                {r.email || "—"}
              </div>
              <div className="contact-item">
                <span>Teléfono: </span>
                {r.telalumno || "—"}
              </div>
              <div className="contact-item">
                <span>Carnet conducir: </span>
                {r.carnetDeConducir ? (
                  <RxCheck className="status-icon text-green-600" />
                ) : (
                  <RxCross2 className="status-icon text-red-600" />
                )}
              </div>
              <div className="contact-item">
                <span>Vehículo: </span>
                {r.tieneCoche ? (
                  <RxCheck className="status-icon text-green-600" />
                ) : (
                  <RxCross2 className="status-icon text-red-600" />
                )}
              </div>
            </div>
            {/* Documentos, evaluación y nota */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div>
                <p className="docs-label">Documentos</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => onGetDoc(r.idGestion, "cv")}
                    className="btn btn-secondary btn-sm"
                  >
                    CV
                  </button>
                  <button
                    onClick={() => onGetAnexo(r)}
                    className="btn btn-secondary btn-sm"
                  >
                    Anexo 2/3
                  </button>
                  <button
                    onClick={() => onGetDoc(r.idGestion, "calendario")}
                    className="btn btn-secondary btn-sm"
                  >
                    Calendario
                  </button>
                </div>
              </div>
              <div>
                <p className="docs-label">Evaluación</p>
                <button
                  onClick={() => onGetEvaluation(r.idGestion)}
                  className="btn btn-outline-brand btn-sm"
                >
                  {r.idEvaluacion !== null ? "Ver evaluación" : "Evaluar"}
                </button>
              </div>
              <div>
                <p className="docs-label">Nota total</p>
                <p className="text-[1.3rem] font-bold m-0 text-[var(--brand)]">
                  {r.notaTotal ? r.notaTotal.toFixed(2) : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentCard;
