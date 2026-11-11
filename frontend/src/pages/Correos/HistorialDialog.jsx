import { useState } from "react";
import { FaChevronDown, FaRotateLeft } from "react-icons/fa6";
import Modal from "../../components/ui/Modal";
import StatusBadge from "../../components/ui/StatusBadge";
import { formatFecha } from "../../utils/fechas";

function hora(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

// Every saved version of one email, newest first. Restoring copies that text
// into a new version; nothing is ever deleted.
export default function HistorialDialog({
  open,
  onClose,
  correo,
  onRestaurar,
  restaurando,
}) {
  const [abierta, setAbierta] = useState(null);
  if (!correo) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Historial de cambios"
      description={`${correo.nombre}. Restaurar una versión crea una versión nueva con ese texto; no se borra nada.`}
      busy={Boolean(restaurando)}
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <ol className="m-0 list-none divide-y divide-surface-200 rounded-lg border border-surface-200 p-0">
        {correo.historial.map((h) => {
          const actual = h.version === correo.version;
          const expandida = abierta === h.version;
          return (
            <li key={h.version} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-charcoal-900 hover:text-brand-700"
                  aria-expanded={expandida}
                  onClick={() => setAbierta(expandida ? null : h.version)}
                >
                  <FaChevronDown
                    aria-hidden="true"
                    className={`h-3 w-3 shrink-0 text-muted transition-transform ${expandida ? "rotate-180" : ""}`}
                  />
                  Versión {h.version}
                  <span className="font-normal text-muted">
                    · {formatFecha(h.creado_en)} {hora(h.creado_en)} ·{" "}
                    {h.version === 1 && !h.usuario
                      ? "texto original"
                      : h.usuario || "—"}
                  </span>
                </button>
                {actual && <StatusBadge variant="success">Actual</StatusBadge>}
                {!h.activa && <StatusBadge>Desactivado</StatusBadge>}
                {h.lleva_adjuntos && h.adjuntos && (
                  <StatusBadge variant="info">Con adjuntos</StatusBadge>
                )}
                {!actual && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={Boolean(restaurando)}
                    onClick={() => onRestaurar(h.version)}
                  >
                    <FaRotateLeft aria-hidden="true" />
                    {restaurando === h.version ? "Restaurando…" : "Restaurar"}
                  </button>
                )}
              </div>
              {expandida && (
                <div className="mt-3 rounded-md border border-surface-200 bg-surface-50 p-3 text-sm">
                  <p className="m-0 mb-2">
                    <span className="font-semibold text-charcoal-700">
                      Asunto:
                    </span>{" "}
                    {h.asunto}
                  </p>
                  <pre className="m-0 whitespace-pre-wrap break-words font-body text-sm leading-6 text-charcoal-800">
                    {h.cuerpo}
                  </pre>
                  <p className="m-0 mt-2 border-t border-surface-200 pt-2 text-charcoal-700">
                    <span className="font-semibold">Adjuntos:</span>{" "}
                    {h.lleva_adjuntos
                      ? h.adjuntos || "activado, sin ninguno"
                      : h.adjuntos
                        ? `desactivado (${h.adjuntos})`
                        : "ninguno"}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
