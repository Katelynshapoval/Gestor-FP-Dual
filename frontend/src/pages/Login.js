import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { useUser } from "../globales/User";

// Redirige al área correcta según el rol del usuario
function redirectByRole(userType, navigate) {
  if (userType === "empresa") navigate("/companyMain");
  else navigate("/");
}

// ──────────────────────────────────────────────────────────
// TAB: Login con credenciales (para empresas)
// ──────────────────────────────────────────────────────────
const CredentialLogin = ({ setUser }) => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

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
          style={{
            width: "100%",
            padding: "0.55rem 0.75rem",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.9rem",
            outline: "none",
            background: "var(--surface)",
            color: "var(--text)",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--brand)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
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
          style={{
            width: "100%",
            padding: "0.55rem 0.75rem",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.9rem",
            outline: "none",
            background: "var(--surface)",
            color: "var(--text)",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--brand)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          padding: "0.6rem",
          background: loading ? "#ccc" : "var(--brand)",
          color: "#fff",
          border: "none",
          borderRadius: "var(--radius-sm)",
          fontSize: "0.9rem",
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          transition: "background 0.15s",
        }}
      >
        {loading ? "Verificando…" : "Entrar"}
      </button>

      {error && (
        <div className="login-error" style={{ display: "block" }}>
          {error}
        </div>
      )}

      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          textAlign: "center",
          marginTop: "0.5rem",
        }}
      >
        El usuario es el CIF de tu empresa en minúsculas.
        <br />
        Si olvidaste tu contraseña, contacta con el administrador.
      </p>
    </form>
  );
};

// ──────────────────────────────────────────────────────────
// TAB: Login Google OAuth (admins y profesores)
// ──────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL DE LOGIN
// ──────────────────────────────────────────────────────────
const Login = () => {
  const { setUser } = useUser();
  const [tab, setTab] = useState("google"); // "google" | "empresa"

  const tabStyle = (active) => ({
    flex: 1,
    padding: "0.5rem",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    borderBottom: active ? "2px solid var(--brand)" : "2px solid transparent",
    background: "transparent",
    color: active ? "var(--brand)" : "var(--text-muted)",
    transition: "all 0.15s",
  });

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="logo-mark">
          <img src="logo.png" alt="Salesianos" />
        </div>
        <h2>Bienvenido</h2>
        <p className="subtitle">FP Dual Intensiva · Salesianos Zaragoza</p>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            marginBottom: "1.25rem",
          }}
        >
          <button
            style={tabStyle(tab === "google")}
            onClick={() => setTab("google")}
          >
            Centro / Admin
          </button>
          <button
            style={tabStyle(tab === "empresa")}
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
