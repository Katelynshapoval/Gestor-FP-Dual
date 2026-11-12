import { useEffect, useState } from "react";
import { FaClock, FaXmark } from "react-icons/fa6";
import { useUser } from "../../context/UserContext";

// Shown in the last minutes of a session (tokens last 8 hours): whatever is
// not saved when it ends is lost, so people get time to save it first.
export default function SessionWarning() {
  const { expiresSoon } = useUser();
  const [now, setNow] = useState(() => Date.now());
  const [closedFor, setClosedFor] = useState(null);

  useEffect(() => {
    if (!expiresSoon) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [expiresSoon]);

  if (!expiresSoon || closedFor === expiresSoon) return null;
  const minutos = Math.max(1, Math.ceil((expiresSoon - now) / 60000));
  const hora = new Date(expiresSoon).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      role="status"
      className="animate-slide-down sticky top-0 z-30 mx-4 mt-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-card md:mx-6"
    >
      <FaClock aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />
      <p className="m-0 flex-1">
        <strong>Tu sesión termina a las {hora}</strong> (en {minutos} min). Guarda lo que estés
        editando: después tendrás que volver a entrar.
      </p>
      <button
        type="button"
        className="rounded-md p-1 text-amber-700 transition-colors hover:bg-amber-100"
        aria-label="Cerrar aviso"
        onClick={() => setClosedFor(expiresSoon)}
      >
        <FaXmark aria-hidden="true" />
      </button>
    </div>
  );
}
