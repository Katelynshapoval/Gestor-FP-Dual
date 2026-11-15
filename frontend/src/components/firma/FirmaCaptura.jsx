import { useRef, useState } from "react";
import { FaMobileScreenButton, FaPenNib } from "react-icons/fa6";
import FirmaPad from "./FirmaPad.jsx";
import FirmaConMovil from "./FirmaConMovil.jsx";
import InlineNotice from "../ui/InlineNotice.jsx";

// A fine pointer and no touch means a mouse: drawing with it is the worst way
// to sign, so the phone is offered first there.
const prefiereMovil = () =>
  typeof window !== "undefined"
  && Boolean(window.matchMedia?.("(pointer: fine)").matches)
  && !(navigator.maxTouchPoints > 0);

const MODOS = [
  { id: "movil", label: "Con el móvil", Icon: FaMobileScreenButton },
  { id: "dibujar", label: "Dibujar aquí", Icon: FaPenNib },
];

// The whole "make a signature" step: draw it here or on a phone through a QR.
// onListo({ blob, origen: "PANTALLA" | "MOVIL", url }) hands the PNG over; the
// caller decides what to do with it (save it to the account, keep it in a form).
export default function FirmaCaptura({ onListo, textoAceptar = "Guardar firma", ocupado = false, error = "" }) {
  const [modo, setModo] = useState(() => (prefiereMovil() ? "movil" : "dibujar"));
  const [tinta, setTinta] = useState(false);
  const [aviso, setAviso] = useState("");
  const padRef = useRef(null);

  const aceptarDibujo = async () => {
    setAviso("");
    const firma = await padRef.current?.obtener();
    if (!firma) {
      setAviso("La firma es demasiado pequeña. Dibújala un poco más grande.");
      return;
    }
    onListo({ blob: firma.blob, origen: "PANTALLA", url: URL.createObjectURL(firma.blob) });
  };

  return (
    <div>
      <div role="tablist" aria-label="Cómo quieres firmar" className="mb-4 inline-flex rounded-lg border border-surface-200 bg-surface-100 p-1">
        {MODOS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={modo === id}
            disabled={ocupado}
            onClick={() => {
              setModo(id);
              setAviso("");
            }}
            className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 ${
              modo === id ? "bg-white text-charcoal-950 shadow-card" : "text-muted hover:text-charcoal-900"
            }`}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {modo === "movil" ? (
        <FirmaConMovil onListo={onListo} textoAceptar={textoAceptar} ocupado={ocupado} />
      ) : (
        <>
          <FirmaPad ref={padRef} onTinta={setTinta} />
          <div className="mt-4 flex justify-end">
            <button type="button" className="btn btn-primary" onClick={aceptarDibujo} disabled={!tinta || ocupado}>
              {ocupado ? "Guardando…" : textoAceptar}
            </button>
          </div>
        </>
      )}
      <InlineNotice tone="error" className="mt-3">{aviso || error}</InlineNotice>
    </div>
  );
}
