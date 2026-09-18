import { FaRegCalendarCheck } from "react-icons/fa6";
import {
  IoIosCheckmarkCircleOutline,
  IoIosCloseCircleOutline,
} from "react-icons/io";
import { sectionLabelClass } from "../../../../components/ui/cardStyles";
import { isConfirmedReserva } from "../../../../utils/reservaEstados.js";
import StatusBadge from "../../../../components/ui/StatusBadge";

const DOC_BADGE = {
  PENDIENTE: { label: "Pendiente", variant: "warning" },
  VALIDADO: { label: "Validado", variant: "success" },
  RECHAZADO: { label: "Rechazado", variant: "danger" },
};

const badgeFor = (estado) => DOC_BADGE[estado] || { label: "Sin documento", variant: "neutral" };

const DocRow = ({ title, id, tipo, estado, motivo, nombreAlumno, idSolicitudAlumno, onGetDoc }) => {
  const badge = badgeFor(estado);
  return (
    <div className="space-y-2 rounded-lg border border-surface-200 bg-surface-50/60 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-charcoal-950">{title}</p>
        <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
      </div>
      {estado === "RECHAZADO" && (
        <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs leading-5 text-red-800">
          <span className="font-semibold">Motivo:</span> {motivo || "Sin motivo indicado."}
        </p>
      )}
      {id ? (
        <button
          type="button"
          onClick={() =>
            onGetDoc(id, tipo, nombreAlumno, {
              idSolicitudAlumno,
              estado,
              motivo,
            })
          }
          className="btn btn-secondary btn-sm w-full sm:w-auto"
        >
          Ver {title}
        </button>
      ) : (
        <p className="text-xs text-muted">Todavía no hay un archivo subido.</p>
      )}
    </div>
  );
};

const Documentos = ({ r, user, onGetDoc }) => {
  const isEmpresa = user?.rol === "EMPRESA";
  const calOk = r.reservas?.some((rv) => isConfirmedReserva(rv.estado_reserva));

  if (isEmpresa) {
    return (
      <div>
        <p className={sectionLabelClass}>Documentos</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {r.cv_id ? (
            <button
              type="button"
              onClick={() => onGetDoc(r.cv_id, "cv", r.nombre, { idSolicitudAlumno: r.id_solicitud_alumno, estado: r.cv_estado, motivo: r.cv_motivo })}
              className="btn btn-secondary btn-sm flex w-full items-center justify-center gap-1 sm:w-auto"
            >
              CV
            </button>
          ) : (
            <span className="btn btn-secondary btn-sm flex w-full items-center justify-center gap-1 sm:w-auto opacity-40 cursor-default">
              CV
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          {calOk ? (
            <>
              <IoIosCheckmarkCircleOutline className="text-green-600 shrink-0" />
              <span className="text-green-700">Calendario confirmado</span>
            </>
          ) : (
            <>
              <IoIosCloseCircleOutline className="text-red-400 shrink-0" />
              <span className="text-gray-400">Sin confirmación de calendario</span>
            </>
          )}
          <FaRegCalendarCheck className={`ml-auto ${calOk ? "text-green-500" : "text-gray-300"}`} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-sm:border-t max-sm:border-surface-200 max-sm:pt-4">
      <p className={sectionLabelClass}>Documentos</p>
      <div className="space-y-3">
        <DocRow
          title="CV"
          id={r.cv_id}
          tipo="cv"
          estado={r.cv_estado}
          motivo={r.cv_motivo}
          nombreAlumno={r.nombre}
          idSolicitudAlumno={r.id_solicitud_alumno}
          onGetDoc={onGetDoc}
        />
        <DocRow
          title="Anexo 2"
          id={r.anexo2_id}
          tipo="anexo2"
          estado={r.anexo2_estado}
          motivo={r.anexo2_motivo}
          nombreAlumno={r.nombre}
          idSolicitudAlumno={r.id_solicitud_alumno}
          onGetDoc={onGetDoc}
        />
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs">
        {calOk ? (
          <>
            <IoIosCheckmarkCircleOutline className="text-green-600 shrink-0" />
            <span className="text-green-700">Calendario confirmado</span>
          </>
        ) : (
          <>
            <IoIosCloseCircleOutline className="text-red-400 shrink-0" />
            <span className="text-gray-400">Sin confirmación de calendario</span>
          </>
        )}
        <FaRegCalendarCheck className={`ml-auto ${calOk ? "text-green-500" : "text-gray-300"}`} />
      </div>
    </div>
  );
};

export default Documentos;
