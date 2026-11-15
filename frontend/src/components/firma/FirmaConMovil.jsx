import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { FaArrowsRotate, FaCheck, FaMobileScreenButton } from "react-icons/fa6";
import { InlineLoading } from "../ui/Loading.jsx";
import InlineNotice from "../ui/InlineNotice.jsx";
import {
  cerrarSesionMovil, crearSesionMovil, dataUrlToBlob, direccionLocal, leerSesionMovil,
} from "../../utils/firma.js";

const reloj = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// "Sign with the phone": this computer shows a QR; the phone opens a page with
// only the pad and sends one drawing; it appears here to accept or repeat.
// The code lasts 10 minutes and works once. Nothing is saved until the person
// accepts the drawing on this screen (onListo).
export default function FirmaConMovil({ onListo, textoAceptar = "Usar esta firma", ocupado = false }) {
  const [fase, setFase] = useState("creando"); // creando | esperando | recibida | caducada | error | local
  const [qr, setQr] = useState("");
  const [enlace, setEnlace] = useState("");
  const [segundos, setSegundos] = useState(0);
  const [imagen, setImagen] = useState(null);
  const [error, setError] = useState("");
  const sesionRef = useRef(null);
  const [intento, setIntento] = useState(0);

  const cerrar = useCallback(() => {
    if (sesionRef.current) cerrarSesionMovil(sesionRef.current);
    sesionRef.current = null;
  }, []);

  useEffect(() => {
    if (direccionLocal()) {
      setFase("local");
      return undefined;
    }
    let vivo = true;
    let timer = null;
    setFase("creando");
    setImagen(null);
    setError("");

    const consultar = async () => {
      if (!vivo || !sesionRef.current) return;
      try {
        const data = await leerSesionMovil(sesionRef.current);
        if (!vivo) return;
        if (data.estado === "RECIBIDA") {
          setImagen(data.imagen);
          setFase("recibida");
          return;
        }
        if (data.estado !== "ABIERTA") {
          setFase("caducada");
          return;
        }
        setSegundos(data.segundos ?? 0);
      } catch (err) {
        if (!vivo) return;
        if (err.status === 404) {
          setFase("caducada");
          return;
        }
        // A network blip: keep asking.
      }
      timer = setTimeout(consultar, 2000);
    };

    (async () => {
      try {
        const sesion = await crearSesionMovil();
        if (!vivo) {
          cerrarSesionMovil(sesion);
          return;
        }
        sesionRef.current = sesion;
        // The secret travels in the fragment: browsers never send it to a server log.
        const url = `${window.location.origin}/firma-movil#${sesion.token}`;
        setEnlace(url);
        setQr(await QRCode.toDataURL(url, { margin: 1, width: 440, errorCorrectionLevel: "M", color: { dark: "#111110", light: "#ffffff" } }));
        setSegundos(sesion.minutos * 60);
        setFase("esperando");
        timer = setTimeout(consultar, 2000);
      } catch (err) {
        if (!vivo) return;
        setError(err.message || "No se pudo generar el código.");
        setFase("error");
      }
    })();

    return () => {
      vivo = false;
      clearTimeout(timer);
      cerrar();
    };
  }, [intento, cerrar]);

  // The countdown moves every second between two answers of the server.
  useEffect(() => {
    if (fase !== "esperando") return undefined;
    const id = setInterval(() => setSegundos((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [fase]);

  const repetir = () => setIntento((n) => n + 1);

  if (fase === "local") {
    return (
      <InlineNotice tone="warning">
        Has abierto la aplicación en <strong>localhost</strong>, una dirección que solo existe en este ordenador: el
        móvil no puede abrirla. Entra con la dirección de red del ordenador (por ejemplo http://192.168.1.20:3000) o
        dibuja la firma aquí.
      </InlineNotice>
    );
  }

  if (fase === "recibida") {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
          <FaCheck aria-hidden="true" className="h-3.5 w-3.5" /> Firma recibida del móvil
        </div>
        <div className="firma-papel mt-3 flex h-44 items-center justify-center rounded-xl border border-surface-200 p-4">
          <img src={imagen} alt="Firma recibida" className="max-h-full max-w-full object-contain" />
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={repetir} disabled={ocupado}>
            <FaArrowsRotate aria-hidden="true" className="h-3.5 w-3.5" /> Repetir
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={ocupado}
            onClick={() => onListo({ blob: dataUrlToBlob(imagen), origen: "MOVIL", url: imagen })}
          >
            {ocupado ? "Guardando…" : textoAceptar}
          </button>
        </div>
      </div>
    );
  }

  if (fase === "caducada" || fase === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="m-0 font-semibold text-charcoal-950">
          {fase === "error" ? "No se pudo generar el código." : "El código ha caducado."}
        </p>
        <p className="m-0 max-w-sm text-sm text-muted">
          {fase === "error" ? error : "Por seguridad cada código dura 10 minutos y sirve una sola vez."}
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={repetir}>
          <FaArrowsRotate aria-hidden="true" className="h-3 w-3" /> Generar otro código
        </button>
      </div>
    );
  }

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-xl border border-surface-200 bg-white p-2 shadow-card">
        {fase === "creando" || !qr ? (
          <InlineLoading>Generando código…</InlineLoading>
        ) : (
          <img src={qr} alt="Código QR para firmar con el móvil" className="h-full w-full" />
        )}
      </div>
      <div className="min-w-0">
        <ol className="m-0 list-none space-y-3 p-0 text-sm text-charcoal-800">
          {["Abre la cámara del móvil y apunta al código.", "Dibuja tu firma con el dedo y pulsa Enviar.", "La firma aparece aquí para que la aceptes."].map((paso, i) => (
            <li key={paso} className="flex gap-3">
              <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-charcoal-950 text-xs font-semibold text-white">
                {i + 1}
              </span>
              <span className="pt-0.5 leading-5">{paso}</span>
            </li>
          ))}
        </ol>
        <p className="m-0 mt-4 flex items-center gap-2 text-xs text-muted" role="status">
          <span aria-hidden="true" className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
          </span>
          Esperando al móvil… el código caduca en {reloj(segundos)}
        </p>
        {enlace && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname) && (
          <p className="m-0 mt-2 flex items-center gap-1.5 text-xs text-muted">
            <FaMobileScreenButton aria-hidden="true" className="h-3 w-3 shrink-0" />
            El móvil tiene que estar en la misma red que esta dirección.
          </p>
        )}
      </div>
    </div>
  );
}
