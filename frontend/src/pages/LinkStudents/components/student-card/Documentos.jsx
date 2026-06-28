import { FaRegCalendarCheck } from "react-icons/fa6";
import {
  IoIosCheckmarkCircleOutline,
  IoIosCloseCircleOutline,
} from "react-icons/io";
import { sectionLabelClass } from "../../../../components/ui/cardStyles";

// Document section shown in the student card (CV + Anexo 2 + calendar confirmation status)
const Documentos = ({ r, user, onGetDoc }) => {
  const isEmpresa = user?.rol === "EMPRESA";
  const calOk = r.reservas?.some((rv) => rv.estado_reserva === "CONFIRMADA");

  const DocBtn = ({ label, id, tipo }) =>
    id ? (
      <button
        onClick={() => onGetDoc(id, tipo, r.nombre)}
        className="btn btn-secondary btn-sm flex w-full items-center justify-center gap-1 sm:w-auto"
      >
        {label}
      </button>
    ) : (
      <span className="btn btn-secondary btn-sm flex w-full items-center justify-center gap-1 sm:w-auto opacity-40 cursor-default">
        {label}
      </span>
    );

  return (
    <div
      className={
        !isEmpresa
          ? "max-sm:border-t max-sm:border-surface-200 max-sm:pt-4"
          : ""
      }
    >
      <p className={sectionLabelClass}>Documentos</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <DocBtn label="CV" id={r.cv_id} tipo="cv" />
        {!isEmpresa && (
          <DocBtn label="Anexo 2" id={r.anexo2_id} tipo="anexo2" />
        )}
      </div>
      {/* Calendar indicator: reflects whether the student has a confirmed reservation */}
      <div className="mt-3 flex items-center gap-1.5 text-xs">
        {calOk ? (
          <>
            <IoIosCheckmarkCircleOutline className="text-green-600 shrink-0" />
            <span className="text-green-700">Calendario confirmado</span>
          </>
        ) : (
          <>
            <IoIosCloseCircleOutline className="text-red-400 shrink-0" />
            <span className="text-gray-400">
              Sin confirmación de calendario
            </span>
          </>
        )}
        <FaRegCalendarCheck
          className={`ml-auto ${calOk ? "text-green-500" : "text-gray-300"}`}
        />
      </div>
    </div>
  );
};

export default Documentos;
