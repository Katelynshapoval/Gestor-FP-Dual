import { useState } from "react";
import { FaBuilding, FaCheck, FaKey, FaPlus, FaXmark } from "react-icons/fa6";
import { formatDate, InfoRow } from "../helpers";
import { IoMdArrowDropdown } from "react-icons/io";
import {
  MdEdit,
  MdOutlineCancel,
  MdOutlineFileUpload,
  MdPendingActions,
} from "react-icons/md";
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
import ReservaDetalle from "../../../components/reservas/ReservaDetalle.jsx";
import ReservaResumenBadges from "../../../components/reservas/ReservaResumenBadges.jsx";
import EmpresaDatosActions from "./EmpresaDatosActions.jsx";
import AsignarAlumnoModal from "./AsignarAlumnoModal.jsx";
import CupoReductionDialog from "../../../components/CupoReductionDialog.jsx";
import { postJSON, putJSON } from "../../../utils/api.js";
import { cicloLabel, countChanged, espId } from "../../../utils/especialidades.js";
import { useToast } from "../../../components/feedback/ToastProvider.jsx";
import InlineNotice from "../../../components/ui/InlineNotice.jsx";
import { tipoContratoLabel } from "../../../utils/labels.js";

const EspecialidadList = ({
  especialidades,
  catalogo = [],
  solicitudId,
  canEdit,
  onUpdated,
}) => {
  const toast = useToast();
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [fieldError, setFieldError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newEspId, setNewEspId] = useState("");
  const [newCantidad, setNewCantidad] = useState("1");
  const [picker, setPicker] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const owned = new Set((especialidades || []).map((esp) => espId(esp)));
  const missing = catalogo.filter((esp) => !owned.has(espId(esp)));

  const save = async (e, ids) => {
    const idOferta = e.id_solicitud_empresa_especialidad;
    const cantidad = Number(drafts[idOferta] ?? e.cantidad_alumnos);
    if (!Number.isInteger(cantidad) || cantidad < 0) {
      setFieldError("La cantidad debe ser un entero mayor o igual que 0.");
      return;
    }
    setFieldError("");
    setSavingId(idOferta);
    try {
      const data = await putJSON(
        `/solicitudes/empresa/${solicitudId}/especialidades/${idOferta}/cantidad`,
        {
          cantidad,
          confirmar_cancelaciones: Boolean(ids),
          ids_reservas_cancelar: ids || [],
        },
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[idOferta];
        return next;
      });
      setPicker(null);
      setEditingId(null);
      if (data.canceladas?.length) {
        toast.warning(data.message || "Se han cancelado las reservas pendientes seleccionadas.");
      } else {
        toast.success("Número de plazas actualizado.");
      }
      if (onUpdated) onUpdated();
    } catch (err) {
      if (err.status === 409 && err.body?.requires_selection) {
        setPicker({
          esp: e,
          desde: err.body.cantidad_actual,
          hasta: err.body.cantidad_nueva,
          pendientes: err.body.pendientes || [],
          requiredCount: err.body.cancelar_pendientes,
        });
      } else {
        toast.error(err.message || "Error al actualizar las plazas.");
      }
    } finally {
      setSavingId(null);
    }
  };

  const add = async () => {
    const id = Number(newEspId);
    const cantidad = Number(newCantidad);
    if (!missing.some((esp) => espId(esp) === id)) {
      setFieldError("Selecciona un ciclo que aún no esté en la solicitud.");
      return;
    }
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      setFieldError("Indica al menos un alumno para añadir el ciclo.");
      return;
    }
    setSavingId("new");
    setFieldError("");
    try {
      await postJSON(`/solicitudes/empresa/${solicitudId}/especialidades`, {
        id_especialidad: id,
        cantidad,
      });
      setAdding(false);
      setNewEspId("");
      setNewCantidad("1");
      toast.success("Ciclo añadido correctamente.");
      if (onUpdated) onUpdated();
    } catch (err) {
      toast.error(err.message || "Error al añadir el ciclo.");
    } finally {
      setSavingId(null);
    }
  };

  const closeAdd = () => {
    setAdding(false);
    setNewEspId("");
    setNewCantidad("1");
    setFieldError("");
  };

  const stopEditing = (idOferta) => {
    setEditingId(null);
    setFieldError("");
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[idOferta];
      return next;
    });
  };

  const list = especialidades || [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className={`${sectionLabelClass} !mb-0`}>Especialidades solicitadas</p>
        {canEdit && missing.length > 0 && !adding && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
            <FaPlus aria-hidden="true" className="h-3 w-3" />
            Añadir ciclo
          </button>
        )}
      </div>
      <InlineNotice tone="error">{fieldError}</InlineNotice>
      {list.length === 0 && !adding && <p className="text-sm text-muted">Sin datos</p>}
      {list.length > 0 && (
        <ul className="m-0 list-none divide-y divide-surface-200 rounded-lg border border-surface-200 p-0">
          {list.map((e) => {
            const idOferta = e.id_solicitud_empresa_especialidad;
            const current = drafts[idOferta] ?? String(e.cantidad_alumnos);
            const changed = countChanged(current, e.cantidad_alumnos);
            const editing = editingId === idOferta;
            const saving = savingId === idOferta;
            return (
              <li key={idOferta || e.id_especialidad} className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5">
                <span className="min-w-0 text-sm text-charcoal-800">{cicloLabel(e)}</span>
                {editing ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      aria-label={`Plazas de ${cicloLabel(e)}`}
                      className="input w-16 px-2 py-1 text-sm"
                      value={current}
                      disabled={saving}
                      autoFocus
                      onChange={(ev) => setDrafts((prev) => ({ ...prev, [idOferta]: ev.target.value }))}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" && changed) save(e);
                        if (ev.key === "Escape") stopEditing(idOferta);
                      }}
                    />
                    <button
                      type="button"
                      className={iconBtnClass}
                      disabled={saving || !changed}
                      onClick={() => save(e)}
                      aria-label={`Guardar plazas de ${cicloLabel(e)}`}
                      title="Guardar"
                    >
                      <FaCheck aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={iconBtnClass}
                      disabled={saving}
                      onClick={() => stopEditing(idOferta)}
                      aria-label="Cancelar"
                      title="Cancelar"
                    >
                      <FaXmark aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="text-sm text-muted">
                      {e.cantidad_alumnos} {Number(e.cantidad_alumnos) === 1 ? "plaza" : "plazas"}
                    </span>
                    {canEdit && idOferta && (
                      <button
                        type="button"
                        className={iconBtnClass}
                        onClick={() => setEditingId(idOferta)}
                        aria-label={`Cambiar plazas de ${cicloLabel(e)}`}
                        title="Cambiar plazas"
                      >
                        <MdEdit aria-hidden="true" className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
        <AddRow
          missing={missing}
          newEspId={newEspId}
          newCantidad={newCantidad}
          setNewEspId={setNewEspId}
          setNewCantidad={setNewCantidad}
          saving={savingId === "new"}
          onAdd={add}
          onCancel={closeAdd}
        />
      )}
      <CupoReductionDialog
        open={Boolean(picker)}
        desde={picker?.desde}
        hasta={picker?.hasta}
        pendientes={picker?.pendientes || []}
        requiredCount={picker?.requiredCount || 0}
        busy={Boolean(savingId)}
        onCancel={() => setPicker(null)}
        onConfirm={(ids) => save(picker.esp, ids)}
      />
    </div>
  );
};

const iconBtnClass =
  "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-100 hover:text-charcoal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/25 disabled:cursor-not-allowed disabled:opacity-40";

// One line: ciclo, places, confirm, cancel.
function AddRow({ missing, newEspId, newCantidad, setNewEspId, setNewCantidad, saving, onAdd, onCancel }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-surface-300 bg-surface-50 p-2">
      <select
        className="select-input min-w-0 flex-1 py-1.5 text-sm"
        aria-label="Ciclo a añadir"
        value={newEspId}
        disabled={saving}
        autoFocus
        onChange={(event) => setNewEspId(event.target.value)}
      >
        <option value="">Selecciona un ciclo</option>
        {missing.map((esp) => (
          <option key={espId(esp)} value={espId(esp)}>{cicloLabel(esp)}</option>
        ))}
      </select>
      <input
        type="number"
        min="1"
        step="1"
        aria-label="Número de plazas"
        title="Número de plazas"
        className="input w-20 py-1.5 text-sm"
        value={newCantidad}
        disabled={saving}
        onChange={(event) => setNewCantidad(event.target.value)}
      />
      <span className="flex gap-1">
        <button type="button" className={iconBtnClass} disabled={saving || !newEspId} onClick={onAdd} aria-label="Añadir ciclo" title="Añadir">
          <FaCheck aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={iconBtnClass} disabled={saving} onClick={onCancel} aria-label="Cancelar" title="Cancelar">
          <FaXmark aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

// Reservations of THIS application (this convocatoria only, WF-9). Each one
// opens the shared ReservaDetalle panel.
const ReservasList = ({ reservations, onAssign, onUpdated }) => {
  const [abierta, setAbierta] = useState(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" className="btn btn-outline-brand btn-sm" onClick={onAssign}>
          Asignar alumno
        </button>
      </div>
      {!reservations || reservations.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">Esta solicitud no tiene reservas.</p>
      ) : (
        <div className="space-y-2">
          {reservations.map((r) => (
            <div
              key={r.id_reserva}
              className="flex flex-col gap-2 rounded-lg border border-surface-200 bg-white px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{r.alumno}</p>
                <p className="text-xs text-muted">
                  {[r.especialidad, r.dni_alumno, tipoContratoLabel(r.tipo_contrato)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <ReservaResumenBadges compact estado={r.estado_reserva} resumen={r.documentos_resumen} />
                <button type="button" className="btn btn-secondary btn-sm w-fit" onClick={() => setAbierta(r.id_reserva)}>
                  Gestionar reserva
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ReservaDetalle
        idReserva={abierta}
        open={Boolean(abierta)}
        onClose={() => setAbierta(null)}
        onChanged={onUpdated}
      />
    </div>
  );
};

// Admin company card with inner tabs for company info and their student reservations
const CompanyCard = ({
  empresa,
  reservations = [],
  transports = [],
  catalogo = [],
  isExpanded,
  onToggle,
  onViewConvenio,
  onResetPassword,
  onClearResetPassword,
  onUpdated,
  resetResult,
}) => {
  const id = empresa.id_solicitud_empresa;
  const [innerTab, setInnerTab] = useState("info");
  const [editSignal, setEditSignal] = useState(0);
  const [editingCompany, setEditingCompany] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const convenioStatus = !empresa.tieneConvenio
    ? "sin_convenio"
    : empresa.convenio_estado === "RECHAZADO"
      ? "rechazado"
      : empresa.convenio_validado
        ? "validado"
        : "pendiente";

  const statusConfig = {
    validado: {
      label: "Convenio validado",
      cls: "bg-green-500/10 text-green-800",
      Icon: IoIosCheckmarkCircleOutline,
    },
    rechazado: {
      label: "Convenio rechazado",
      cls: "bg-red-500/10 text-red-800",
      Icon: MdOutlineCancel,
    },
    pendiente: {
      label: "Convenio pendiente de validar",
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

  const razonSocial = empresa.empresa || empresa.razonSocial;
  const emailCoord = empresa.emailCoordinador;
  const nombreCoord = empresa.nombreCoordinador;
  const telCoord = empresa.telefonoCoordinador;
  const telEmpresa = empresa.telEmpresa;
  const dirRazSocial = empresa.dirRazSocial;
  const municipio = empresa.municipio;
  const provincia = empresa.provincia;
  const cp = empresa.cpRazSoc;
  const responsable = empresa.responsableLegal;
  const dniRl = empresa.dniRl;
  const cargo = empresa.cargo;
  const descripcion = empresa.descripcion_puesto || empresa.descripcionPuesto;

  const direccion = [dirRazSocial, municipio, provincia, cp]
    .filter(Boolean)
    .join(", ");

  const innerTabCls = (active) =>
    `px-4 py-1.5 text-xs font-semibold border-b-2 transition ${
      active
        ? "border-brand-600 text-brand-700"
        : "border-transparent text-muted hover:text-charcoal-700"
    }`;

  return (
    <div className={cardClass}>
      {/* Card header */}
      <div
        className={`${cardHeaderClass} flex items-center justify-between gap-2`}
        onClick={() => onToggle(id)}
      >
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className={`${cardNameClass} flex items-center gap-2 min-w-0`}>
            <FaBuilding aria-hidden="true" className="text-brand-600 shrink-0" />
            <span className="truncate">{razonSocial}</span>
            <span className="hidden sm:inline text-[.8rem] text-muted shrink-0">
              ({empresa.cif})
            </span>
          </p>
          <p
            className={`${cardEspClass} hidden truncate text-sm text-muted sm:block`}
          >
            {formatDate(empresa.fechaPeticion)} · {emailCoord}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {empresa.cambio_pendiente ? (
            <span
              className={`${signedBadgeClass} bg-amber-100 text-amber-800 flex items-center gap-1 whitespace-nowrap`}
            >
              <MdPendingActions className="text-[13px]" />
              Cambios pendientes
            </span>
          ) : null}
          <span
            className={`${signedBadgeClass} ${cls} flex items-center gap-1 whitespace-nowrap`}
          >
            <Icon className="text-[13px]" />
            {label}
          </span>
          {reservations.length > 0 && (
            <span className="text-[0.7rem] bg-surface-100 text-muted rounded-full px-2 py-0.5 shrink-0">
              {reservations.length} reserva
              {reservations.length !== 1 ? "s" : ""}
            </span>
          )}
          {empresa.convocatoria_activa && !editingCompany && (
            <button
              type="button"
              title="Editar datos"
              aria-label={`Editar los datos de ${razonSocial}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-100 hover:text-brand-600"
              onClick={(e) => {
                e.stopPropagation();
                setInnerTab("info");
                setEditSignal((v) => v + 1);

                if (!isExpanded) {
                  onToggle(id);
                }
              }}
            >
              <MdEdit aria-hidden="true" className="text-lg" />
            </button>
          )}
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Ocultar" : "Mostrar"} el detalle de ${razonSocial}`}
            className={`${toggleBtnClass} ${isExpanded ? "rotate-180" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(id);
            }}
          >
            <IoMdArrowDropdown aria-hidden="true" className="text-[1.5rem]" />
          </button>
        </div>
      </div>

      {/* Expandable body */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className={cardBodyClass}>
            {/* Inner tabs */}
            <div className="flex gap-1 border-b border-surface-200 mb-5">
              <button
                className={innerTabCls(innerTab === "info")}
                onClick={() => setInnerTab("info")}
              >
                Información
              </button>
              <button
                className={innerTabCls(innerTab === "reservas")}
                onClick={() => setInnerTab("reservas")}
              >
                Reservas
                {reservations.length > 0 && (
                  <span className="ml-1 text-[0.65rem] bg-red-600/10 text-red-700 rounded-full px-1.5 py-0.5">
                    {reservations.length}
                  </span>
                )}
              </button>
            </div>

            {/* Information tab */}
            {innerTab === "info" && (
              <div className="space-y-5">
                {isExpanded &&
                  (empresa.cambio_pendiente || empresa.convocatoria_activa) && (
                    <EmpresaDatosActions
                      empresa={empresa}
                      transports={transports}
                      onUpdated={onUpdated}
                      editSignal={editSignal}
                      onEditHandled={() => setEditSignal(0)}
                      onEditingChange={setEditingCompany}
                    />
                  )}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Left column: company and coordinator data */}
                  <div className="space-y-5">
                    <div>
                      <p className={sectionLabelClass}>Datos de la empresa</p>
                      <div className="space-y-1">
                        <InfoRow label="Razón social" value={razonSocial} />
                        <InfoRow label="CIF" value={empresa.cif} />
                        <InfoRow label="Email" value={emailCoord} />
                        <InfoRow label="Coordinador" value={nombreCoord} />
                        <InfoRow label="Teléfono coord." value={telCoord} />
                        <InfoRow label="Tel. empresa" value={telEmpresa} />
                        <InfoRow label="Dirección" value={direccion} />
                        <InfoRow
                          label="Responsable legal"
                          value={`${responsable || "—"} · ${dniRl || "—"}`}
                        />
                        <InfoRow label="Cargo" value={cargo} />
                        <InfoRow
                          label="Registro"
                          value={formatDate(empresa.fechaPeticion)}
                        />
                      </div>
                    </div>

                    {/* Login credentials and password reset */}
                    <div>
                      <p className={sectionLabelClass}>
                        Credenciales de acceso
                      </p>
                      <div className="p-3 rounded-lg border border-surface-200 bg-white space-y-2">
                        <InfoRow
                          label="Usuario"
                          value={
                            empresa.username || emailCoord || "Sin usuario"
                          }
                          mono={!!(empresa.username || emailCoord)}
                        />
                        {/* Only ADMINISTRADOR may reset passwords (route is admin-only) */}
                        {onResetPassword && (
                        <div className="flex items-center gap-2 flex-wrap mt-2">
                          <button
                            onClick={() => onResetPassword(id)}
                            className="flex items-center gap-1.5 rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-sm text-charcoal-700 transition-colors duration-150 hover:border-charcoal-300 hover:bg-surface-50"
                          >
                            <FaKey className="text-xs" />
                            Resetear contraseña
                          </button>
                          {resetResult?.[id] && (
                            <>
                              <span className="text-xs font-mono bg-yellow-50 border border-yellow-200 text-yellow-800 px-2 py-1 rounded">
                                Nueva contraseña:{" "}
                                <strong>{resetResult[id]}</strong>
                              </span>
                              {onClearResetPassword && (
                                <button
                                  type="button"
                                  onClick={() => onClearResetPassword(id)}
                                  className="text-xs text-muted underline hover:text-charcoal-700"
                                >
                                  Ocultar
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right column: specialities, job description, and convenio */}
                  <div className="space-y-5">
                    <div>
                      <EspecialidadList
                        especialidades={empresa.especialidades}
                        catalogo={catalogo}
                        solicitudId={id}
                        canEdit={!!empresa.convocatoria_activa}
                        onUpdated={onUpdated}
                      />
                    </div>

                    {descripcion && (
                      <div>
                        <p className={sectionLabelClass}>
                          Descripción del puesto
                        </p>
                        <p className="text-sm text-charcoal-700">{descripcion}</p>
                      </div>
                    )}

                    {/* Convenio status and viewer button */}
                    <div>
                      <p className={sectionLabelClass}>Convenio</p>
                      <div
                        className={`p-3 rounded-lg border text-sm flex items-center gap-2 ${
                          convenioStatus === "validado"
                            ? "border-green-200 bg-green-50 text-green-700"
                            : convenioStatus === "pendiente"
                              ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                              : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        <Icon className="shrink-0" />
                        {convenioStatus === "validado" && "Convenio validado."}
                        {convenioStatus === "pendiente" &&
                          "Convenio pendiente de validar."}
                        {convenioStatus === "sin_convenio" &&
                          "Convenio pendiente de generar."}
                      </div>
                      {convenioStatus !== "sin_convenio" && (
                        <div className="flex gap-2 flex-wrap mt-2">
                          <button
                            onClick={() => onViewConvenio(empresa)}
                            className="flex items-center gap-1.5 rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-sm text-charcoal-700 transition-[background-color,border-color,color] duration-150 ease-out hover:bg-surface-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/25"
                          >
                            <MdOutlineFileUpload className="text-brand-600" />
                            Ver convenio
                          </button>
                          {!empresa.convenio_validado && (
                            <button
                              onClick={() => onViewConvenio(empresa)}
                              className="flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm text-green-700 transition-colors duration-150 hover:bg-green-100"
                            >
                              ✓ Validar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Reservations tab */}
            {innerTab === "reservas" && (
              <ReservasList reservations={reservations} onAssign={() => setAssigning(true)} onUpdated={onUpdated} />
            )}
            {assigning && (
              <AsignarAlumnoModal
                solicitudId={id}
                onClose={() => setAssigning(false)}
                onAssigned={onUpdated}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyCard;
