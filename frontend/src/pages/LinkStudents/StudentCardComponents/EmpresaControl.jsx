import {
  RxCheck,
  RxCross2,
  RxClock,
  RxPaperPlane,
  RxExclamationTriangle,
  RxMinus,
} from "react-icons/rx";

// Mapas de estilos y textos según el código de estado de empresa
const BADGE_CLASS = {
  0: "estado-0",
  1: "estado-1",
  2: "estado-2",
  3: "estado-3",
  4: "estado-4",
  5: "estado-5",
};
const ICON = {
  5: { icon: RxCheck, color: "text-green-600" }, // Finalizado / Aceptado
  3: { icon: RxCross2, color: "text-red-600" }, // Rechazado
  1: { icon: RxClock, color: "text-orange-500" }, // Asignado
  2: { icon: RxPaperPlane, color: "text-blue-600" }, // Información enviada
  4: { icon: RxExclamationTriangle, color: "text-yellow-600" }, // Pendiente
};
const TOOLTIP = {
  5: "Finalizado / Aceptado",
  3: "Rechazado",
  1: "Asignado (no finalizado)",
  2: "Información enviada",
  4: "Pendiente",
};

export const getEmpresaIcon = (estid) => {
  const item = ICON[estid];

  if (!item) {
    return <RxMinus className="status-icon text-gray-400" />;
  }

  const Icon = item.icon;
  return <Icon className={`status-icon ${item.color}`} />;
};

export const getEmpresaTooltip = (estid) => TOOLTIP[estid] ?? "Sin asignar";
export const getBadgeClass = (estid) => BADGE_CLASS[estid] ?? "estado-1";

// Badge de estado de empresa
export const EmpresaBadge = ({ estid, label }) => (
  <span
    className={`inline-block px-2.5 py-1 rounded-full text-[0.72rem] font-semibold tracking-wide ${getBadgeClass(estid)}`}
  >
    {label}
  </span>
);

// Selector de empresa filtrado por especialidad
export const EmpresaSelect = ({ label, defaultValue, onChange, options }) => (
  <div className="flex items-baseline gap-2 mt-2">
    <span className="text-xs font-semibold whitespace-nowrap text-muted">
      {label}
    </span>

    <select
      className="select-input text-[0.8rem] px-2 py-1"
      defaultValue={defaultValue}
      onChange={onChange}
    >
      <option value="">Selecciona empresa...</option>
      {options.map((cr) => (
        <option key={cr.idEmpresa} value={cr.idEmpresa}>
          {cr.empresa} (Disponibilidad: {cr.cantidad})
        </option>
      ))}
    </select>
  </div>
);

// Bloque completo para un slot de empresa: badge/selector, botones y observaciones
const EmpresaControl = ({
  slot,
  r,
  isExpanded,
  companyRequests,
  onAssign,
  onSendInfo,
  onCompanyChange,
  sendingInfo,
  canSendInfo,
}) => {
  const idEmpresa = r[`idEmpresa${slot}`];
  const em = r[`em${slot}`];
  const estid = r[`estid${slot}`];
  const est = r[`est${slot}`];
  const tipo = r[`tipo${slot}`];
  const obv = r[`obv${slot}`];
  const buttonKey = `${r.idGestion}-${slot}`;
  const isSending = sendingInfo.has(buttonKey);
  const editable = [0, 1].includes(estid);
  const hasEmpresa = slot === 1 || em;

  return (
    <div className="empresa-slot">
      {/* HEADER */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-muted">
            Empresa {slot}
          </span>

          <p className="text-base font-semibold">{em || "Sin asignar"}</p>
        </div>

        <span className="text-xs w-20 break-words text-center">
          {TOOLTIP[estid]}
        </span>
      </div>

      {/* STATUS */}
      {est && (
        <div className="pt-1">
          <EmpresaBadge estid={estid} label={est} />
        </div>
      )}

      {/* META INFO */}
      {(tipo || obv) && (
        <div className="text-xs text-[var(--text-muted)] space-y-1 pt-1">
          {tipo && <p>Contrato: {tipo}</p>}
          {obv && <p>Obs: {obv}</p>}
        </div>
      )}

      {/* CONTROLS */}
      {editable && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <EmpresaSelect
              label=""
              defaultValue={idEmpresa}
              onChange={(e) => onCompanyChange(r.idGestion, slot)(e)}
              options={companyRequests.filter(
                (cr) => cr.idEspecialidad === r.idEspecialidad,
              )}
            />
          </div>

          <button
            onClick={() => onAssign(r.idGestion, slot)}
            className="btn btn-outline-brand btn-sm"
          >
            {estid === 0 ? "Asignar" : "Reasignar"}
          </button>
        </div>
      )}

      {/* SEND INFO */}
      {canSendInfo && estid === 1 && r.anexo2FirmadoRecibido === 1 && (
        <button
          onClick={() => onSendInfo(r.idGestion, r.idAlumno, idEmpresa)}
          className={`btn btn-sm w-fit ${
            isSending ? "btn-disabled btn-secondary" : "btn-primary"
          }`}
          disabled={isSending}
        >
          {isSending ? "Enviando..." : "Enviar info a empresa"}
        </button>
      )}
    </div>
  );
};

export default EmpresaControl;
