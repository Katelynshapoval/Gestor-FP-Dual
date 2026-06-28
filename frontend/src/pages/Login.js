import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from '../context/UserContext';

// Redirects the user to their role's home page after a successful login
function redirectByRole(rol, navigate) {
  if (rol === "EMPRESA") navigate("/companyMain");
  else navigate("/");
}

const Login = () => {
  const { setUser } = useUser();
  const navigate = useNavigate();

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
        setTempToken(data.token);
        setUser({ ...data.user, token: data.token });
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
      const token = tempToken || JSON.parse(localStorage.getItem("user") || "{}")?.data?.token;
      const res = await fetch("/auth/changePassword", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cambiar contraseña");

      const meRes = await fetch("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        setUser({ ...me, token, must_change_password: false });
        redirectByRole(me.rol, navigate);
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
            <img src="logo.png" alt="Salesianos" />
          </div>
          <h2>Cambiar contraseña</h2>
          <p className="subtitle">Debes establecer una nueva contraseña antes de continuar.</p>

          <form onSubmit={handleChangePassword} className="space-y-4 text-left mt-5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Nueva contraseña
              </label>
              <input
                type="password"
                placeholder="Nueva contraseña"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm bg-white outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Confirmar contraseña
              </label>
              <input
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
              className={`w-full py-2.5 rounded-lg text-sm font-semibold text-white transition ${
                loading ? "bg-gray-300 cursor-not-allowed" : "bg-brand-500 hover:bg-brand-700 cursor-pointer"
              }`}
            >
              {loading ? "Guardando…" : "Establecer contraseña"}
            </button>

            {error && <div className="login-error">{error}</div>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo-mark">
          <img src="logo.png" alt="Salesianos" />
        </div>
        <h2>Bienvenido</h2>
        <p className="subtitle">FP Dual Intensiva · Salesianos Zaragoza</p>

        <form onSubmit={handleSubmit} className="space-y-4 text-left mt-5">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Usuario
            </label>
            <input
              type="text"
              autoComplete="username"
              placeholder="Email o CIF de empresa"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm bg-white text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Contraseña
            </label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm bg-white text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 rounded-lg text-sm font-semibold text-white transition ${
              loading ? "bg-gray-300 cursor-not-allowed" : "bg-brand-500 hover:bg-brand-700 cursor-pointer"
            }`}
          >
            {loading ? "Verificando…" : "Entrar"}
          </button>

          {error && <div className="login-error">{error}</div>}

          <p className="text-xs text-gray-400 text-center mt-2">
            Las empresas usan el CIF en minúsculas como usuario.
            <br />
            Si olvidaste tu contraseña, contacta con el administrador.
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;


