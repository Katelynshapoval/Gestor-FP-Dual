import { useEffect, useId, useState } from "react";
import Modal from "../../components/ui/Modal.jsx";
import InlineNotice from "../../components/ui/InlineNotice.jsx";
import { AMBITOS, FIRMANTES, firmaPermitida, REQUERIDO_TEXTO } from "./tiposDocumentoTextos.js";

const VACIO = {
  nombre: "",
  ambito: "",
  firma_empresa: false,
  firma_centro: false,
  firma_alumno: false,
  requerido: false,
  familia_contrato: "",
};

const FAMILIAS = [
  { value: "", label: "Todas las reservas" },
  { value: "beca", label: "Solo reservas con beca", hint: "como el Anexo III" },
  { value: "contrato", label: "Solo reservas con contrato", hint: "como el Anexo II" },
];

/**
 * Create or edit a document type the centre adds. `tipo` is null to create.
 * onSave(body) may be async; if it throws, the message stays in the dialog.
 */
export default function TipoDocumentoDialog({ open, tipo, onClose, onSave }) {
  const id = useId();
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const editando = Boolean(tipo);
  const ambitoFijo = editando && tipo.documentos > 0;

  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(false);
    setForm(
      tipo
        ? {
            nombre: tipo.nombre,
            ambito: tipo.ambito,
            firma_empresa: tipo.firma_empresa,
            firma_centro: tipo.firma_centro,
            firma_alumno: tipo.firma_alumno,
            requerido: tipo.requerido,
            familia_contrato: tipo.familia_contrato || "",
          }
        : VACIO,
    );
  }, [open, tipo]);

  const set = (patch) => {
    setForm((f) => {
      const next = { ...f, ...patch };
      // Signers that cannot sign in the new ámbito are dropped.
      for (const { campo, rol } of FIRMANTES) {
        if (next[campo] && !firmaPermitida(next.ambito, rol)) next[campo] = false;
      }
      if (next.ambito !== "reserva") next.familia_contrato = "";
      return next;
    });
    setError("");
  };

  const nombre = form.nombre.trim();
  const problema = nombre.length < 2
    ? "Escribe el nombre del documento."
    : !form.ambito
      ? "Elige a qué pertenece el documento."
      : null;

  const submit = async (e) => {
    e?.preventDefault();
    if (problema) {
      setError(problema);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({ ...form, nombre, familia_contrato: form.familia_contrato || null });
    } catch (err) {
      setError(err?.message || "No se ha podido guardar el documento.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="md"
      title={editando ? `Editar «${tipo.nombre}»` : "Nuevo documento"}
      description="El centro lo genera desde su plantilla para cada solicitud o reserva."
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form={`${id}-form`} className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? "Guardando…" : editando ? "Guardar cambios" : "Crear documento"}
          </button>
        </>
      }
    >
      <form id={`${id}-form`} className="space-y-5" onSubmit={submit} noValidate>
        <div className="field mb-0">
          <label htmlFor={`${id}-nombre`}>Nombre</label>
          <input
            id={`${id}-nombre`}
            data-autofocus
            className="input"
            maxLength={80}
            placeholder="Ej. Anexo IV"
            value={form.nombre}
            onChange={(e) => set({ nombre: e.target.value })}
            disabled={busy}
          />
          <p className="mt-1 text-xs text-muted">Así lo verán el centro, las empresas y los alumnos.</p>
        </div>

        <fieldset className="space-y-2" disabled={busy || ambitoFijo}>
          <legend className="mb-1.5 text-sm font-semibold text-charcoal-900">¿De qué es?</legend>
          {ambitoFijo && (
            <p className="m-0 text-xs text-muted">
              Ya hay {tipo.documentos === 1 ? "un documento" : `${tipo.documentos} documentos`} de este tipo: no se puede cambiar.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(AMBITOS).map(([valor, a]) => (
              <label key={valor} className={`checkbox-item !items-start ${form.ambito === valor ? "checked" : ""} ${ambitoFijo ? "cursor-not-allowed opacity-70" : ""}`}>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="item-label">{a.titulo}</span>
                  <span className="text-xs leading-5 text-muted">{a.cada}</span>
                </span>
                <input
                  type="radio"
                  name={`${id}-ambito`}
                  className="mt-1 shrink-0 [accent-color:var(--color-brand)]"
                  checked={form.ambito === valor}
                  onChange={() => set({ ambito: valor })}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2" disabled={busy || !form.ambito}>
          <legend className="mb-1.5 text-sm font-semibold text-charcoal-900">Quién firma</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {FIRMANTES.map(({ campo, rol, label }) => {
              const permitido = firmaPermitida(form.ambito, rol);
              return (
                <label
                  key={campo}
                  className={`checkbox-item ${form[campo] ? "checked" : ""} ${permitido ? "" : "cursor-not-allowed opacity-50"}`}
                  title={permitido || !form.ambito ? undefined : `${label} no firma documentos de ${AMBITOS[form.ambito].titulo.toLowerCase()}`}
                >
                  <span className="item-label">{label}</span>
                  <input
                    type="checkbox"
                    checked={form[campo]}
                    disabled={!permitido}
                    onChange={(e) => set({ [campo]: e.target.checked })}
                  />
                </label>
              );
            })}
          </div>
          <p className="m-0 text-xs text-muted">
            {form.ambito
              ? "Sin firmantes, basta con que el centro lo genere y lo valide."
              : "Elige primero de qué es el documento."}
          </p>
        </fieldset>

        {form.ambito === "reserva" && (
          <fieldset className="space-y-2" disabled={busy}>
            <legend className="mb-1.5 text-sm font-semibold text-charcoal-900">En qué reservas</legend>
            <div className="radio-group">
              {FAMILIAS.map((f) => (
                <label key={f.value || "todas"} className="radio-option">
                  <input
                    type="radio"
                    name={`${id}-familia`}
                    checked={form.familia_contrato === f.value}
                    onChange={() => set({ familia_contrato: f.value })}
                  />
                  <span>
                    {f.label}
                    {f.hint && <span className="text-muted"> · {f.hint}</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label className={`checkbox-item ${form.requerido ? "checked" : ""}`}>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="item-label">Obligatorio</span>
            <span className="text-xs leading-5 text-muted">
              {!form.ambito
                ? "Hay que validarlo para seguir adelante con la solicitud o la reserva."
                : form.ambito === "reserva" && !form.firma_empresa && !form.firma_centro && !form.firma_alumno
                  ? "Tiene que estar validado para confirmar la reserva."
                  : REQUERIDO_TEXTO[form.ambito]}
            </span>
          </span>
          <input
            type="checkbox"
            className="shrink-0"
            checked={form.requerido}
            disabled={busy}
            onChange={(e) => set({ requerido: e.target.checked })}
          />
        </label>

        <InlineNotice tone="error">{error}</InlineNotice>
      </form>
    </Modal>
  );
}
