import { FaKey, FaFilePdf, FaBuilding } from "react-icons/fa6";
import { parseEspecialidades, InfoRow, formatDate } from "../helpers";
import { IoMdArrowDropdown } from "react-icons/io";
import { MdOutlineCancel, MdPendingActions } from "react-icons/md";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";

// Componente: lista de especialidades solicitadas
// Muestra nombre de la especialidad + número de alumnos
const EspecialidadList = ({ raw, allSpecialities }) => {
  const items = parseEspecialidades(raw);
  if (items.length === 0)
    return <p className="text-sm text-[var(--text-muted)]">Sin datos</p>;
  return (
    <div className="space-y-1">
      {items.map(({ idEspecialidad, cantidad }) => {
        const esp = allSpecialities.find(
          (s) => s.idEspecialidad === idEspecialidad,
        );
        return (
          <div key={idEspecialidad} className="flex items-center gap-2 text-sm">
            <span className="inline-block px-2 py-0.5 rounded bg-[var(--surface-alt)] border border-[var(--border)] text-[var(--text-muted)] text-xs">
              {esp ? esp.nombreEsp : `ID ${idEspecialidad}`}
            </span>
            <span>
              {cantidad} alumno{cantidad !== 1 ? "s" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// Tarjeta de empresa (acordeón desplegable)
// Contiene toda la info + acciones del admin
const CompanyCard = ({
  empresa,
  isExpanded,
  onToggle,
  onViewConvenio,
  onResetPassword,
  resetResult,
  allSpecialities,
}) => {
  const convenioStatus = empresa.convenio_validado
    ? "validado"
    : empresa.tieneConvenio
      ? "pendiente"
      : "sin_convenio";

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

  return (
    <div className="student-card">
      {/* CABECERA */}
      <div
        className="student-card-header flex flex-col gap-2 sm:flex-row sm:items-center"
        onClick={() => onToggle(empresa.idAuxEmpresa)}
      >
        {/* LEFT */}
        <div className="flex-1 min-w-0">
          <p className="student-name flex items-center gap-2">
            <FaBuilding className="text-[var(--brand)] shrink-0" />
            {empresa.razonSocial}
            <span className="font-normal text-[.8rem] text-[var(--text-muted)]">
              ({empresa.cif})
            </span>
          </p>
          <p className="student-esp text-sm text-[var(--text-muted)]">
            {formatDate(empresa.fechaPeticion)} · {empresa.emailCoordinador}
          </p>
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <span className={`signed-badge ${cls}`}>
            <Icon className="-mt-[1px] text-[13px]" />
            {label}
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

      {/* PANEL EXPANDIBLE */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="student-card-body grid gap-6 grid-cols-1 md:grid-cols-2">
            {/* COLUMNA IZQUIERDA */}
            <div className="space-y-5">
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
                  <InfoRow
                    label="Dirección"
                    value={[
                      empresa.dirRazSocial,
                      empresa.municipio,
                      empresa.provincia,
                      empresa.cpRazSoc,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  />
                  <InfoRow
                    label="Responsable legal"
                    value={`${empresa.responsableLegal || "—"} · ${empresa.dniRl || "—"}`}
                  />
                  <InfoRow label="Cargo" value={empresa.cargo} />
                  <InfoRow
                    label="Registro"
                    value={formatDate(empresa.fechaPeticion)}
                  />
                </div>
              </div>

              {/* CREDENCIALES */}
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

            {/* COLUMNA DERECHA */}
            <div className="space-y-5">
              {/* ESPECIALIDADES */}
              <div>
                <p className="section-label">Especialidades solicitadas</p>
                <EspecialidadList
                  raw={empresa.especialidadYCantAlumnos}
                  allSpecialities={allSpecialities}
                />
              </div>

              {/* PUESTO */}
              {empresa.descripcionPuesto && (
                <div>
                  <p className="section-label">Descripción del puesto</p>
                  <p className="text-sm text-[var(--text)]">
                    {empresa.descripcionPuesto}
                  </p>
                </div>
              )}

              {/* CONVENIO */}
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
                    <div className="space-y-3">
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
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => onViewConvenio(empresa)}
                          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border
                            border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400
                            transition-all duration-150"
                        >
                          <FaFilePdf className="text-red-500" />
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
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyCard;
