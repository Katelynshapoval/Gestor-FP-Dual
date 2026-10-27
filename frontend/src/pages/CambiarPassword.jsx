import { useState } from "react";
import { postJSON } from "../utils/api.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import InlineNotice from "../components/ui/InlineNotice.jsx";
import { useToast } from "../components/feedback/ToastProvider.jsx";
import "../styles/forms.css";

// Voluntary password change for any logged-in user. The backend requires the
// current password (SEC-2); the forced first-login change stays in Login.js.
const CambiarPassword = () => {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      await postJSON("/auth/changePassword", { currentPassword, newPassword });
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
      <form onSubmit={handleSubmit} className="form-card max-w-lg space-y-4">
        <div className="field">
          <label htmlFor="pwdActual">Contraseña actual</label>
          <input
            id="pwdActual"
            className="input"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="pwdNueva">Nueva contraseña</label>
          <input
            id="pwdNueva"
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            minLength={8}
            maxLength={100}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="pwdNueva2">Confirmar nueva contraseña</label>
          <input
            id="pwdNueva2"
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={100}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        <InlineNotice tone="error">{error}</InlineNotice>
        <button
          type="submit"
          disabled={submitting}
          className={`btn btn-primary ${submitting ? "btn-disabled" : ""}`}
        >
          {submitting ? "Guardando…" : "Cambiar contraseña"}
        </button>
      </form>
    </div>
  );
};

export default CambiarPassword;
