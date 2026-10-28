import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "../components/feedback/ToastProvider.jsx";

const inputCls =
  "w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-charcoal-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const labelCls = "text-xs font-semibold uppercase tracking-wide text-muted";

async function post(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo completar la solicitud.");
  return data;
}

const Card = ({ title, subtitle, children }) => (
  <div className="login-page">
    <div className="login-card">
      <div className="logo-mark">
        <img src="/logo.png" alt="" />
      </div>
      <h1>{title}</h1>
      <p className="subtitle">{subtitle}</p>
      {children}
    </div>
  </div>
);

// «¿Has olvidado tu contraseña?»: asks for the user and sends a link by email.
// The server refuses the request when that account does not exist.
export function RecuperarPassword() {
  const [username, setUsername] = useState("");
  const [enviado, setEnviado] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await post("/auth/forgotPassword", { username: username.trim() });
      setEnviado(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Recuperar contraseña" subtitle="Te enviaremos un enlace para elegir una contraseña nueva.">
      {enviado ? (
        <div className="mt-5 space-y-4 text-left">
          <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
            {enviado}
          </p>
          <Link to="/login" className="btn btn-secondary w-full">
            Volver a Acceder
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4 text-left">
          <div className="space-y-1">
            <label htmlFor="recuperar-usuario" className={labelCls}>
              Usuario
            </label>
            <input
              id="recuperar-usuario"
              type="text"
              autoComplete="username"
              placeholder="Correo, CIF o DNI/NIE"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className={inputCls}
            />
            <p className="m-0 pt-1 text-xs leading-5 text-muted">
              Alumnos: el enlace llega al email personal de la solicitud. Empresas: al email del coordinador principal.
            </p>
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary w-full" aria-busy={loading}>
            {loading ? "Enviando…" : "Enviar enlace"}
          </button>
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}
          <p className="m-0 text-center text-xs">
            <Link to="/login" className="text-muted underline">
              Volver a Acceder
            </Link>
            <span className="mx-2 text-muted">·</span>
            <Link to="/ayuda" className="text-muted underline">
              Ayuda
            </Link>
          </p>
        </form>
      )}
    </Card>
  );
}

// Page opened from the email link: choose the new password.
export function RestablecerPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const toast = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (newPassword !== confirmPassword) return setError("Las contraseñas no coinciden.");
    setLoading(true);
    try {
      const data = await post("/auth/resetPassword", { token, newPassword });
      toast.success(data.message || "Contraseña actualizada.");
      navigate("/login");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Card title="Enlace no válido" subtitle="Falta el código del enlace.">
        <Link to="/recuperar-contrasena" className="btn btn-primary mt-5 w-full">
          Pedir un enlace nuevo
        </Link>
      </Card>
    );
  }

  return (
    <Card title="Nueva contraseña" subtitle="Elige la contraseña con la que entrarás al portal.">
      <form onSubmit={submit} className="mt-5 space-y-4 text-left">
        <div className="space-y-1">
          <label htmlFor="restablecer-nueva" className={labelCls}>
            Nueva contraseña
          </label>
          <input
            id="restablecer-nueva"
            type="password"
            autoComplete="new-password"
            minLength={8}
            placeholder="Mínimo 8 caracteres"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="restablecer-confirmar" className={labelCls}>
            Confirmar contraseña
          </label>
          <input
            id="restablecer-confirmar"
            type="password"
            autoComplete="new-password"
            placeholder="Repite la contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className={inputCls}
          />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary w-full" aria-busy={loading}>
          {loading ? "Guardando…" : "Guardar contraseña"}
        </button>
        {error && (
          <div className="login-error" role="alert">
            {error}{" "}
            {/caducado|usado|válido/.test(error) && (
              <Link to="/recuperar-contrasena" className="font-semibold underline">
                Pedir un enlace nuevo
              </Link>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}
