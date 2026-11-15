import { useEffect, useRef, useState } from "react";
import { FaCircleCheck, FaTriangleExclamation } from "react-icons/fa6";
import FirmaPad from "../components/firma/FirmaPad.jsx";
import { InlineLoading } from "../components/ui/Loading.jsx";
import { enviarFirmaMovil, estadoSesionMovil } from "../utils/firma.js";

const MENSAJE = {
  CADUCADA: ["El código ha caducado", "Genera otro código en el ordenador y vuelve a escanearlo."],
  RECIBIDA: ["Esta firma ya se envió", "Mírala en el ordenador. Si quieres repetirla, genera allí otro código."],
  CERRADA: ["Este código ya no sirve", "Genera otro código en el ordenador y vuelve a escanearlo."],
  SIN_TOKEN: ["Falta el código", "Abre esta página escaneando el código QR que muestra el ordenador."],
};

// Defined outside the page: a component created during render would remount
// the pad (and erase the drawing) on every state change.
const Marco = ({ children }) => (
  <div className="flex min-h-[100dvh] flex-col bg-surface-50">
    <header className="flex items-center gap-2.5 border-b border-surface-200 bg-white px-4 py-3">
      <img src="/logo.png" alt="" className="h-7 w-7" />
      <p className="m-0 font-display text-sm font-semibold text-charcoal-950">FP Dual · Firma</p>
    </header>
    {children}
  </div>
);

// The page a phone opens from the QR (/firma-movil#<token>): only the pad.
// No login: the token lets this page send ONE drawing to the session the
// computer opened, nothing else. It lives outside the app's layout so the pad
// gets the whole screen.
export default function FirmaMovil() {
  const [token] = useState(() => window.location.hash.replace(/^#/, ""));
  const [fase, setFase] = useState(token ? "comprobando" : "SIN_TOKEN");
  const [tinta, setTinta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const padRef = useRef(null);

  useEffect(() => {
    document.title = "Firmar con el móvil · FP Dual Salesianos";
    if (!token) return;
    // The secret leaves the address bar (and the history) once read.
    window.history.replaceState(null, "", window.location.pathname);
    estadoSesionMovil(token)
      .then((data) => setFase(data.estado === "ABIERTA" ? "firmar" : data.estado))
      .catch(() => setFase("red"));
  }, [token]);

  const enviar = async () => {
    setError("");
    const firma = await padRef.current?.obtener();
    if (!firma) {
      setError("La firma es demasiado pequeña. Dibújala un poco más grande.");
      return;
    }
    setEnviando(true);
    try {
      await enviarFirmaMovil(token, firma.blob);
      setFase("enviada");
    } catch (err) {
      if (err.body?.estado && MENSAJE[err.body.estado]) setFase(err.body.estado);
      else setError(err.message || "No se pudo enviar la firma.");
    } finally {
      setEnviando(false);
    }
  };

  if (fase === "firmar") {
    return (
      <Marco>
        <main className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-4">
          <h1 className="m-0 font-display text-lg font-semibold text-charcoal-950">Dibuja tu firma</h1>
          <p className="m-0 mt-1 text-sm text-muted">Con el dedo. Gira el móvil si necesitas más espacio.</p>
          <FirmaPad ref={padRef} onTinta={setTinta} alto="h-[min(52dvh,22rem)] landscape:h-[46dvh]" className="mt-4" />
          {error && <p role="alert" className="m-0 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="button" className="btn btn-primary mt-4 min-h-12 w-full text-base" onClick={enviar} disabled={!tinta || enviando}>
            {enviando ? "Enviando…" : "Enviar firma"}
          </button>
          <p className="m-0 mt-3 text-center text-xs text-muted">La firma se envía al ordenador donde escaneaste el código.</p>
        </main>
      </Marco>
    );
  }

  const [titulo, texto] =
    fase === "enviada"
      ? ["Firma enviada", "Ya puedes volver al ordenador: tu firma aparece allí para que la aceptes."]
      : fase === "red"
        ? ["No hay conexión con el servidor", "Comprueba que el móvil tiene internet y está en la misma red que el ordenador, y vuelve a escanear el código."]
        : MENSAJE[fase] || ["", ""];

  return (
    <Marco>
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        {fase === "comprobando" ? (
          <InlineLoading>Comprobando el código…</InlineLoading>
        ) : (
          <div className="animate-scale-in">
            {fase === "enviada" ? (
              <FaCircleCheck aria-hidden="true" className="mx-auto h-14 w-14 text-green-600" />
            ) : (
              <FaTriangleExclamation aria-hidden="true" className="mx-auto h-12 w-12 text-amber-500" />
            )}
            <h1 className="m-0 mt-5 font-display text-xl font-semibold text-charcoal-950">{titulo}</h1>
            <p className="m-0 mx-auto mt-2 max-w-xs text-sm leading-6 text-charcoal-700">{texto}</p>
            {fase === "enviada" && <p className="m-0 mt-6 text-xs text-muted">Puedes cerrar esta pestaña.</p>}
          </div>
        )}
      </main>
    </Marco>
  );
}
