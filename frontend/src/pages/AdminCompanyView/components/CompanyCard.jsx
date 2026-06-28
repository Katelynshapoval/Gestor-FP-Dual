import { FaKey, FaBuilding } from "react-icons/fa6";
import { FaRegFileAlt } from "react-icons/fa";
import { formatDate, InfoRow } from "../helpers";
import { IoMdArrowDropdown } from "react-icons/io";
import { MdOutlineCancel, MdPendingActions } from "react-icons/md";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";

import {
  cardBodyClass,
  cardClass,
  cardEspClass,
  cardHeaderClass,
  cardNameClass,
  sectionLabelClass,
  signedBadgeClass,
  toggleBtnClass,
} from "../../../components/ui/cardStyles";

// Lista de especialidades solicitadas (formato normalizado)
const EspecialidadList = ({ especialidades }) => {
  if (!especialidades || especialidades.length === 0) return <p className="text-sm text-gray-500">Sin datos</p>;
  return (
    <div className="space-y-1.5">
      {especialidades.map((e) => (
        <div key={e.id_especialidad} className="flex items-center justify-between gap-2 rounded-md bg-surface-50/60 px-3 py-1.5">
          <span className="text-sm">{e.nombre || `ID ${e.id_especialidad}`}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-black/5 shrink-0">{e.cantidad_alumnos}</span>
        </div>
      ))}
    </div>
  );
};

// Tarjeta compacta de empresa con acordeón para el administrador
const CompanyCard = ({ empresa, isExpanded, onToggle, onViewConvenio, onResetPassword, resetResult }) => {
  const id = empresa.id_solicitud_empresa;

  const convenioStatus = empresa.convenio_validado ? "validado" : empresa.tieneConvenio ? "pendiente" : "sin_convenio";
  const statusConfig = {
    validado:    { label: "Convenio firmado",  cls: "bg-green-500/10 text-green-800",   Icon: IoIosCheckmarkCircleOutline },
    pendiente:   { label: "Pendiente validar", cls: "bg-yellow-400/15 text-yellow-800", Icon: MdPendingActions },
    sin_convenio:{ label: "Sin convenio",      cls: "bg-red-500/10 text-red-800",       Icon: MdOutlineCancel },
  };
  const { label, cls, Icon } = statusConfig[convenioStatus];

  const razonSocial  = empresa.empresa || empresa.razonSocial;
  const emailCoord   = empresa.emailCoordinador;
  const nombreCoord  = empresa.nombreCoordinador;
  const telCoord     = empresa.telefonoCoordinador;
  const telEmpresa   = empresa.telEmpresa;
  const dirRazSocial = empresa.dirRazSocial;
  const municipio    = empresa.municipio;
  const provincia    = empresa.provincia;
  const cp           = empresa.cpRazSoc;
  const responsable  = empresa.responsableLegal;
  const dniRl        = empresa.dniRl;
  const cargo        = empresa.cargo;
  const descripcion  = empresa.descripcion_puesto || empresa.descripcionPuesto;

  const direccion = [dirRazSocial, municipio, provincia, cp].filter(Boolean).join(", ");

  return (
    <div className={cardClass}>
      {/* Cabecera */}
      <div className={`${cardHeaderClass} flex items-center justify-between gap-2`} onClick={() => onToggle(id)}>
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className={`${cardNameClass} flex items-center gap-2 min-w-0`}>
            <FaBuilding className="text-brand-500 shrink-0" />
            <span className="truncate">{razonSocial}</span>
            <span className="hidden sm:inline text-[.8rem] text-gray-500 shrink-0">({empresa.cif})</span>
          </p>
          <p className={`${cardEspClass} hidden truncate text-sm text-gray-500 sm:block`}>
            {formatDate(empresa.fechaPeticion)} · {emailCoord}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`${signedBadgeClass} ${cls} flex items-center gap-1 whitespace-nowrap`}>
            <Icon className="text-[13px]" />
            {label}
          </span>
          <button className={`${toggleBtnClass} ${isExpanded ? "rotate-180" : ""}`} onClick={(e) => { e.stopPropagation(); onToggle(id); }}>
            <IoMdArrowDropdown className="text-[1.5rem]" />
          </button>
        </div>
      </div>

      {/* Cuerpo expandible */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className={`${cardBodyClass} grid grid-cols-1 gap-6 md:grid-cols-2`}>

            {/* Columna izquierda */}
            <div className="space-y-5">
              <div>
                <p className={sectionLabelClass}>Datos de la empresa</p>
                <div className="space-y-1">
                  <InfoRow label="Razón social"       value={razonSocial} />
                  <InfoRow label="CIF"                value={empresa.cif} />
                  <InfoRow label="Email"              value={emailCoord} />
                  <InfoRow label="Coordinador"        value={nombreCoord} />
                  <InfoRow label="Teléfono coord."    value={telCoord} />
                  <InfoRow label="Tel. empresa"       value={telEmpresa} />
                  <InfoRow label="Dirección"          value={direccion} />
                  <InfoRow label="Responsable legal"  value={`${responsable || "—"} · ${dniRl || "—"}`} />
                  <InfoRow label="Cargo"              value={cargo} />
                  <InfoRow label="Registro"           value={formatDate(empresa.fechaPeticion)} />
                </div>
              </div>

              {/* Credenciales */}
              <div>
                <p className={sectionLabelClass}>Credenciales de acceso</p>
                <div className="p-3 rounded-lg border border-surface-200 bg-white space-y-2">
                  <InfoRow label="Usuario" value={empresa.username || emailCoord || "Sin usuario"} mono={!!(empresa.username || emailCoord)} />
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <button
                      onClick={() => onResetPassword(id)}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 transition-all duration-150"
                    >
                      <FaKey className="text-xs" />
                      Resetear contraseña
                    </button>
                    {resetResult?.[id] && (
                      <span className="text-xs font-mono bg-yellow-50 border border-yellow-200 text-yellow-800 px-2 py-1 rounded">
                        Nueva contraseña: <strong>{resetResult[id]}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Columna derecha */}
            <div className="space-y-5">
              <div>
                <p className={sectionLabelClass}>Especialidades solicitadas</p>
                <EspecialidadList especialidades={empresa.especialidades} />
              </div>

              {descripcion && (
                <div>
                  <p className={sectionLabelClass}>Descripción del puesto</p>
                  <p className="text-sm text-gray-700">{descripcion}</p>
                </div>
              )}

              {/* Convenio */}
              <div>
                <p className={sectionLabelClass}>Convenio</p>
                <div className={`p-3 rounded-lg border text-sm flex items-center gap-2 ${
                  convenioStatus === "validado" ? "border-green-200 bg-green-50 text-green-700" :
                  convenioStatus === "pendiente" ? "border-yellow-200 bg-yellow-50 text-yellow-700" :
                  "border-red-200 bg-red-50 text-red-700"
                }`}>
                  <Icon className="shrink-0" />
                  {convenioStatus === "validado" && "Convenio validado."}
                  {convenioStatus === "pendiente" && "Convenio subido — pendiente de validación."}
                  {convenioStatus === "sin_convenio" && "La empresa no ha subido el convenio."}
                </div>
                {convenioStatus !== "sin_convenio" && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    <button onClick={() => onViewConvenio(empresa)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-all">
                      <FaRegFileAlt className="text-red-500" />
                      Ver convenio
                    </button>
                    {!empresa.convenio_validado && (
                      <button onClick={() => onViewConvenio(empresa)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-all">
                        ✓ Validar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyCard;
