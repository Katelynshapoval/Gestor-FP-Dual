import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { useUser } from "../globales/User";

// Redirige al área correcta según el rol del usuario
function redirectByRole(userType, navigate) {
  if (userType === "empresa") navigate("/companyMain");
  else navigate("/");
}

// Pestaña de login con credenciales (para empresas)
const CredentialLogin = ({ setUser }) => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [userId, setUserId] = useState(null);
  const [userType, setUserType] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/loginWithCredentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.msg || "Credenciales incorrectas");
      }
      const userData = await res.json();

      if (userData.must_change_password) {
        setMustChangePassword(true);
        setUserId(userData.idUser);
        setUserType(userData.user_type);
        setUser({
          idUser: userData.idUser,
          nombre: userData.name,
          email: userData.email,
          user_type: userData.user_type,
        });
        return;
      }

      setUser({
        nombre: userData.name,
        email: userData.email,
        specialities: userData.specialities,
        user_type: userData.user_type,
      });

      redirectByRole(userData.user_type, navigate);
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
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/changePassword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idUser: userId, newPassword }),
      });

      if (!res.ok) throw new Error("Error al cambiar contraseña");

      redirectByRole(userType, navigate);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Formulario de cambio de contraseña obligatorio en el primer acceso
  if (mustChangePassword) {
    return (
      <form onSubmit={handleChangePassword} className="space-y-4 text-left">
        <p className="text-sm text-gray-500">
          Debes cambiar tu contraseña antes de continuar.
        </p>

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
            loading
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-brand-500 hover:bg-brand-700 cursor-pointer"
          }`}
        >
          {loading ? "Guardando…" : "Cambiar contraseña"}
        </button>

        {error && <div className="login-error">{error}</div>}
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div className="space-y-1">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Usuario
        </label>
        <input
          type="text"
          autoComplete="username"
          placeholder="ej. b12345678"
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
          loading
            ? "bg-gray-300 cursor-not-allowed"
            : "bg-brand-500 hover:bg-brand-700 cursor-pointer"
        }`}
      >
        {loading ? "Verificando…" : "Entrar"}
      </button>

      {error && (
        <div className="login-error" style={{ display: "block" }}>
          {error}
        </div>
      )}

      <p className="text-xs text-gray-500 text-center mt-2">
        El usuario es el CIF de tu empresa en minúsculas.
        <br />
        Si olvidaste tu contraseña, contacta con el administrador.
      </p>
    </form>
  );
};

// Pestaña de login Google OAuth (admins y profesores)
const GoogleLoginTab = ({ setUser }) => {
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  const handleOAuthSuccess = async (credentialResponse) => {
    setError(false);
    try {
      const decoded = JSON.parse(
        atob(credentialResponse.credential.split(".")[1]),
      );
      const response = await fetch("/getUserByEmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: decoded.email }),
      });
      if (!response.ok) throw new Error("Usuario no autorizado");
      const userData = await response.json();
      setUser({
        nombre: userData.name,
        email: decoded.email,
        specialities: userData.specialities,
        user_type: userData.user_type,
      });
      redirectByRole(userData.user_type, navigate);
    } catch {
      setError(true);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <GoogleOAuthProvider clientId="791547102279-74v5rl4flrgun24og9roreds7t6euqbc.apps.googleusercontent.com">
        <GoogleLogin
          onSuccess={handleOAuthSuccess}
          onError={() => setError(true)}
          useOneTap
        />
      </GoogleOAuthProvider>
      {error && (
        <div className="login-error" style={{ display: "block" }}>
          Error al iniciar sesión. Inténtalo de nuevo.
        </div>
      )}
    </div>
  );
};

// Página principal de login con pestañas para Google y empresa
const Login = () => {
  const { setUser } = useUser();
  const [tab, setTab] = useState("google");

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo-mark">
          <img src="logo.png" alt="Salesianos" />
        </div>
        <h2>Bienvenido</h2>
        <p className="subtitle">FP Dual Intensiva · Salesianos Zaragoza</p>

        {/* Pestañas de selección de tipo de login */}
        <div className="flex border-b border-surface-200 mb-5">
          <button
            className={`flex-1 py-2 text-[0.82rem] font-semibold cursor-pointer border-none bg-transparent transition ${
              tab === "google"
                ? "border-b-2 border-brand-500 text-brand-500"
                : "border-b-2 border-transparent text-gray-400"
            }`}
            onClick={() => setTab("google")}
          >
            Centro / Admin
          </button>
          <button
            className={`flex-1 py-2 text-[0.82rem] font-semibold cursor-pointer border-none bg-transparent transition ${
              tab === "empresa"
                ? "border-b-2 border-brand-500 text-brand-500"
                : "border-b-2 border-transparent text-gray-400"
            }`}
            onClick={() => setTab("empresa")}
          >
            Empresa
          </button>
        </div>

        {tab === "google" ? (
          <GoogleLoginTab setUser={setUser} />
        ) : (
          <CredentialLogin setUser={setUser} />
        )}
      </div>
    </div>
  );
};

export default Login;
