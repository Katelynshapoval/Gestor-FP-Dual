import { useState } from "react";
import { FaKey, FaBuilding } from "react-icons/fa6";
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
import { reservaEstadoClass } from "../../../utils/reservaEstados.js";
import EmpresaDatosActions from "./EmpresaDatosActions.jsx";
import AsignarAlumnoModal from "./AsignarAlumnoModal.jsx";
import CupoReductionDialog from "../../../components/CupoReductionDialog.jsx";
import { postJSON, putJSON } from "../../../utils/api.js";
import { cicloLabel, countChanged, espId } from "../../../utils/especialidades.js";
import { useToast } from "../../../components/feedback/ToastProvider.jsx";
import InlineNotice from "../../../components/ui/InlineNotice.jsx";

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

  if ((!especialidades || especialidades.length === 0) && !adding) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className={sectionLabelClass}>Especialidades solicitadas</p>
          {canEdit && missing.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(true)} aria-label="Añadir ciclo">
              +
            </button>
          )}
        </div>
        {!adding && <p className="text-sm text-gray-500">Sin datos</p>}
        {adding && (
          <AddRow
            missing={missing}
            newEspId={newEspId}
            newCantidad={newCantidad}
            setNewEspId={setNewEspId}
            setNewCantidad={setNewCantidad}
            saving={savingId === "new"}
            onAdd={add}
            onCancel={() => {
              setAdding(false);
              setNewEspId("");
              setNewCantidad("1");
              setFieldError("");
            }}
          />
        )}
        <InlineNotice tone="error">{fieldError}</InlineNotice>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className={sectionLabelClass}>Especialidades solicitadas</p>
        {canEdit && missing.length > 0 && !adding && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(true)} aria-label="Añadir ciclo">
            +
          </button>
        )}
      </div>
      <InlineNotice tone="error">{fieldError}</InlineNotice>
      {adding && (
        <AddRow
          missing={missing}
          newEspId={newEspId}
          newCantidad={newCantidad}
          setNewEspId={setNewEspId}
          setNewCantidad={setNewCantidad}
          saving={savingId === "new"}
          onAdd={add}
          onCancel={() => {
            setAdding(false);
            setNewEspId("");
            setNewCantidad("1");
            setFieldError("");
          }}
        />
      )}
      {(especialidades || []).map((e) => {
        const idOferta = e.id_solicitud_empresa_especialidad;
        const current = drafts[idOferta] ?? String(e.cantidad_alumnos);
        const changed = countChanged(current, e.cantidad_alumnos);
        return (
          <div
            key={idOferta || e.id_especialidad}
            className="flex items-center justify-between gap-2 rounded-md bg-surface-50/60 px-3 py-1.5"
          >
            <span className="text-sm">{cicloLabel(e)}</span>
            {canEdit && idOferta ? (
              <span className="flex shrink-0 items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input w-16 py-0.5 text-xs"
                  value={current}
                  disabled={savingId === idOferta}
                  onChange={(ev) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [idOferta]: ev.target.value,
                    }))
                  }
                />
                {changed && (
                  <button
                    type="button"
                    className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs"
                    disabled={savingId === idOferta}
                    onClick={() => save(e)}
                  >
                    {savingId === idOferta ? "…" : "Guardar"}
                  </button>
                )}
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs">
                {e.cantidad_alumnos}
              </span>
            )}
          </div>
        );
      })}
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

function AddRow({ missing, newEspId, newCantidad, setNewEspId, setNewCantidad, saving, onAdd, onCancel }) {
  return (
    <div className="space-y-2 rounded-lg border border-surface-200 bg-white p-3">
      <label className="block text-xs font-semibold text-gray-600">
        Ciclo
        <select className="select-input mt-1" value={newEspId} disabled={saving} onChange={(event) => setNewEspId(event.target.value)}>
          <option value="">Selecciona un ciclo</option>
          {missing.map((esp) => (
            <option key={espId(esp)} value={espId(esp)}>{cicloLabel(esp)}</option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-gray-600">
        Alumnos
        <input type="number" min="1" step="1" className="input mt-1 w-24" value={newCantidad} disabled={saving} onChange={(event) => setNewCantidad(event.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={onAdd}>
          {saving ? "…" : "Añadir"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// Students reserved by this empresa, shown in the Reservas inner tab
const ReservasList = ({ reservations, onAssign }) => {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" className="btn btn-primary btn-sm" onClick={onAssign}>
          Asignar alumno
        </button>
      </div>
      {!reservations || reservations.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">Sin reservas asociadas.</p>
      ) : (
        <div className="space-y-2">
          {reservations.map((r) => (
            <div
              key={r.id_reserva}
              className="flex items-center justify-between gap-3 rounded-lg border border-surface-200 bg-white px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{r.alumno}</p>
                <p className="text-xs text-gray-500">
                  {r.especialidad} · {r.dni_alumno}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`${signedBadgeClass} ${reservaEstadoClass(r.estado_reserva, { bordered: false })}`}>
                  {r.estado_reserva}
                </span>
                {r.tipo_contrato && <span className="text-[0.7rem] text-gray-400">{r.tipo_contrato}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
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
  onUpdated,
  resetResult,
}) => {
  const id = empresa.id_solicitud_empresa;
  const [innerTab, setInnerTab] = useState("info");
  const [editSignal, setEditSignal] = useState(0);
  const [editingCompany, setEditingCompany] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const convenioStatus = empresa.convenio_validado
    ? "validado"
    : empresa.tieneConvenio
      ? "pendiente"
      : "sin_convenio";

  const statusConfig = {
    validado: {
      label: "Convenio validado",
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
        ? "border-red-600 text-red-600"
        : "border-transparent text-gray-500 hover:text-gray-700"
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
            <FaBuilding className="text-brand-500 shrink-0" />
            <span className="truncate">{razonSocial}</span>
            <span className="hidden sm:inline text-[.8rem] text-gray-500 shrink-0">
              ({empresa.cif})
            </span>
          </p>
          <p
            className={`${cardEspClass} hidden truncate text-sm text-gray-500 sm:block`}
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
            <span className="text-[0.7rem] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 shrink-0">
              {reservations.length} reserva
              {reservations.length !== 1 ? "s" : ""}
            </span>
          )}
          {empresa.convocatoria_activa && !editingCompany && (
            <button
              type="button"
              title="Editar datos"
              aria-label="Editar datos"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-600"
              onClick={(e) => {
                e.stopPropagation();
                setInnerTab("info");
                setEditSignal((v) => v + 1);

                if (!isExpanded) {
                  onToggle(id);
                }
              }}
            >
              <MdEdit className="text-lg" />
            </button>
          )}
          <button
            className={`${toggleBtnClass} ${isExpanded ? "rotate-180" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(id);
            }}
          >
            <IoMdArrowDropdown className="text-[1.5rem]" />
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
            <div className="flex gap-1 border-b border-gray-100 mb-5">
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
                        <div className="flex items-center gap-2 flex-wrap mt-2">
                          <button
                            onClick={() => onResetPassword(id)}
                            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50"
                          >
                            <FaKey className="text-xs" />
                            Resetear contraseña
                          </button>
                          {resetResult?.[id] && (
                            <span className="text-xs font-mono bg-yellow-50 border border-yellow-200 text-yellow-800 px-2 py-1 rounded">
                              Nueva contraseña:{" "}
                              <strong>{resetResult[id]}</strong>
                            </span>
                          )}
                        </div>
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
                        <p className="text-sm text-gray-700">{descripcion}</p>
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
                            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-[background-color,border-color,color] duration-150 ease-out hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/25"
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
              <ReservasList reservations={reservations} onAssign={() => setAssigning(true)} />
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
