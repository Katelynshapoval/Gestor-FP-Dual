import { FaKey, FaBuilding } from "react-icons/fa6";
import { parseEspecialidades, formatDate, InfoRow } from "../helpers";
import { IoMdArrowDropdown } from "react-icons/io";
import { MdOutlineCancel, MdPendingActions } from "react-icons/md";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { FaRegFileAlt } from "react-icons/fa";

// This component renders the list of requested specialities
const EspecialidadList = ({ raw, allSpecialities }) => {
  const items = parseEspecialidades(raw);

  if (items.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">Sin datos</p>;
  }

  return (
    <div className="space-y-2">
      {items.map(({ idEspecialidad, cantidad }) => {
        const esp = allSpecialities.find(
          (s) => s.idEspecialidad === idEspecialidad,
        );

        return (
          <div
            key={idEspecialidad}
            className="flex items-start justify-between gap-2 p-2 rounded-md bg-[var(--surface-alt)]/40"
          >
            <span className="text-sm leading-snug">
              {esp ? esp.nombreEsp : `ID ${idEspecialidad}`}
            </span>

            <span className="text-xs shrink-0 px-2 py-0.5 rounded-full bg-black/5">
              {cantidad}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// This is the main company card with expandable content
const CompanyCard = ({
  empresa,
  isExpanded,
  onToggle,
  onViewConvenio,
  onResetPassword,
  resetResult,
  allSpecialities,
}) => {
  // This determines convenio status
  const convenioStatus = empresa.convenio_validado
    ? "validado"
    : empresa.tieneConvenio
      ? "pendiente"
      : "sin_convenio";

  // This maps status to UI config
  const statusConfig = {
    validado: {
      label: "Convenio firmado",
      cls: "bg-green-500/10 text-green-800",
      Icon: IoIosCheckmarkCircleOutline,
    },
    pendiente: {
      label: "Pendiente validar",
      cls: "bg-yellow-400/15 text-yellow-800",
      Icon: MdPendingActions,
    },
    sin_convenio: {
      label: "Sin convenio",
      cls: "bg-red-500/10 text-red-800",
      Icon: MdOutlineCancel,
    },
  };

  const { label, cls, Icon } = statusConfig[convenioStatus];

  // This builds the full address string
  const direccion = [
    empresa.dirRazSocial,
    empresa.municipio,
    empresa.provincia,
    empresa.cpRazSoc,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="student-card">
      {/* Header section */}
      <div
        className="student-card-header flex items-center justify-between gap-2"
        onClick={() => onToggle(empresa.idAuxEmpresa)}
      >
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className="student-name flex items-center gap-2 min-w-0">
            <FaBuilding className="text-[var(--brand)] shrink-0" />

            <span className="truncate">{empresa.razonSocial}</span>

            <span className="hidden sm:inline text-[.8rem] text-[var(--text-muted)] shrink-0">
              ({empresa.cif})
            </span>
          </p>

          <p className="student-esp text-sm text-[var(--text-muted)] hidden sm:block truncate">
            {formatDate(empresa.fechaPeticion)} · {empresa.emailCoordinador}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`signed-badge ${cls} flex items-center gap-1 whitespace-nowrap`}
          >
            <Icon className="text-[13px]" />
            <span>{label}</span>
          </span>

          <button
            className={`toggle-btn ${isExpanded ? "rotate-180" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(empresa.idAuxEmpresa);
            }}
          >
            <IoMdArrowDropdown className="text-[1.5rem]" />
          </button>
        </div>
      </div>

      {/* Expandable content */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="student-card-body grid gap-6 grid-cols-1 md:grid-cols-2">
            {/* Left column */}
            <div className="space-y-5">
              {/* Company data */}
              <div>
                <p className="section-label">Datos de la empresa</p>
                <div className="space-y-1">
                  <InfoRow label="Razón social" value={empresa.razonSocial} />
                  <InfoRow label="CIF" value={empresa.cif} />
                  <InfoRow label="Email" value={empresa.emailCoordinador} />
                  <InfoRow
                    label="Coordinador"
                    value={empresa.nombreCoordinador}
                  />
                  <InfoRow
                    label="Teléfono coord."
                    value={empresa.telefonoCoordinador}
                  />
                  <InfoRow label="Tel. empresa" value={empresa.telEmpresa} />
                  <InfoRow label="Dirección" value={direccion} />
                  <InfoRow
                    label="Responsable legal"
                    value={`${empresa.responsableLegal || "—"} · ${
                      empresa.dniRl || "—"
                    }`}
                  />
                  <InfoRow label="Cargo" value={empresa.cargo} />
                  <InfoRow
                    label="Registro"
                    value={formatDate(empresa.fechaPeticion)}
                  />
                </div>
              </div>

              {/* Credentials section */}
              <div>
                <p className="section-label">Credenciales de acceso</p>

                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] space-y-2">
                  <InfoRow
                    label="Usuario"
                    value={empresa.username || "Sin usuario creado"}
                    mono={!!empresa.username}
                  />

                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <button
                      onClick={() => onResetPassword(empresa.idAuxEmpresa)}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border
                        border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400
                        transition-all duration-150"
                    >
                      <FaKey className="text-xs" />
                      Resetear contraseña
                    </button>

                    {resetResult?.[empresa.idAuxEmpresa] && (
                      <span className="text-xs font-mono bg-yellow-50 border border-yellow-200 text-yellow-800 px-2 py-1 rounded">
                        Nueva contraseña:
                        <strong>{resetResult[empresa.idAuxEmpresa]}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-5">
              {/* Specialities */}
              <div>
                <p className="section-label">Especialidades solicitadas</p>
                <EspecialidadList
                  raw={empresa.especialidadYCantAlumnos}
                  allSpecialities={allSpecialities}
                />
              </div>

              {/* Job description */}
              {empresa.descripcionPuesto && (
                <div>
                  <p className="section-label">Descripción del puesto</p>
                  <p className="text-sm text-[var(--text)]">
                    {empresa.descripcionPuesto}
                  </p>
                </div>
              )}

              {/* Convenio section */}
              <div>
                <p className="section-label">Convenio</p>

                <div
                  className={`p-4 rounded-lg border ${
                    convenioStatus === "validado"
                      ? "border-green-200 bg-green-50"
                      : convenioStatus === "pendiente"
                        ? "border-yellow-200 bg-yellow-50"
                        : "border-red-200 bg-red-50"
                  }`}
                >
                  {convenioStatus === "sin_convenio" ? (
                    <p className="text-sm text-red-700 flex items-center gap-2">
                      <MdOutlineCancel className="text-base shrink-0" />
                      La empresa aún no ha subido el convenio firmado.
                    </p>
                  ) : (
                    <p
                      className={`text-sm flex items-center gap-2 ${
                        convenioStatus === "validado"
                          ? "text-green-700"
                          : "text-yellow-700"
                      }`}
                    >
                      {convenioStatus === "validado" ? (
                        <>
                          <IoIosCheckmarkCircleOutline className="text-base shrink-0" />
                          Convenio validado por el administrador.
                        </>
                      ) : (
                        <>
                          <MdPendingActions className="text-base shrink-0" />
                          Convenio subido — pendiente de validación.
                        </>
                      )}
                    </p>
                  )}
                </div>

                {convenioStatus !== "sin_convenio" && (
                  <div className="flex gap-2 flex-wrap mt-3">
                    <button
                      onClick={() => onViewConvenio(empresa)}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border
                        border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400
                        transition-all duration-150"
                    >
                      <FaRegFileAlt className="text-red-500" />
                      Ver convenio
                    </button>

                    {!empresa.convenio_validado && (
                      <button
                        onClick={() => onViewConvenio(empresa)}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border
                          border-green-300 text-green-700 bg-green-50 hover:bg-green-100
                          transition-all duration-150"
                      >
                        ✓ Validar convenio
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
