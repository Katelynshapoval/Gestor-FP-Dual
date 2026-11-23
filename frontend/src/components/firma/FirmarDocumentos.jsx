import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaArrowUpRightFromSquare, FaCheck, FaChevronLeft, FaChevronRight, FaCircleCheck, FaCircleXmark,
  FaMagnifyingGlassMinus, FaMagnifyingGlassPlus, FaPenNib, FaRegClock,
} from "react-icons/fa6";
import Modal from "../ui/Modal.jsx";
import InlineNotice from "../ui/InlineNotice.jsx";
import { InlineLoading } from "../ui/Loading.jsx";
import PaginaPdf, { cargarPdfjs } from "./PaginaPdf.jsx";
import FirmaCaptura from "./FirmaCaptura.jsx";
import FirmaDialog from "./FirmaDialog.jsx";
import { getBlob, getJSON, postJSON } from "../../utils/api.js";
import { cargarMiFirma, guardarFirma } from "../../utils/firma.js";
import { tipoContratoLabel } from "../../utils/labels.js";
import { useUser } from "../../context/UserContext.jsx";
import { useConfirm, useToast } from "../feedback/ToastProvider.jsx";
import { isStaff } from "../../navigation.js";

// "Firmar documentos" (docs/tecnica/logica-de-negocio/documentos-y-firmas.md § 4.3): every document the person
// can sign, one page at a time with arrows, their signature shown where it
// will go, and ONE button to sign them all. The single "Firmar" buttons of the
// app open this same dialog with one document.
//
//   const { abrirFirma } = useFirmarDocumentos();
//   abrirFirma({ ids: [12], onDone: refresh });   // ids optional: all pending
const Contexto = createContext({ abrirFirma: () => {}, version: 0 });
export const useFirmarDocumentos = () => useContext(Contexto);

// How many documents wait for the caller's signature. It refreshes after every
// signing anywhere in the app.
export function usePendientesFirma(activo = true) {
  const { version } = useFirmarDocumentos();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!activo) return undefined;
    let vivo = true;
    getJSON("/documentos/pendientes-firma")
      .then((data) => vivo && setN(Array.isArray(data?.items) ? data.items.length : 0))
      .catch(() => vivo && setN(0));
    return () => {
      vivo = false;
    };
  }, [activo, version]);
  return n;
}

export function FirmarDocumentosProvider({ children }) {
  const [peticion, setPeticion] = useState(null);
  const [version, setVersion] = useState(0);
  const abrirFirma = useCallback((opciones = {}) => setPeticion({ ...opciones, clave: Date.now() }), []);
  const valor = useMemo(() => ({ abrirFirma, version }), [abrirFirma, version]);
  return (
    <Contexto.Provider value={valor}>
      {children}
      {peticion && (
        <FirmarDocumentosDialog
          key={peticion.clave}
          ids={peticion.ids}
          onClose={() => setPeticion(null)}
          onFirmado={() => {
            setVersion((v) => v + 1);
            peticion.onDone?.();
          }}
        />
      )}
    </Contexto.Provider>
  );
}

// The button that opens it; hidden while there is nothing to sign.
export function FirmarTodoBoton({ onDone, className = "btn btn-primary", children }) {
  const { user } = useUser();
  const { abrirFirma } = useFirmarDocumentos();
  const n = usePendientesFirma(Boolean(user));
  if (!n) return null;
  return (
    <button type="button" className={className} onClick={() => abrirFirma({ onDone })}>
      <FaPenNib aria-hidden="true" className="h-3.5 w-3.5" />
      {children || (n === 1 ? "Firmar 1 documento" : `Firmar ${n} documentos`)}
    </button>
  );
}

const MARCAS_DE = { ALUMNO: "ALUMNO", EMPRESA: "EMPRESA" };
const marcaPropia = (user) => (isStaff(user) ? "CENTRO" : MARCAS_DE[user?.rol]);

function contexto(item) {
  return [item.alumno, item.empresa].filter(Boolean).join(" · ");
}

function FirmarDocumentosDialog({ ids, onClose, onFirmado }) {
  const { user } = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const [fase, setFase] = useState("cargando"); // cargando | error | revisar | firmando | resultado
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [firma, setFirma] = useState(null);
  const [indice, setIndice] = useState(0);
  const [excluidos, setExcluidos] = useState(() => new Set());
  const [tipo, setTipo] = useState("");
  const [ampliada, setAmpliada] = useState(false);
  const [paginas, setPaginas] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [cambiando, setCambiando] = useState(null); // "USUARIO" | "TUTOR"
  const [guardando, setGuardando] = useState(false);
  const cache = useRef(new Map()); // id → { blob: Promise<Blob>, doc: Promise<PDFDocumentProxy> }
  const staff = isStaff(user);
  const uno = Array.isArray(ids) && ids.length === 1;

  const cargar = useCallback(async () => {
    setFase("cargando");
    setError("");
    try {
      const [pendientes, mia] = await Promise.all([getJSON("/documentos/pendientes-firma"), cargarMiFirma()]);
      let lista = Array.isArray(pendientes?.items) ? pendientes.items : [];
      if (Array.isArray(ids)) lista = lista.filter((item) => ids.includes(item.id_documento));
      setItems(lista);
      setFirma(mia);
      setIndice(0);
      setFase("revisar");
    } catch (err) {
      setError(err.message || "No se pudieron cargar los documentos.");
      setFase("error");
    }
  }, [ids]);

  useEffect(() => {
    cargar();
    cargarPdfjs().catch(() => {});
    const guardados = cache.current;
    return () => {
      guardados.forEach((entrada) => entrada.doc.then((doc) => doc.destroy?.()).catch(() => {}));
      guardados.clear();
    };
  }, [cargar]);

  const tipos = useMemo(() => {
    const cuenta = new Map();
    for (const item of items) cuenta.set(item.nombre, (cuenta.get(item.nombre) || 0) + 1);
    return [...cuenta.entries()];
  }, [items]);
  const visibles = useMemo(() => (tipo ? items.filter((item) => item.nombre === tipo) : items), [items, tipo]);
  const actual = visibles[Math.min(indice, Math.max(visibles.length - 1, 0))] || null;
  const seleccion = visibles.filter((item) => !excluidos.has(item.id_documento));

  const entrada = useCallback((id) => {
    if (!cache.current.has(id)) {
      const blob = getBlob(`/documentos/${id}/descargar`);
      const doc = blob.then(async (b) => {
        const pdfjs = await cargarPdfjs();
        return pdfjs.getDocument({ data: await b.arrayBuffer() }).promise;
      });
      doc.catch(() => cache.current.delete(id));
      cache.current.set(id, { blob, doc });
    }
    return cache.current.get(id);
  }, []);

  // The next document is fetched ahead, so the arrow answers at once.
  useEffect(() => {
    const siguiente = visibles[indice + 1];
    if (fase === "revisar" && siguiente) entrada(siguiente.id_documento);
  }, [fase, indice, visibles, entrada]);

  const ir = useCallback(
    (paso) => setIndice((i) => Math.min(Math.max(i + paso, 0), Math.max(visibles.length - 1, 0))),
    [visibles.length],
  );

  // ← → move between documents (not while typing or drawing).
  useEffect(() => {
    if (fase !== "revisar") return undefined;
    const onKey = (event) => {
      if (event.target.closest?.("input, textarea, select, canvas")) return;
      if (event.key === "ArrowLeft") ir(-1);
      if (event.key === "ArrowRight") ir(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fase, ir]);

  const toque = useRef(null);
  const onTouchStart = (e) => {
    toque.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  };
  const onTouchEnd = (e) => {
    const inicio = toque.current;
    toque.current = null;
    if (!inicio || ampliada) return;
    const dx = e.changedTouches[0].clientX - inicio.x;
    const dy = e.changedTouches[0].clientY - inicio.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) ir(dx < 0 ? 1 : -1);
  };

  const documentoActual = useCallback(() => entrada(actual.id_documento).doc, [entrada, actual?.id_documento]);
  const propia = marcaPropia(user);
  const marcas = useMemo(() => {
    if (!actual || !firma?.firma) return [];
    const lista = [];
    const m = actual.marcas?.[propia];
    if (m) lista.push({ clave: propia, ...m, src: firma.firma.imagen, etiqueta: staff ? "Firma del centro" : "Tu firma" });
    const t = actual.marcas?.TUTOR;
    if (t && firma.requiere_tutor && firma.firma_tutor) {
      lista.push({ clave: "TUTOR", ...t, src: firma.firma_tutor.imagen, etiqueta: "Tutor/a legal" });
    }
    return lista;
  }, [actual, firma, propia, staff]);
  const enHoja = actual && !actual.marcas?.[propia];
  const paginaMostrada = actual?.marcas?.[propia]?.p || "ultima";

  const verCompleto = async () => {
    try {
      const blob = await entrada(actual.id_documento).blob;
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error(err.message || "No se pudo abrir el documento.");
    }
  };

  const firmar = async (lista = seleccion) => {
    const n = lista.length;
    if (!n) return;
    const aceptado = await confirm({
      title: "Confirmar firma",
      message: `${
        staff ? "Se insertará la firma y el sello del centro" : firma?.requiere_tutor ? "Se insertará tu firma y la de tu tutor o tutora legal" : "Se insertará tu firma"
      } en ${n === 1 ? "el documento" : `los ${n} documentos`}. Queda registrado quién firma y cuándo.`,
      confirmLabel: n === 1 ? "Firmar" : `Firmar ${n}`,
      tone: "accion",
    });
    if (!aceptado) return;
    setFase("firmando");
    try {
      const data = await postJSON("/documentos/firmar-lote", { ids: lista.map((item) => item.id_documento) });
      onFirmado?.();
      if (!data.fallidos) {
        toast.success(data.message || "Documentos firmados.");
        onClose();
        return;
      }
      setResultado({ ...data, lista });
      setFase("resultado");
    } catch (err) {
      // The saved signature disappeared meanwhile (deleted in another tab).
      if (String(err.code || "").startsWith("SIN_FIRMA")) {
        await cargar();
        return;
      }
      toast.error(err.message || "No se pudieron firmar los documentos.");
      setFase("revisar");
    }
  };

  const guardarAqui = (titular) => async ({ blob, origen }) => {
    setGuardando(true);
    setError("");
    try {
      setFirma(await guardarFirma({ blob, origen, titular }));
    } catch (err) {
      setError(err.message || "No se pudo guardar la firma.");
    } finally {
      setGuardando(false);
    }
  };

  // ── What is missing before anything can be signed ────────────────────────
  const faltaCentro = staff && firma && !firma.firma;
  const faltaPropia = !staff && firma && !firma.firma;
  const faltaTutor = !staff && firma?.firma && firma.requiere_tutor && !firma.firma_tutor;
  const preparada = firma && !faltaCentro && !faltaPropia && !faltaTutor;

  const titulo = uno && actual ? `Firmar ${actual.nombre}` : "Firmar documentos";
  const descripcion =
    fase === "revisar" && preparada && visibles.length > 1
      ? `Documento ${Math.min(indice, visibles.length - 1) + 1} de ${visibles.length}`
      : undefined;

  let cuerpo;
  let pie = null;
  let size = "full";

  if (fase === "cargando") {
    size = "md";
    cuerpo = (
      <div className="flex min-h-40 items-center justify-center">
        <InlineLoading>Buscando documentos por firmar…</InlineLoading>
      </div>
    );
  } else if (fase === "error") {
    size = "md";
    cuerpo = (
      <div className="py-6 text-center">
        <p className="m-0 font-semibold text-charcoal-950">No se pudieron cargar los documentos.</p>
        <p className="m-0 mt-1 text-sm text-muted">{error}</p>
        <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={cargar}>
          Reintentar
        </button>
      </div>
    );
  } else if (!items.length) {
    size = "md";
    cuerpo = (
      <div className="py-8 text-center">
        <FaCircleCheck aria-hidden="true" className="mx-auto h-10 w-10 text-green-600" />
        <p className="m-0 mt-4 font-semibold text-charcoal-950">
          {uno ? "Este documento ya no está pendiente de tu firma." : "No tienes documentos pendientes de firma."}
        </p>
        <p className="m-0 mt-1 text-sm text-muted">Cuando haya uno nuevo aparecerá aquí.</p>
      </div>
    );
    pie = (
      <button type="button" className="btn btn-secondary" onClick={onClose}>
        Cerrar
      </button>
    );
  } else if (faltaCentro) {
    size = "md";
    cuerpo = (
      <div className="py-4">
        <InlineNotice tone="warning">
          Falta la firma del centro: la imagen con la firma y el sello que se inserta en los documentos.
        </InlineNotice>
        <p className="m-0 mt-4 text-sm leading-6 text-charcoal-800">
          {firma.puede_cambiar
            ? "Súbela una vez en Configuración y todo el personal del centro firmará con ella."
            : "Pide a un administrador que la suba en Configuración › Firma del centro. Después podrás firmar."}
        </p>
      </div>
    );
    pie = (
      <>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cerrar
        </button>
        {firma.puede_cambiar && (
          <Link className="btn btn-primary" to="/configuracion/firma" onClick={onClose}>
            Subir la firma del centro
          </Link>
        )}
      </>
    );
  } else if (faltaPropia || faltaTutor) {
    size = "lg";
    cuerpo = (
      <div>
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-surface-200 bg-surface-50 px-4 py-3">
          <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <FaPenNib className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-sm font-semibold text-charcoal-950">
              {faltaTutor ? "Ahora, la firma de tu tutor o tutora legal" : "Antes de firmar, crea tu firma"}
            </p>
            <p className="m-0 mt-0.5 text-sm leading-6 text-charcoal-700">
              {faltaTutor
                ? `Eres menor de edad, así que ${firma.tutor_nombre || "tu tutor o tutora legal"} firma contigo. Tiene que hacerla en persona; también se pide una sola vez.`
                : `Solo se pide una vez. Después ${items.length === 1 ? "firmas el documento" : `firmas los ${items.length} documentos`} con un clic.`}
            </p>
          </div>
        </div>
        <FirmaCaptura
          key={faltaTutor ? "tutor" : "propia"}
          onListo={guardarAqui(faltaTutor ? "TUTOR" : "USUARIO")}
          textoAceptar="Guardar y continuar"
          ocupado={guardando}
          error={error}
        />
      </div>
    );
  } else if (fase === "resultado" && resultado) {
    size = "md";
    const porId = new Map(resultado.lista.map((item) => [item.id_documento, item]));
    const fallidos = resultado.resultados.filter((r) => !r.ok);
    cuerpo = (
      <div>
        <p className="m-0 text-sm text-charcoal-800">
          <strong className="font-semibold text-charcoal-950">{resultado.firmados}</strong> de {resultado.resultados.length}{" "}
          documentos firmados. {fallidos.length === 1 ? "Uno no se ha podido firmar:" : `${fallidos.length} no se han podido firmar:`}
        </p>
        <ul className="m-0 mt-4 list-none divide-y divide-surface-200 overflow-hidden rounded-lg border border-surface-200 p-0">
          {resultado.resultados.map((r) => {
            const item = porId.get(r.id_documento);
            return (
              <li key={r.id_documento} className="flex items-start gap-3 px-4 py-3">
                {r.ok ? (
                  <FaCircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <FaCircleXmark aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                )}
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold text-charcoal-950">
                    {item?.nombre}
                    {item && contexto(item) ? <span className="font-normal text-muted"> · {contexto(item)}</span> : null}
                  </p>
                  {!r.ok && <p className="m-0 mt-0.5 text-xs leading-5 text-red-700">{r.message}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
    pie = (
      <button type="button" className="btn btn-primary" onClick={onClose}>
        Entendido
      </button>
    );
  } else if (actual) {
    const posicion = Math.min(indice, visibles.length - 1);
    const incluido = !excluidos.has(actual.id_documento);
    const firmando = fase === "firmando";
    cuerpo = (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* The page */}
        <div className="relative flex shrink-0 flex-col bg-surface-100 lg:min-h-0 lg:flex-1 lg:shrink">
          {tipos.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto border-b border-surface-200 bg-white px-3 py-2" role="group" aria-label="Tipo de documento">
              {[["", `Todos`, items.length], ...tipos.map(([nombre, n]) => [nombre, nombre, n])].map(([valor, etiqueta, n]) => (
                <button
                  key={valor || "todos"}
                  type="button"
                  aria-pressed={tipo === valor}
                  onClick={() => {
                    setTipo(valor);
                    setIndice(0);
                  }}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 ${
                    tipo === valor ? "border-charcoal-950 bg-charcoal-950 text-white" : "border-surface-200 bg-white text-charcoal-700 hover:border-charcoal-300"
                  }`}
                >
                  {etiqueta} <span className={tipo === valor ? "text-white/70" : "text-muted"}>{n}</span>
                </button>
              ))}
            </div>
          )}
          <div
            className="relative h-[52vh] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <PaginaPdf
              key={actual.id_documento}
              documento={documentoActual}
              pagina={paginaMostrada}
              marcas={marcas}
              ampliada={ampliada}
              onPagina={setPaginas}
              descripcion={`${actual.nombre}${contexto(actual) ? `, ${contexto(actual)}` : ""}`}
            />
            {visibles.length > 1 && (
              <>
                <Flecha lado="izquierda" onClick={() => ir(-1)} disabled={posicion === 0 || firmando} />
                <Flecha lado="derecha" onClick={() => ir(1)} disabled={posicion === visibles.length - 1 || firmando} />
              </>
            )}
            <button
              type="button"
              onClick={() => setAmpliada((v) => !v)}
              className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-surface-200 bg-white text-charcoal-700 shadow-card transition-colors hover:text-charcoal-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 sm:bottom-6 sm:right-6"
              aria-label={ampliada ? "Ver la página entera" : "Ampliar la página"}
              title={ampliada ? "Ver la página entera" : "Ampliar"}
            >
              {ampliada ? <FaMagnifyingGlassMinus aria-hidden="true" className="h-3.5 w-3.5" /> : <FaMagnifyingGlassPlus aria-hidden="true" className="h-3.5 w-3.5" />}
            </button>
          </div>
          {visibles.length > 1 && (
            <div className="flex items-center justify-center gap-3 border-t border-surface-200 bg-white px-3 py-2">
              {visibles.length <= 14 ? (
                <div className="flex items-center gap-1.5" role="group" aria-label="Documentos">
                  {visibles.map((item, i) => (
                    <button
                      key={item.id_documento}
                      type="button"
                      onClick={() => setIndice(i)}
                      aria-label={`Documento ${i + 1}: ${item.nombre}${contexto(item) ? `, ${contexto(item)}` : ""}`}
                      aria-current={i === posicion ? "true" : undefined}
                      className={`h-2 rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                        i === posicion ? "w-6 bg-brand-700" : excluidos.has(item.id_documento) ? "w-2 bg-surface-300" : "w-2 bg-charcoal-300 hover:bg-charcoal-500"
                      }`}
                    />
                  ))}
                </div>
              ) : (
                <p className="m-0 text-xs font-semibold tabular-nums text-charcoal-700" role="status">
                  {posicion + 1} / {visibles.length}
                </p>
              )}
            </div>
          )}
        </div>

        {/* The document and the signature */}
        <aside className="flex flex-col border-t border-surface-200 bg-white lg:w-80 lg:shrink-0 lg:border-l lg:border-t-0" aria-label="Documento seleccionado">
          <div className="space-y-4 px-4 py-4 sm:px-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <div>
              <p className="m-0 font-display text-base font-semibold text-charcoal-950">{actual.nombre}</p>
              {contexto(actual) && <p className="m-0 mt-1 text-sm leading-5 text-charcoal-800">{contexto(actual)}</p>}
              <p className="m-0 mt-1 text-xs leading-5 text-muted">
                {[actual.especialidad, tipoContratoLabel(actual.tipo_contrato), actual.convocatoria].filter(Boolean).join(" · ")}
              </p>
            </div>

            <ul className="m-0 list-none space-y-1.5 p-0" aria-label="Firmas del documento">
              {(actual.firmas || []).map((f) => (
                <li key={f.rol} className="flex items-center gap-2 text-sm">
                  {f.estado === "FIRMADO" ? (
                    <FaCheck aria-hidden="true" className="h-3 w-3 shrink-0 text-green-600" />
                  ) : (
                    <FaRegClock aria-hidden="true" className="h-3 w-3 shrink-0 text-amber-600" />
                  )}
                  <span className="font-semibold text-charcoal-800">{f.rol_label}</span>
                  <span className={f.estado === "FIRMADO" ? "text-green-700" : "text-amber-800"}>
                    {f.estado === "FIRMADO" ? "firmado" : (f.rol === "GESTOR" ? staff : f.rol === user?.rol) ? "te toca" : "pendiente"}
                  </span>
                </li>
              ))}
            </ul>

            {paginas && (
              <p className="m-0 text-xs text-muted">
                {enHoja
                  ? `Se muestra la última página (${paginas.paginas}). Este documento no tiene un sitio marcado para tu firma: irá en una hoja de firmas al final.`
                  : `Página ${paginas.pagina} de ${paginas.paginas}: donde va ${staff ? "la firma del centro" : "tu firma"}.`}
              </p>
            )}

            <button type="button" className="btn btn-secondary btn-sm w-full" onClick={verCompleto}>
              <FaArrowUpRightFromSquare aria-hidden="true" className="h-3 w-3" /> Ver el documento completo
            </button>

            {visibles.length > 1 && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-surface-200 px-3 py-2.5 text-sm transition-colors hover:bg-surface-50">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
                  checked={incluido}
                  disabled={firmando}
                  onChange={() =>
                    setExcluidos((prev) => {
                      const next = new Set(prev);
                      if (next.has(actual.id_documento)) next.delete(actual.id_documento);
                      else next.add(actual.id_documento);
                      return next;
                    })
                  }
                />
                <span>
                  <span className="font-semibold text-charcoal-950">Firmar este documento</span>
                  <span className="block text-xs leading-5 text-muted">Desmárcalo para dejarlo para más tarde.</span>
                </span>
              </label>
            )}
          </div>

          <div className="border-t border-surface-200 bg-surface-50 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-3">
              <div className="firma-papel flex h-14 w-28 shrink-0 items-center justify-center rounded-lg border border-surface-200 p-1.5">
                <img src={firma.firma.imagen} alt={staff ? "Firma del centro" : "Tu firma"} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="min-w-0 text-xs leading-5 text-muted">
                <p className="m-0 font-semibold text-charcoal-800">{staff ? "Firma del centro" : firma.requiere_tutor ? "Tu firma y la de tu tutor/a" : "Tu firma"}</p>
                {staff ? (
                  firma.puede_cambiar && (
                    <Link to="/configuracion/firma" onClick={onClose} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
                      Cambiar
                    </Link>
                  )
                ) : (
                  <button type="button" className="font-semibold text-brand-700 underline-offset-2 hover:underline" onClick={() => setCambiando("USUARIO")} disabled={firmando}>
                    Cambiar
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary mt-4 min-h-11 w-full"
              disabled={firmando || !seleccion.length}
              onClick={() => firmar()}
            >
              <FaPenNib aria-hidden="true" className="h-3.5 w-3.5" />
              {firmando
                ? "Firmando…"
                : seleccion.length === 1
                  ? `Firmar ${visibles.length === 1 ? "el documento" : "1 documento"}`
                  : `Firmar los ${seleccion.length} documentos`}
            </button>
            {visibles.length > 1 && (
              <p className="m-0 mt-2 text-center text-xs text-muted">
                {seleccion.length === visibles.length ? "Usa las flechas para revisarlos antes." : `${visibles.length - seleccion.length} sin marcar se quedan pendientes.`}
              </p>
            )}
          </div>
        </aside>
      </div>
    );
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={titulo}
        description={descripcion}
        size={size}
        busy={fase === "firmando" || guardando}
        footer={pie}
      >
        {cuerpo}
      </Modal>
      <FirmaDialog
        open={Boolean(cambiando)}
        titular={cambiando || "USUARIO"}
        cambiar
        tutorNombre={firma?.tutor_nombre}
        onClose={() => setCambiando(null)}
        onSaved={setFirma}
      />
    </>
  );
}

function Flecha({ lado, onClick, disabled }) {
  const izquierda = lado === "izquierda";
  const Icono = izquierda ? FaChevronLeft : FaChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={izquierda ? "Documento anterior" : "Documento siguiente"}
      className={`absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-surface-200 bg-white text-charcoal-800 shadow-[0_6px_18px_-8px_rgb(17_17_16/0.45)] transition-[transform,opacity,color] duration-150 hover:scale-105 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:pointer-events-none disabled:opacity-0 ${
        izquierda ? "left-2 sm:left-4" : "right-2 sm:right-4"
      }`}
    >
      <Icono aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
