import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { FaEraser, FaRotateLeft } from "react-icons/fa6";
import { TINTA, recortarFirma } from "../../utils/firma.js";

// The drawing surface: finger, stylus or mouse, with smooth pressure-aware
// strokes (signature_pad). The canvas follows the size of its box and the
// screen's pixel density, so the saved image is sharp.
//   ref.obtener() → { blob, ancho, alto } | null (empty or a mere dot)
//   onTinta(hayTinta) tells the parent when "save" makes sense.
// `alto`: Tailwind height classes of the surface.
const FirmaPad = forwardRef(function FirmaPad(
  { onTinta, alto = "h-48 sm:h-56", etiqueta = "Zona para dibujar la firma", className = "" },
  ref,
) {
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const [tinta, setTinta] = useState(false);
  const onTintaRef = useRef(onTinta);
  onTintaRef.current = onTinta;

  const avisar = () => {
    const hay = Boolean(padRef.current && !padRef.current.isEmpty());
    setTinta(hay);
    onTintaRef.current?.(hay);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let pad;
    try {
      pad = new SignaturePad(canvas, { penColor: TINTA, minWidth: 0.9, maxWidth: 2.8, throttle: 8 });
    } catch {
      return undefined; // no canvas support (very old browser): the phone option remains
    }
    padRef.current = pad;
    pad.addEventListener("endStroke", avisar);

    // Size in device pixels; the strokes are kept across a resize or rotation.
    const ajustar = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const datos = pad.toData();
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.getContext("2d").scale(ratio, ratio);
      pad.clear();
      if (datos.length) pad.fromData(datos);
    };
    ajustar();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(ajustar) : null;
    observer?.observe(canvas);
    return () => {
      observer?.disconnect();
      pad.off();
      padRef.current = null;
    };
    // The pad is created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const limpiar = () => {
    padRef.current?.clear();
    avisar();
  };
  const deshacer = () => {
    const pad = padRef.current;
    if (!pad) return;
    const datos = pad.toData();
    datos.pop();
    pad.fromData(datos);
    avisar();
  };

  useImperativeHandle(ref, () => ({
    limpiar,
    obtener: async () => {
      if (!padRef.current || padRef.current.isEmpty()) return null;
      return recortarFirma(canvasRef.current);
    },
  }));

  return (
    <div className={className}>
      <div className={`relative overflow-hidden rounded-xl border-2 border-dashed bg-white transition-colors duration-150 ${tinta ? "border-charcoal-300" : "border-surface-300"} ${alto}`}>
        {/* Paper cues: a baseline with a cross, and a hint that leaves with the first stroke. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-[26%] flex items-end gap-2 sm:inset-x-10">
          <span className="pb-0.5 text-lg leading-none text-charcoal-300">×</span>
          <span className="h-px flex-1 bg-surface-300" />
        </div>
        <p
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-[34%] m-0 text-center text-sm text-charcoal-400 transition-opacity duration-200 ${tinta ? "opacity-0" : "opacity-100"}`}
        >
          Firma aquí con el dedo, un lápiz o el ratón
        </p>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={etiqueta}
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none select-none"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="m-0 text-xs text-muted">{tinta ? "Si no te convence, borra y repite." : "Hazla como en papel: se usará en tus documentos."}</p>
        <div className="flex shrink-0 gap-1.5">
          <button type="button" className="btn btn-ghost btn-sm" onClick={deshacer} disabled={!tinta}>
            <FaRotateLeft aria-hidden="true" className="h-3 w-3" /> Deshacer
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={limpiar} disabled={!tinta}>
            <FaEraser aria-hidden="true" className="h-3 w-3" /> Borrar
          </button>
        </div>
      </div>
    </div>
  );
});

export default FirmaPad;
