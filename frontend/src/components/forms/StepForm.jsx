import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FaCheck } from "react-icons/fa6";
import { MdOutlineFileUpload } from "react-icons/md";

// Building blocks for the public multi-step forms (Phase 4, D.3):
// - every field has a visible label, a required marker, an optional hint and
//   an inline error, all wired with aria-describedby / aria-invalid;
// - "Siguiente" checks only the current step, lists its errors at the top
//   (ErrorSummary) and moves focus to the first one;
// - the step heading receives focus when the step changes, so screen readers
//   announce where the user is;
// - values live in one object, so moving back and forth never loses them.

export function useStepForm({ steps, initialValues, validateStep }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const headingRef = useRef(null);
  const firstRender = useRef(true);

  const set = useCallback((name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setDirty(true);
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const check = (index) => {
    const found = validateStep(steps[index].id, values) || {};
    const clean = Object.fromEntries(Object.entries(found).filter(([, msg]) => msg));
    setErrors(clean);
    return clean;
  };

  const next = () => {
    const found = check(step);
    if (Object.keys(found).length) {
      // Focus the summary so the list of problems is read first.
      requestAnimationFrame(() => document.getElementById("form-error-summary")?.focus());
      return false;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
    return true;
  };

  const back = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  };

  // Jump back from the review step to correct something.
  const goTo = (index) => {
    if (index < step) {
      setErrors({});
      setStep(index);
    }
  };

  // Before submitting, every step is checked; the first invalid one is opened.
  const validateAll = () => {
    for (let i = 0; i < steps.length; i += 1) {
      const found = Object.fromEntries(
        Object.entries(validateStep(steps[i].id, values) || {}).filter(([, m]) => m),
      );
      if (Object.keys(found).length) {
        setStep(i);
        setErrors(found);
        return false;
      }
    }
    return true;
  };

  const reset = () => {
    setValues(initialValues);
    setErrors({});
    setStep(0);
    setDirty(false);
  };

  return { values, set, errors, step, steps, next, back, goTo, validateAll, reset, dirty, setDirty, headingRef };
}

// Warns before closing or reloading the tab with unsent data.
export function useUnsavedWarning(active) {
  useEffect(() => {
    if (!active) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}

export const Stepper = ({ steps, current, onGoTo }) => (
  <nav aria-label="Pasos del formulario" className="mb-6">
    <p className="mb-3 text-sm font-semibold text-charcoal-800">
      Paso {current + 1} de {steps.length}: {steps[current].title}
    </p>
    <ol className="flex gap-1.5">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.id} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onGoTo(i)}
              disabled={!done}
              aria-current={active ? "step" : undefined}
              aria-label={`Paso ${i + 1}: ${s.title}${done ? " (completado, volver a este paso)" : active ? " (actual)" : ""}`}
              className="group block w-full text-left disabled:cursor-default"
            >
              <span
                className={`block h-1.5 rounded-full ${
                  done ? "bg-brand-600 group-hover:bg-brand-700" : active ? "bg-brand-600" : "bg-surface-200"
                }`}
              />
              <span
                className={`mt-2 hidden items-center gap-1 truncate text-xs md:flex ${
                  active ? "font-semibold text-charcoal-950" : done ? "text-charcoal-700 group-hover:underline" : "text-muted"
                }`}
              >
                {done && <FaCheck aria-hidden="true" className="h-3 w-3 shrink-0 text-brand-700" />}
                {s.title}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  </nav>
);

export const ErrorSummary = ({ errors, labels }) => {
  const entries = Object.entries(errors).filter(([, m]) => m);
  if (!entries.length) return null;
  return (
    <div
      id="form-error-summary"
      tabIndex={-1}
      role="alert"
      className="mb-6 rounded-xl2 border border-red-200 bg-red-50 px-5 py-4 text-red-900 outline-none focus-visible:ring-2 focus-visible:ring-red-400"
    >
      <p className="m-0 font-semibold">
        {entries.length === 1 ? "Revisa este campo antes de continuar:" : `Revisa estos ${entries.length} campos antes de continuar:`}
      </p>
      <ul className="mb-0 mt-2 list-disc space-y-1 pl-5 text-sm">
        {entries.map(([name, msg]) => (
          <li key={name}>
            <a
              href={`#campo-${name}`}
              className="underline"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`campo-${name}`)?.focus();
              }}
            >
              {labels?.[name] ? `${labels[name]}: ` : ""}
              {msg}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

const RequiredMark = () => (
  <>
    <span aria-hidden="true" className="ml-0.5 text-brand-700">
      *
    </span>
    <span className="sr-only"> (obligatorio)</span>
  </>
);

function describedBy(id, hint, error) {
  return [hint && `${id}-ayuda`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
}

const FieldShell = ({ id, label, required, hint, error, children, className = "" }) => (
  <div className={`field ${className}`}>
    <label htmlFor={id}>
      {label}
      {required && <RequiredMark />}
    </label>
    {hint && (
      <p id={`${id}-ayuda`} className="-mt-1 mb-2 text-xs leading-5 text-muted">
        {hint}
      </p>
    )}
    {children}
    {error && (
      <p id={`${id}-error`} className="mb-0 mt-1.5 flex items-start gap-1.5 text-sm font-medium text-red-700">
        <span aria-hidden="true">!</span>
        {error}
      </p>
    )}
  </div>
);

export const TextField = ({ name, label, value, onChange, error, hint, required, className, type = "text", ...rest }) => {
  const id = `campo-${name}`;
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={className}>
      <input
        id={id}
        name={name}
        type={type}
        className={`input ${error ? "border-red-400" : ""}`}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </FieldShell>
  );
};

export const SelectField = ({ name, label, value, onChange, error, hint, required, options, placeholder, className, disabled }) => {
  const id = `campo-${name}`;
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={className}>
      <select
        id={id}
        name={name}
        className={`select-input ${error ? "border-red-400" : ""}`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(name, e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy(id, hint, error)}
      >
        <option value="">{placeholder || "Selecciona una opción"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
};

export const RadioField = ({ name, label, value, onChange, error, hint, required, options }) => {
  const id = `campo-${name}`;
  const groupId = useId();
  return (
    <fieldset className="field" aria-describedby={describedBy(id, hint, error)} aria-invalid={error ? true : undefined}>
      <legend id={groupId} className="mb-2 block text-sm font-semibold text-charcoal-800">
        {label}
        {required && <RequiredMark />}
      </legend>
      {hint && (
        <p id={`${id}-ayuda`} className="-mt-1 mb-2 text-xs leading-5 text-muted">
          {hint}
        </p>
      )}
      <div className="radio-group">
        {options.map((o, i) => (
          <label key={o.value} className="radio-option">
            <input
              id={i === 0 ? id : undefined}
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={(e) => onChange(name, e.target.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} className="mb-0 mt-1.5 flex items-start gap-1.5 text-sm font-medium text-red-700">
          <span aria-hidden="true">!</span>
          {error}
        </p>
      )}
    </fieldset>
  );
};

export const FileField = ({ name, label, file, onChange, error, hint, required, accept = ".pdf,application/pdf" }) => {
  const id = `campo-${name}`;
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error}>
      <label className={`file-upload ${error ? "border-red-400" : ""}`}>
        <MdOutlineFileUpload aria-hidden="true" className="file-upload-icon" />
        <span className="file-upload-text">{file ? file.name : "Seleccionar archivo PDF…"}</span>
        <input
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => onChange(name, e.target.files?.[0] || null)}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy(id, hint, error)}
        />
      </label>
    </FieldShell>
  );
};

export const StepHeading = ({ headingRef, title, description }) => (
  <div className="mb-5">
    <h2 ref={headingRef} tabIndex={-1} className="form-section-title mb-1 outline-none">
      {title}
    </h2>
    {description && <p className="m-0 text-sm leading-6 text-muted">{description}</p>}
  </div>
);

// Review step: one block per step, each with a "Modificar" button.
export const ReviewSection = ({ title, rows, onEdit }) => (
  <section className="rounded-lg border border-surface-200 bg-surface-50 p-4" aria-label={title}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="m-0 text-sm font-semibold text-charcoal-950">{title}</h3>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
        Modificar<span className="sr-only"> {title}</span>
      </button>
    </div>
    <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {rows
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</dt>
            <dd className="m-0 break-words text-charcoal-900">{v}</dd>
          </div>
        ))}
    </dl>
  </section>
);

export const StepNav = ({ step, total, onBack, onNext, submitting, submitLabel, onSubmit }) => (
  <div className="mt-6 flex flex-col-reverse gap-3 border-t border-surface-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
    {step > 0 ? (
      <button type="button" className="btn btn-secondary" onClick={onBack} disabled={submitting}>
        ← Anterior
      </button>
    ) : (
      <span />
    )}
    {step < total - 1 ? (
      <button type="button" className="btn btn-primary" onClick={onNext}>
        Siguiente →
      </button>
    ) : (
      <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={submitting} aria-busy={submitting}>
        {submitting ? "Enviando…" : submitLabel}
      </button>
    )}
  </div>
);

export const SubmitProgress = ({ submitting, text = "Enviando la solicitud. No cierres esta página." }) =>
  submitting ? (
    <p role="status" className="mt-4 rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-charcoal-800">
      {text}
    </p>
  ) : null;
