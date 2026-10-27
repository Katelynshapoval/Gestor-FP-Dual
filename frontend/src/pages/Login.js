import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from '../context/UserContext';
import { useToast } from "../components/feedback/ToastProvider.jsx";

// Redirects the user to their role's home page after a successful login
function redirectByRole(rol, navigate) {
  if (rol === "EMPRESA") navigate("/companyMain");
  else if (rol === "ALUMNO") navigate("/studentMain");
  else navigate("/panel");
}

const Login = () => {
  const { setUser, sessionNotice, clearSessionNotice } = useUser();
  const navigate = useNavigate();
  const toast = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Tracks the mandatory password-change flow triggered on first login
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [tempToken, setTempToken] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    clearSessionNotice();
    setLoading(true);
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Credenciales incorrectas");

      if (data.user.must_change_password) {
        // The session is stored only after the new password is set; the
        // backend also blocks every other route until then.
        setTempToken(data.token);
        setMustChangePassword(true);
        return;
      }

      setUser({ ...data.user, token: data.token });
      redirectByRole(data.user.rol, navigate);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const token = tempToken;
      const res = await fetch("/auth/changePassword", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cambiar contraseña");

      const meRes = await fetch("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        setPassword("");
        setUser({ ...me, token, must_change_password: false });
        toast.success("Contraseña actualizada.");
        redirectByRole(me.rol, navigate);
      } else {
        throw new Error("Contraseña actualizada. Inicia sesión de nuevo.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (mustChangePassword) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="logo-mark">
            <img src="/logo.png" alt="" />
          </div>
          <h1>Cambiar contraseña</h1>
          <p className="subtitle">Debes establecer una nueva contraseña antes de continuar.</p>

          <form onSubmit={handleChangePassword} className="space-y-4 text-left mt-5">
            <div className="space-y-1">
              <label htmlFor="nueva-password" className="text-xs font-semibold text-muted uppercase tracking-wide">
                Nueva contraseña
              </label>
              <input
                id="nueva-password"
                autoComplete="new-password"
                minLength={8}
                type="password"
                placeholder="Nueva contraseña"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm bg-white outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="confirmar-password" className="text-xs font-semibold text-muted uppercase tracking-wide">
                Confirmar contraseña
              </label>
              <input
                id="confirmar-password"
                autoComplete="new-password"
                type="password"
                placeholder="Repite la contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm bg-white outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full"
              aria-busy={loading}
            >
              {loading ? "Guardando…" : "Establecer contraseña"}
            </button>

            {error && <div className="login-error" role="alert">{error}</div>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo-mark">
          <img src="/logo.png" alt="" />
        </div>
        <h1>Acceder al portal</h1>
        <p className="subtitle">FP Dual Intensiva · Salesianos Zaragoza</p>

        {sessionNotice && (
          <p role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900">
            {sessionNotice}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left mt-5">
          <div className="space-y-1">
            <label htmlFor="login-usuario" className="text-xs font-semibold text-muted uppercase tracking-wide">
              Usuario
            </label>
            <input
              id="login-usuario"
              type="text"
              autoComplete="username"
              placeholder="Correo, CIF o DNI/NIE"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm bg-white text-charcoal-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="login-password" className="text-xs font-semibold text-muted uppercase tracking-wide">
              Contraseña
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm bg-white text-charcoal-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
            aria-busy={loading}
          >
            {loading ? "Verificando…" : "Entrar"}
          </button>

          {error && <div className="login-error" role="alert">{error}</div>}

          <p className="text-xs text-muted text-center mt-2">
            Administración: correo electrónico · Empresas: CIF · Alumnos: DNI/NIE
            <br />
            Si olvidaste tu contraseña, contacta con el administrador.
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;


