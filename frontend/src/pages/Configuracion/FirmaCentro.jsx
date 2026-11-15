import { useCallback, useEffect, useRef, useState } from "react";
import { FaFileArrowUp, FaStamp } from "react-icons/fa6";
import { SeccionIntro } from "./Configuracion.jsx";
import InlineNotice from "../../components/ui/InlineNotice.jsx";
import { InlineLoading } from "../../components/ui/Loading.jsx";
import { cargarMiFirma, fechaFirma, guardarFirma, prepararImagenCentro } from "../../utils/firma.js";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

// Configuración › Firma del centro (ADMINISTRADOR): ONE image with the
// signature and the seal. Every administrator and coordinator signs with it;
// the audit trail still records who applied it to each document.
export default function FirmaCentro() {
  const toast = useToast();
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState("");
  const [archivo, setArchivo] = useState(null);
  const [quitarFondo, setQuitarFondo] = useState(true);
  const [previa, setPrevia] = useState(null); // { blob, url }
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef(null);

  const cargar = useCallback(() => {
    setError("");
    cargarMiFirma()
      .then(setEstado)
      .catch((err) => setError(err.message || "No se pudo cargar la firma del centro."));
  }, []);
  useEffect(cargar, [cargar]);

  // The chosen file is prepared in the browser (size, transparent background)
  // and shown before anything is sent.
  useEffect(() => {
    if (!archivo) {
      setPrevia(null);
      return undefined;
    }
    let vivo = true;
    let url = null;
    setAviso("");
    prepararImagenCentro(archivo, { quitarFondo })
      .then(({ blob }) => {
        if (!vivo) return;
        url = URL.createObjectURL(blob);
        setPrevia({ blob, url });
      })
      .catch((err) => {
        if (!vivo) return;
        setPrevia(null);
        setAviso(err.message || "No se puede usar esa imagen.");
      });
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [archivo, quitarFondo]);

  const elegir = (e) => {
    const file = e.target.files?.[0] || null;
    if (file && !/^image\/(png|jpeg)$/.test(file.type)) {
      setArchivo(null);
      setAviso("Usa una imagen PNG o JPG.");
      e.target.value = "";
      return;
    }
    setArchivo(file);
  };

  const descartar = () => {
    setArchivo(null);
    setAviso("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const guardar = async () => {
    if (!previa) return;
    setGuardando(true);
    try {
      setEstado(await guardarFirma({ blob: previa.blob, origen: "FICHERO", titular: "CENTRO" }));
      toast.success("Firma del centro guardada.");
      descartar();
    } catch (err) {
      setAviso(err.message || "No se pudo guardar la imagen.");
    } finally {
      setGuardando(false);
    }
  };

  if (error) {
    return (
      <div role="alert" className="form-card text-center">
        <p className="m-0 font-semibold text-charcoal-950">No se pudo cargar la firma del centro.</p>
        <p className="m-0 mt-2 text-sm text-muted">{error}</p>
        <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={cargar}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!estado) return <InlineLoading centrado>Cargando la firma del centro…</InlineLoading>;

  const actual = estado.firma;

  return (
    <>
      <SeccionIntro>
        La imagen con la firma y el sello del centro. Se inserta en los documentos cuando un administrador o un
        coordinador pulsa Firmar.
      </SeccionIntro>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="form-card mb-0">
          <h2 className="form-section-title">Firma actual</h2>
          {actual ? (
            <>
              <div className="firma-papel flex h-56 items-center justify-center rounded-xl border border-surface-200 p-5">
                <img src={actual.imagen} alt="Firma y sello del centro" className="max-h-full max-w-full object-contain" />
              </div>
              <p className="m-0 mt-3 text-xs leading-5 text-muted">
                Guardada el {fechaFirma(actual.creado_en)}. Los documentos ya firmados conservan la imagen con la que se firmaron.
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-surface-300 bg-surface-50 px-6 py-12 text-center">
              <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-700 shadow-card">
                <FaStamp className="h-4 w-4" />
              </span>
              <p className="m-0 max-w-sm text-sm leading-6 text-charcoal-800">
                Todavía no hay firma del centro. Hasta que la subas, el personal no puede firmar documentos.
              </p>
            </div>
          )}
        </section>

        <section className="form-card mb-0">
          <h2 className="form-section-title">{actual ? "Sustituir la imagen" : "Subir la imagen"}</h2>
          <p className="-mt-1 mb-4 text-sm leading-6 text-muted">
            Un PNG o JPG con la firma y el sello juntos, como quedan en papel. Cuanto más ajustada al dibujo, mejor.
          </p>
          <label className="file-upload min-h-11 px-3 py-2.5">
            <FaFileArrowUp className="file-upload-icon" aria-hidden="true" />
            <span className="file-upload-text text-sm">{archivo ? archivo.name : "Seleccionar imagen (PNG o JPG)"}</span>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg" aria-label="Imagen de la firma del centro" onChange={elegir} />
          </label>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-charcoal-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
              checked={quitarFondo}
              onChange={(e) => setQuitarFondo(e.target.checked)}
            />
            <span>
              Quitar el fondo blanco
              <span className="block text-xs leading-5 text-muted">Recomendado si es una foto o un escaneado: el texto del documento se ve a través, como con un sello de verdad.</span>
            </span>
          </label>

          {previa && (
            <div className="mt-5 animate-fade-in">
              <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Así quedará en un documento</p>
              {/* A sample signature block, the proportions of the box a template reserves. */}
              <div className="rounded-xl border border-surface-200 bg-white px-5 py-4 text-[13px] leading-5 text-charcoal-800">
                <p className="m-0">…y en prueba de conformidad, las partes firman el presente documento.</p>
                <p className="m-0 mt-3 font-semibold">Por el centro</p>
                <div className="mt-1 flex h-28 w-48 items-center justify-center">
                  <img src={previa.url} alt="Vista previa de la firma del centro" className="max-h-full max-w-full object-contain" />
                </div>
              </div>
            </div>
          )}
          <InlineNotice tone="error" className="mt-3">{aviso}</InlineNotice>

          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-surface-200 pt-4 sm:flex-row sm:justify-end">
            {archivo && (
              <button type="button" className="btn btn-secondary" onClick={descartar} disabled={guardando}>
                Descartar
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={guardar} disabled={!previa || guardando}>
              {guardando ? "Guardando…" : actual ? "Sustituir firma del centro" : "Guardar firma del centro"}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
