import { useEffect, useState } from "react";
import { FaKey } from "react-icons/fa6";
import { postJSON } from "../utils/api.js";
import { useConfirm, useToast } from "./feedback/ToastProvider.jsx";

const VISIBLE_MS = 2 * 60 * 1000;

// «Resetear contraseña» for one portal account (Administración only; the
// endpoint is admin-only too). The temporary password is shown once, for two
// minutes, and the user must change it at the next login.
export default function ResetPasswordButton({ idUsuario, nombre }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [password, setPassword] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!password) return undefined;
    const t = setTimeout(() => setPassword(null), VISIBLE_MS);
    return () => clearTimeout(t);
  }, [password]);

  const reset = async () => {
    const ok = await confirm({
      title: "Resetear contraseña",
      message: `Se generará una contraseña temporal para ${nombre}. La actual dejará de funcionar y tendrá que cambiarla al entrar.`,
      confirmLabel: "Resetear contraseña",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await postJSON(`/usuarios/${idUsuario}/resetPassword`, {});
      setPassword(res.newPassword);
      toast.success("Contraseña restablecida. Cópiala ahora: se ocultará en 2 minutos.");
    } catch (err) {
      toast.error(err.message || "No se pudo restablecer la contraseña.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-secondary btn-sm" onClick={reset} disabled={busy}>
        <FaKey aria-hidden="true" className="h-3 w-3" />
        {busy ? "Restableciendo…" : "Resetear contraseña"}
      </button>
      {password && (
        <span className="flex items-center gap-2 text-xs text-charcoal-800">
          Contraseña temporal: <strong className="font-mono">{password}</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPassword(null)}>
            Ocultar
          </button>
        </span>
      )}
    </div>
  );
}
