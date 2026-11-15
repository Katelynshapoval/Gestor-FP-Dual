import { useEffect, useRef, useState } from "react";
import { InlineLoading } from "../ui/Loading.jsx";

// pdf.js is heavy: it is downloaded only when a page is first drawn.
let libreria = null;
export function cargarPdfjs() {
  if (!libreria) {
    libreria = Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(
      ([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      },
    );
    libreria.catch(() => {
      libreria = null;
    });
  }
  return libreria;
}

const MAX_PX = 1800; // enough for a sharp A4 on a dense screen

// Draws ONE page of a PDF on a canvas and lays boxes over it.
//   documento  () => Promise<PDFDocumentProxy> (the caller caches it)
//   pagina     page number, or "ultima"
//   marcas     [{ clave, p, x, y, w, h, src, etiqueta }] in PDF points from the
//              bottom-left corner; only those of the page shown are drawn
//   ampliada   false: the whole page fits the box · true: page width, scrolls
//   onPagina({ pagina, paginas })
export default function PaginaPdf({ documento, pagina = "ultima", marcas = [], ampliada = false, onPagina, descripcion }) {
  const canvasRef = useRef(null);
  const cajaRef = useRef(null);
  const [estado, setEstado] = useState("cargando"); // cargando | lista | error
  const [hoja, setHoja] = useState(null); // { ancho, alto, pagina } in points
  const onPaginaRef = useRef(onPagina);
  onPaginaRef.current = onPagina;

  useEffect(() => {
    let vivo = true;
    let tarea = null;
    setEstado("cargando");
    (async () => {
      try {
        await cargarPdfjs();
        const doc = await documento();
        if (!vivo) return;
        const numero = pagina === "ultima" ? doc.numPages : Math.min(Math.max(1, pagina), doc.numPages);
        const page = await doc.getPage(numero);
        if (!vivo) return;
        const base = page.getViewport({ scale: 1 });
        const escala = Math.min(MAX_PX / base.width, 3);
        const viewport = page.getViewport({ scale: escala });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        tarea = page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport });
        await tarea.promise;
        if (!vivo) return;
        setHoja({ ancho: base.width, alto: base.height, pagina: numero });
        setEstado("lista");
        onPaginaRef.current?.({ pagina: numero, paginas: doc.numPages });
      } catch (err) {
        if (vivo && err?.name !== "RenderingCancelledException") setEstado("error");
      }
    })();
    return () => {
      vivo = false;
      tarea?.cancel?.();
    };
  }, [documento, pagina]);

  // Zoomed in, bring the signature into view.
  useEffect(() => {
    if (estado !== "lista" || !ampliada) return;
    cajaRef.current?.querySelector("[data-marca]")?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [estado, ampliada, marcas]);

  // The page is sized in pixels from the box it has: whole page (contained)
  // or, zoomed in, the width of the box.
  const [caja, setCaja] = useState(null);
  useEffect(() => {
    const el = cajaRef.current;
    if (!el) return undefined;
    const medir = () => setCaja({ ancho: el.clientWidth, alto: el.clientHeight });
    medir();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(medir) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);

  const visibles = hoja ? marcas.filter((m) => m.p === hoja.pagina) : [];
  const razon = hoja ? hoja.ancho / hoja.alto : 210 / 297;
  let tam = null;
  if (caja?.ancho) {
    if (ampliada) {
      const ancho = Math.min(caja.ancho, 960);
      tam = { width: ancho, height: ancho / razon };
    } else {
      const alto = Math.min(caja.alto || caja.ancho / razon, caja.ancho / razon);
      tam = { width: alto * razon, height: alto };
    }
  }

  return (
    <div ref={cajaRef} className={`absolute inset-3 flex justify-center sm:inset-5 ${ampliada ? "items-start overflow-auto" : "items-center overflow-hidden"}`}>
      <div
        className={`relative bg-white shadow-[0_10px_40px_-18px_rgb(17_17_16/0.55)] ring-1 ring-black/5 transition-opacity duration-200 ${estado === "lista" ? "opacity-100" : "opacity-0"} shrink-0`}
        style={tam || { width: 0, height: 0 }}
      >
        <canvas ref={canvasRef} role="img" aria-label={descripcion || "Página del documento"} className="block h-full w-full" />
        {visibles.map((m) => (
          <div
            key={m.clave}
            data-marca={m.clave}
            className="absolute"
            style={{
              left: `${(m.x / hoja.ancho) * 100}%`,
              bottom: `${(m.y / hoja.alto) * 100}%`,
              width: `${(m.w / hoja.ancho) * 100}%`,
              height: `${(m.h / hoja.alto) * 100}%`,
            }}
          >
            <span className="absolute -inset-1 rounded-md border-2 border-dashed border-brand-500/70 bg-brand-50/40 animate-fade-in" />
            {m.src && <img src={m.src} alt="" className="relative h-full w-full object-contain opacity-80" />}
            {m.etiqueta && (
              <span className="absolute -bottom-1.5 left-0 translate-y-full whitespace-nowrap rounded bg-brand-700 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-card">
                {m.etiqueta}
              </span>
            )}
          </div>
        ))}
      </div>
      {estado !== "lista" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          {estado === "error" ? "No se pudo mostrar este documento." : <InlineLoading>Cargando documento…</InlineLoading>}
        </div>
      )}
    </div>
  );
}
