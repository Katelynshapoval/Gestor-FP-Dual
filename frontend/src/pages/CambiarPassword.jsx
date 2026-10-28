import { useState } from "react";
import { FaCheck, FaEye, FaEyeSlash, FaLightbulb, FaShieldHalved } from "react-icons/fa6";
import { postJSON } from "../utils/api.js";
import { useUser } from "../context/UserContext.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import InlineNotice from "../components/ui/InlineNotice.jsx";
import { useToast } from "../components/feedback/ToastProvider.jsx";
import "../styles/forms.css";

// Rough strength from length and character variety; only a visual guide, the
// backend rule is still "at least 8 characters".
function strength(pwd) {
  if (!pwd) return null;
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (/[a-zA-Z]/.test(pwd) && /\d/.test(pwd)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pwd) || (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd))) score += 1;
  if (pwd.length < 8) score = Math.min(score, 1);
  return [
    { label: "Muy débil", color: "bg-red-500", width: "w-1/4" },
    { label: "Débil", color: "bg-red-500", width: "w-1/4" },
    { label: "Aceptable", color: "bg-amber-500", width: "w-2/4" },
    { label: "Buena", color: "bg-green-500", width: "w-3/4" },
    { label: "Fuerte", color: "bg-green-600", width: "w-full" },
  ][score];
}

const PasswordInput = ({ id, label, value, onChange, autoComplete, placeholder, describedBy }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          className="input pr-11"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          maxLength={100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          required
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted hover:text-charcoal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/25"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <FaEyeSlash aria-hidden="true" className="h-4 w-4" /> : <FaEye aria-hidden="true" className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
};

const Requisito = ({ ok, children }) => (
  <li className={`flex items-center gap-2.5 text-sm ${ok ? "text-green-800" : "text-charcoal-700"}`}>
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
        ok ? "border-green-600 bg-green-600 text-white" : "border-surface-300 bg-white"
      }`}
      aria-hidden="true"
    >
      {ok && <FaCheck className="h-2.5 w-2.5" />}
    </span>
    {children}
    <span className="sr-only">{ok ? " (cumplido)" : " (pendiente)"}</span>
  </li>
);

// Voluntary password change for any logged-in user. The backend requires the
// current password (SEC-2); the forced first-login change stays in Login.js.
const CambiarPassword = () => {
  const toast = useToast();
  const { user, setUser } = useUser();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const largo = newPassword.length >= 8;
  const coincide = Boolean(confirmPassword) && newPassword === confirmPassword;
  const distinta = Boolean(newPassword) && newPassword !== currentPassword;
  const fuerza = strength(newPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    if (!currentPassword) {
      setError("Introduce tu contraseña actual.");
      return;
    }
    if (newPassword.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await postJSON("/auth/changePassword", { currentPassword, newPassword });
      // The old token stops working once the password changes.
      if (data?.token) setUser({ ...user, token: data.token });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Contraseña actualizada.");
    } catch (err) {
      setError(err.message || "No se pudo cambiar la contraseña.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        kicker="Cuenta"
        title="Cambiar contraseña"
        subtitle="Introduce tu contraseña actual y la nueva contraseña."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form onSubmit={handleSubmit} className="form-card mb-0">
          <PasswordInput
            id="pwdActual"
            label="Contraseña actual"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            placeholder="Tu contraseña de ahora"
          />
          <div className="divider" />
          <PasswordInput
            id="pwdNueva"
            label="Nueva contraseña"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            describedBy="pwd-requisitos"
          />
          <PasswordInput
            id="pwdNueva2"
            label="Confirmar nueva contraseña"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            placeholder="Repite la nueva contraseña"
          />
          <InlineNotice tone="error">{error}</InlineNotice>
          <div className="mt-6 flex justify-end border-t border-surface-200 pt-5">
            <button
              type="submit"
              disabled={submitting}
              className={`btn btn-primary ${submitting ? "btn-disabled" : ""}`}
            >
              {submitting ? "Guardando…" : "Cambiar contraseña"}
            </button>
          </div>
        </form>

        <aside className="space-y-4" aria-label="Requisitos y consejos">
          <section className="rounded-xl2 border border-surface-200 bg-white p-5 shadow-card">
            <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-charcoal-950">
              <FaShieldHalved aria-hidden="true" className="h-4 w-4 text-brand-700" />
              Tu nueva contraseña
            </h2>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Seguridad</span>
                <span className="font-medium text-charcoal-800">{fuerza ? fuerza.label : "—"}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-100" aria-hidden="true">
                {fuerza && <div className={`h-full rounded-full transition-all duration-300 ${fuerza.color} ${fuerza.width}`} />}
              </div>
            </div>
            <ul id="pwd-requisitos" className="m-0 mt-4 list-none space-y-2.5 p-0">
              <Requisito ok={largo}>Al menos 8 caracteres</Requisito>
              <Requisito ok={distinta}>Distinta de la actual</Requisito>
              <Requisito ok={coincide}>Las dos contraseñas coinciden</Requisito>
            </ul>
          </section>

          <section className="rounded-xl2 border border-surface-200 bg-surface-50 p-5">
            <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-charcoal-950">
              <FaLightbulb aria-hidden="true" className="h-4 w-4 text-amber-600" />
              Consejos
            </h2>
            <ul className="m-0 mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-charcoal-700">
              <li>Una frase de varias palabras es fácil de recordar y difícil de adivinar.</li>
              <li>No uses la misma contraseña que en otros servicios.</li>
              <li>Si crees que alguien la conoce, cámbiala cuanto antes.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default CambiarPassword;
