import { empresaSlotClass } from "../../../../components/ui/cardStyles";
import {
  ESTADO_TOOLTIPS,
  getEstadoClass,
} from "../../utils/empresaEstado";

const EmpresaBadge = ({ estid, label }) => (
  <span
    className={`inline-block rounded-full px-2.5 py-1 text-[0.72rem] font-semibold tracking-wide ${getEstadoClass(estid)}`}
  >
    {label}
  </span>
);

const EmpresaSelect = ({ defaultValue, onChange, options }) => (
  <select
    className="select-input px-2 py-1 text-[0.8rem]"
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
);

// Bloque de un slot de empresa: selector, asignación y envío de información
const EmpresaControl = ({
  slot,
  r,
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

  const filteredCompanies = companyRequests.filter(
    (cr) => cr.idEspecialidad === r.idEspecialidad,
  );

  return (
    <div className={empresaSlotClass}>
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-muted">
            Empresa {slot}
          </span>
          <p className="text-base font-semibold">{em || "Sin asignar"}</p>
        </div>

        <span className="w-20 break-words text-center text-xs">
          {ESTADO_TOOLTIPS[estid]}
        </span>
      </div>

      {est && (
        <div className="pt-1">
          <EmpresaBadge estid={estid} label={est} />
        </div>
      )}

      {(tipo || obv) && (
        <div className="space-y-1 pt-1 text-xs text-muted">
          {tipo && <p>Contrato: {tipo}</p>}
          {obv && <p>Obs: {obv}</p>}
        </div>
      )}

      {editable && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <EmpresaSelect
              defaultValue={idEmpresa}
              onChange={(e) => onCompanyChange(r.idGestion, slot)(e)}
              options={filteredCompanies}
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
