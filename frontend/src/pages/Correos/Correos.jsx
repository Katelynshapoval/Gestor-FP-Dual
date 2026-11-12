import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  FaBold,
  FaCheck,
  FaClockRotateLeft,
  FaLink,
  FaMagnifyingGlass,
  FaPaperclip,
  FaPaperPlane,
  FaTriangleExclamation,
} from "react-icons/fa6";
import { SeccionIntro } from "../Configuracion/Configuracion.jsx";
import StatusBadge from "../../components/ui/StatusBadge";
import InlineNotice from "../../components/ui/InlineNotice";
import {
  useConfirm,
  useToast,
} from "../../components/feedback/ToastProvider.jsx";
import { getJSON, postJSON, putJSON } from "../../utils/api";
import { formatFecha } from "../../utils/fechas";
import { coincide } from "../../utils/busqueda";
import PlantillaCampo from "./PlantillaCampo.jsx";
import HistorialDialog from "./HistorialDialog.jsx";
import AdjuntosCorreo from "./AdjuntosCorreo.jsx";
import { envolver, insertar, variablesUsadas } from "./plantillaTokens";

const GRUPOS = {
  SOLICITUD_ALUMNO: "Solicitudes de alumnos",
  SOLICITUD_EMPRESA: "Solicitudes de empresas",
  DOCUMENTOS: "Documentos",
  RESERVAS: "Reservas",
  CUENTA: "Cuenta",
  GENERAL: "Todos los correos",
};

const VACIO = { asunto: "", cuerpo: "", activa: true, lleva_adjuntos: false };

function agrupar(correos) {
  const grupos = [];
  for (const c of correos) {
    let g = grupos.find((x) => x.id === c.grupo);
    if (!g)
      grupos.push(
        (g = { id: c.grupo, label: GRUPOS[c.grupo] || c.grupo, correos: [] }),
      );
    g.correos.push(c);
  }
  return grupos;
}

// ── List ────────────────────────────────────────────────────────────────────

function ListaCorreos({ correos, seleccionada, onSelect, sucio }) {
  const [busqueda, setBusqueda] = useState("");
  const visibles = useMemo(
    () =>
      correos.filter((c) =>
        coincide(busqueda, [
          c.nombre,
          c.asunto,
          c.destinatario,
          GRUPOS[c.grupo],
        ]),
      ),
    [correos, busqueda],
  );
  const grupos = agrupar(visibles);
  const activoRef = useRef(null);
  // Bring the selected email into view (deep links, keyboard).
  useEffect(() => {
    activoRef.current?.scrollIntoView({ block: "nearest" });
  }, [seleccionada]);

  return (
    <nav
      aria-label="Correos"
      className="overflow-hidden rounded-xl2 border border-surface-200 bg-white shadow-card lg:sticky lg:top-4"
    >
      <div className="border-b border-surface-200 p-3">
        <label htmlFor="correos-buscar" className="sr-only">
          Buscar correo
        </label>
        <div className="relative">
          <FaMagnifyingGlass
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-charcoal-400"
          />
          <input
            id="correos-buscar"
            type="search"
            className="input py-2 pl-9 text-sm"
            placeholder="Buscar…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>
      <div className="max-h-[calc(100vh-12rem)] overflow-y-auto py-2">
        {grupos.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted">
            Ningún correo coincide.
          </p>
        )}
        {grupos.map((g) => (
          <div key={g.id} className="mb-1">
            <div className="px-4 pb-1 pt-3 text-[0.68rem] font-semibold uppercase tracking-widest text-charcoal-500">
              {g.label}
            </div>
            <ul className="m-0 list-none p-0">
              {g.correos.map((c) => {
                const activo = c.clave === seleccionada;
                return (
                  <li key={c.clave}>
                    <button
                      type="button"
                      ref={activo ? activoRef : undefined}
                      aria-current={activo ? "page" : undefined}
                      onClick={() => onSelect(c.clave)}
                      className={`group relative flex w-full flex-col gap-0.5 px-4 py-2 text-left transition-colors duration-150 ${
                        activo ? "bg-brand-50" : "hover:bg-surface-50"
                      }`}
                    >
                      {activo && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-brand-600"
                        />
                      )}
                      <span
                        className={`flex items-center gap-2 text-sm leading-5 ${activo ? "font-semibold text-brand-800" : "font-medium text-charcoal-900"}`}
                      >
                        <span className="min-w-0 flex-1">{c.nombre}</span>
                        {activo && sucio && (
                          <span
                            title="Cambios sin guardar"
                            className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                          />
                        )}
                        {c.lleva_adjuntos && c.n_adjuntos > 0 && (
                          <FaPaperclip
                            title={`Lleva ${c.n_adjuntos === 1 ? "1 adjunto" : `${c.n_adjuntos} adjuntos`}`}
                            className="h-3 w-3 shrink-0 text-charcoal-500"
                          />
                        )}
                        {c.problemas.length > 0 && (
                          <FaTriangleExclamation
                            title="Tiene errores: no se envía"
                            className="h-3.5 w-3.5 shrink-0 text-red-600"
                          />
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        {c.destinatario}
                        {!c.activa && (
                          <span className="font-semibold text-charcoal-600">
                            · Desactivado
                          </span>
                        )}
                        {c.editado && c.activa && (
                          <span className="font-semibold text-brand-700">
                            · Editado
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

// ── Variable chips ──────────────────────────────────────────────────────────

function Chips({ variables, usadas, campo, onInsert }) {
  if (!variables.length) {
    return (
      <p className="m-0 text-sm text-muted">Este texto no tiene variables.</p>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {variables.map((v) => {
        const usada = usadas.has(v.variable);
        const noEnAsunto = campo === "asunto" && v.tipo !== "TEXTO";
        const falta = v.obligatoria && !usada;
        const ayuda = `${v.descripcion}\nEjemplo: ${v.ejemplo.split("\n")[0]}${v.ejemplo.includes("\n") ? " …" : ""}${
          noEnAsunto ? "\nNo se puede usar en el asunto." : ""
        }`;
        return (
          <li key={v.variable}>
            <button
              type="button"
              title={ayuda}
              disabled={noEnAsunto}
              // Keep the caret where it is: insert without stealing focus.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsert(v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.8125rem] font-medium transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-40 ${
                falta
                  ? "border-red-300 bg-red-50 text-red-700 hover:border-red-400"
                  : usada
                    ? "border-brand-200 bg-brand-50 text-brand-800 hover:border-brand-400"
                    : "border-surface-200 bg-white text-charcoal-800 hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-800"
              }`}
            >
              {usada ? (
                <FaCheck aria-hidden="true" className="h-2.5 w-2.5" />
              ) : (
                <span aria-hidden="true" className="text-[0.95em] leading-none">
                  +
                </span>
              )}
              {v.etiqueta}
              {v.obligatoria && <span className="sr-only">(obligatoria)</span>}
              {v.obligatoria && (
                <span
                  aria-hidden="true"
                  className={falta ? "text-red-600" : "text-brand-600"}
                >
                  *
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── Preview ─────────────────────────────────────────────────────────────────

function VistaPrevia({ correo, preview, cargando }) {
  const frameRef = useRef(null);
  const [alto, setAlto] = useState(320);
  const doc = preview?.html
    ? `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body style="margin:0;padding:24px;background:#fff">${preview.html}</body></html>`
    : "";

  const observerRef = useRef(null);
  useEffect(() => () => observerRef.current?.disconnect(), []);

  // Fit the frame to the email. Re-measured whenever the content resizes, e.g.
  // when the frame was hidden behind the "Editar" tab while it loaded.
  const medir = () => {
    const body = frameRef.current?.contentDocument?.body;
    if (!body) return;
    const ajustar = () => setAlto(Math.max(240, body.scrollHeight + 4));
    ajustar();
    observerRef.current?.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      observerRef.current = new ResizeObserver(ajustar);
      observerRef.current.observe(body);
    }
  };

  return (
    <section
      aria-labelledby="preview-title"
      className="overflow-hidden rounded-xl2 border border-surface-200 bg-white shadow-card"
    >
      <div className="flex items-center justify-between gap-3 border-b border-surface-200 px-5 py-3.5">
        <h2
          id="preview-title"
          className="m-0 text-xs font-semibold uppercase tracking-widest text-charcoal-700"
        >
          Vista previa
        </h2>
        <span className="text-xs text-muted">
          {cargando ? "Actualizando…" : "Con datos de ejemplo"}
        </span>
      </div>
      <dl className="m-0 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-b border-surface-200 bg-surface-50 px-5 py-3.5 text-sm">
        <dt className="text-muted">De</dt>
        <dd className="m-0 text-charcoal-900">Salesianos Dual</dd>
        <dt className="text-muted">Para</dt>
        <dd className="m-0 text-charcoal-900">{correo.destinatario}</dd>
        <dt className="text-muted">Asunto</dt>
        <dd className="m-0 break-words font-semibold text-charcoal-950">
          {preview?.asunto || "—"}
        </dd>
        {preview?.adjuntos?.length > 0 && (
          <>
            <dt className="text-muted">Adjuntos</dt>
            <dd className="m-0 flex flex-wrap gap-1.5">
              {preview.adjuntos.map((a) => (
                <span
                  key={a.id ?? a.nombre}
                  className="inline-flex items-center gap-1 rounded border border-surface-200 bg-white px-2 py-0.5 text-xs text-charcoal-800"
                >
                  <FaPaperclip aria-hidden="true" className="h-2.5 w-2.5" />
                  {a.nombre}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
      <div
        className={`transition-opacity duration-200 ${preview?.stale ? "opacity-40" : ""}`}
      >
        {doc ? (
          <iframe
            ref={frameRef}
            title="Vista previa del correo"
            sandbox="allow-same-origin allow-popups"
            srcDoc={doc}
            onLoad={medir}
            style={{ height: alto }}
            className="block w-full border-0"
          />
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted">
            {cargando
              ? "Generando vista previa…"
              : "Corrige los errores para ver la vista previa."}
          </p>
        )}
      </div>
    </section>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Correos() {
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [correos, setCorreos] = useState([]);
  const [faltan, setFaltan] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [detalle, setDetalle] = useState(null);
  const [borrador, setBorrador] = useState(VACIO);
  const [errores, setErrores] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewCargando, setPreviewCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [conflicto, setConflicto] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [restaurando, setRestaurando] = useState(null);
  const [campo, setCampo] = useState("cuerpo");
  const [vista, setVista] = useState("editar");
  const asuntoRef = useRef(null);
  const cuerpoRef = useRef(null);
  const previewId = useRef(0);
  // Last caret/selection per field; null = never placed (insert at the end).
  const seleccionRef = useRef({ asunto: null, cuerpo: null });
  const pendienteRef = useRef(null);
  const recordar = (nombreCampo) => (e) => {
    seleccionRef.current[nombreCampo] = [
      e.target.selectionStart,
      e.target.selectionEnd,
    ];
  };

  const clave = params.get("c") || correos[0]?.clave || null;

  const sucio = Boolean(
    detalle &&
    (borrador.asunto !== detalle.asunto ||
      borrador.cuerpo !== detalle.cuerpo ||
      borrador.activa !== detalle.activa ||
      borrador.lleva_adjuntos !== detalle.lleva_adjuntos),
  );

  const cargarLista = useCallback(async () => {
    try {
      const data = await getJSON("/correos");
      setCorreos(data.correos);
      setFaltan(data.faltan || []);
      setError("");
    } catch (err) {
      setError(err.message || "No se han podido cargar los correos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarLista();
  }, [cargarLista]);

  const aplicarDetalle = (d) => {
    seleccionRef.current = { asunto: null, cuerpo: null };
    setDetalle(d);
    setBorrador({
      asunto: d.asunto,
      cuerpo: d.cuerpo,
      activa: d.activa,
      lleva_adjuntos: d.lleva_adjuntos,
    });
    setErrores([]);
    setConflicto(false);
  };

  // An attachment was added or removed (saved at once, as a new version).
  // Keeps the unsaved text; the switch follows the server unless the
  // administrator had already changed it in the draft.
  const cambioAdjuntos = (d, { conflicto: hayConflicto = false } = {}) => {
    if (hayConflicto) {
      setConflicto(true);
      return;
    }
    if (!d) return;
    setBorrador((b) => ({
      ...b,
      lleva_adjuntos:
        b.lleva_adjuntos === detalle.lleva_adjuntos
          ? d.lleva_adjuntos
          : b.lleva_adjuntos,
    }));
    setDetalle(d);
    cargarLista();
  };

  // Load the selected email.
  useEffect(() => {
    if (!clave) return undefined;
    let vigente = true;
    setDetalle(null);
    setPreview(null);
    getJSON(`/correos/${encodeURIComponent(clave)}`)
      .then((d) => vigente && aplicarDetalle(d))
      .catch(
        (err) =>
          vigente &&
          setError(err.message || "No se ha podido cargar el correo."),
      );
    return () => {
      vigente = false;
    };
  }, [clave]);

  // Live preview (the server validates and renders), debounced while typing.
  useEffect(() => {
    if (!detalle) return undefined;
    const id = ++previewId.current;
    setPreviewCargando(true);
    const t = setTimeout(async () => {
      try {
        const out = await postJSON(
          `/correos/${encodeURIComponent(detalle.clave)}/vista-previa`,
          {
            asunto: borrador.asunto,
            cuerpo: borrador.cuerpo,
            lleva_adjuntos: borrador.lleva_adjuntos,
          },
        );
        if (id !== previewId.current) return;
        if (out.errores?.length) {
          setErrores(out.errores);
          setPreview((p) => (p ? { ...p, stale: true } : null));
        } else {
          setErrores([]);
          setPreview(out);
        }
      } catch {
        /* the preview is a convenience; saving reports real errors */
      } finally {
        if (id === previewId.current) setPreviewCargando(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [detalle, borrador.asunto, borrador.cuerpo, borrador.lleva_adjuntos]);

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!sucio) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [sucio]);

  const seleccionar = async (nueva) => {
    if (nueva === clave) return;
    if (sucio) {
      const ok = await confirm({
        title: "Descartar cambios",
        message: `Tienes cambios sin guardar en «${detalle.nombre}». Si cambias de correo se perderán.`,
        confirmLabel: "Descartar y cambiar",
        tone: "danger",
      });
      if (!ok) return;
    }
    setParams({ c: nueva }, { replace: true });
  };

  const nombres = useMemo(
    () => new Set((detalle?.variables || []).map((v) => v.variable)),
    [detalle],
  );
  const usadas = useMemo(
    () =>
      new Set([
        ...variablesUsadas(borrador.asunto),
        ...variablesUsadas(borrador.cuerpo),
      ]),
    [borrador.asunto, borrador.cuerpo],
  );

  // Puts text where the caret is in the field last used, then restores focus.
  const editarCampo = (nombreCampo, fn) => {
    const el = nombreCampo === "asunto" ? asuntoRef.current : cuerpoRef.current;
    const valor = borrador[nombreCampo];
    const [a, b] = seleccionRef.current[nombreCampo] || [
      valor.length,
      valor.length,
    ];
    const { valor: nuevo, seleccion } = fn(valor, a, b);
    seleccionRef.current[nombreCampo] = seleccion;
    pendienteRef.current = { el, seleccion };
    setBorrador((prev) => ({ ...prev, [nombreCampo]: nuevo }));
  };

  // Put the caret back right after React writes the new value, before the
  // next keystroke can arrive.
  useLayoutEffect(() => {
    const pendiente = pendienteRef.current;
    if (!pendiente?.el) return;
    pendienteRef.current = null;
    pendiente.el.focus();
    pendiente.el.setSelectionRange(
      pendiente.seleccion[0],
      pendiente.seleccion[1],
    );
  }, [borrador]);

  const insertarVariable = (v) => {
    const fragmento = campo === "asunto" ? `{{${v.variable}}}` : v.fragmento;
    editarCampo(campo, (valor, a, b) => {
      const r = insertar(valor, a, b, fragmento);
      return { valor: r.valor, seleccion: [r.cursor, r.cursor] };
    });
  };

  const negrita = () =>
    editarCampo("cuerpo", (valor, a, b) =>
      envolver(valor, a, b, "**", "**", "texto"),
    );
  const enlace = () =>
    editarCampo("cuerpo", (valor, a, b) => {
      const r = envolver(valor, a, b, "[", "](https://)", "texto del enlace");
      return r;
    });

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await putJSON(
        `/correos/${encodeURIComponent(detalle.clave)}`,
        { ...borrador, version: detalle.version },
      );
      aplicarDetalle(res.correo);
      toast.success(res.message || "Correo guardado.");
      cargarLista();
    } catch (err) {
      if (err.status === 409) setConflicto(true);
      if (err.body?.errores) setErrores(err.body.errores);
      toast.error(err.message || "No se ha podido guardar el correo.");
    } finally {
      setGuardando(false);
    }
  };

  const descartar = async () => {
    const ok = await confirm({
      title: "Descartar cambios",
      message: "Se perderán los cambios que no has guardado.",
      confirmLabel: "Descartar",
      tone: "danger",
    });
    if (ok) aplicarDetalle(detalle);
  };

  const recargar = async () => {
    const d = await getJSON(`/correos/${encodeURIComponent(detalle.clave)}`);
    aplicarDetalle(d);
    cargarLista();
  };

  const enviarPrueba = async () => {
    setProbando(true);
    try {
      const res = await postJSON(
        `/correos/${encodeURIComponent(detalle.clave)}/prueba`,
        {
          asunto: borrador.asunto,
          cuerpo: borrador.cuerpo,
          lleva_adjuntos: borrador.lleva_adjuntos,
        },
      );
      (res.enviado ? toast.success : toast.info)(res.message);
    } catch (err) {
      if (err.body?.errores) setErrores(err.body.errores);
      toast.error(err.message || "No se ha podido enviar la prueba.");
    } finally {
      setProbando(false);
    }
  };

  const restaurar = async (desde) => {
    const ok = await confirm({
      title:
        desde === 1
          ? "Restaurar el texto original"
          : `Restaurar la versión ${desde}`,
      message: `${sucio ? "Perderás los cambios sin guardar. " : ""}El texto actual se conserva en el historial. Los adjuntos no cambian.`,
      confirmLabel: "Restaurar",
    });
    if (!ok) return;
    setRestaurando(desde);
    try {
      const res = await postJSON(
        `/correos/${encodeURIComponent(detalle.clave)}/restaurar`,
        { desde, version: detalle.version },
      );
      aplicarDetalle(res.correo);
      toast.success(res.message);
      setHistorial(false);
      cargarLista();
    } catch (err) {
      if (err.status === 409) setConflicto(true);
      toast.error(err.message || "No se ha podido restaurar.");
    } finally {
      setRestaurando(null);
    }
  };

  const editados = correos.filter((c) => c.editado).length;
  const conProblemas = correos.filter((c) => c.problemas.length).length;

  return (
    <div>
      <SeccionIntro
        meta={
          !cargando && (
            <>
              <StatusBadge>{correos.length} correos</StatusBadge>
              {editados > 0 && (
                <StatusBadge variant="brand">{editados} editados</StatusBadge>
              )}
              {conProblemas > 0 && (
                <StatusBadge variant="danger">
                  {conProblemas} con errores
                </StatusBadge>
              )}
            </>
          )
        }
      >
        Edita el texto y los adjuntos de los correos que la aplicación envía a
        alumnos y empresas. Pulsa una variable para insertarla donde está el
        cursor: al enviar se sustituye por el dato real.
      </SeccionIntro>

      <InlineNotice className="mb-6">{error}</InlineNotice>
      {faltan.length > 0 && (
        <InlineNotice className="mb-6">
          Faltan plantillas en la base de datos ({faltan.join(", ")}): esos
          correos no se envían. Aplica las migraciones 022 y 023.
        </InlineNotice>
      )}

      {cargando ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          {/* Small screens: a select instead of the long list */}
          <div className="field mb-0 lg:hidden">
            <label htmlFor="correos-select">Correo</label>
            <select
              id="correos-select"
              className="select-input"
              value={clave || ""}
              onChange={(e) => seleccionar(e.target.value)}
            >
              {agrupar(correos).map((g) => (
                <optgroup key={g.id} label={g.label}>
                  {g.correos.map((c) => (
                    <option key={c.clave} value={c.clave}>
                      {c.nombre}
                      {c.activa ? "" : " (desactivado)"}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="hidden lg:block">
            <ListaCorreos
              correos={correos}
              seleccionada={clave}
              onSelect={seleccionar}
              sucio={sucio}
            />
          </div>

          {!detalle ? (
            <p className="text-sm text-muted">Cargando correo…</p>
          ) : (
            <div className="min-w-0">
              {/* Below 1600px the editor and the preview share the space: switch between them. */}
              <div
                role="group"
                aria-label="Vista"
                className="mb-4 inline-flex rounded-lg border border-surface-200 bg-white p-1 shadow-card min-[1600px]:hidden"
              >
                {[
                  ["editar", "Editar"],
                  ["previa", "Vista previa"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={vista === id}
                    onClick={() => setVista(id)}
                    className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors duration-150 ${
                      vista === id
                        ? "bg-charcoal-900 text-white"
                        : "text-charcoal-600 hover:bg-surface-100 hover:text-charcoal-900"
                    }`}
                  >
                    {label}
                    {id === "previa" && errores.length > 0 && (
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle" />
                    )}
                  </button>
                ))}
              </div>
              <div className="grid min-w-0 items-start gap-6 min-[1600px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <section
                  aria-labelledby="editor-title"
                  className={`min-w-0 rounded-xl2 border border-surface-200 bg-white shadow-card ${vista === "previa" ? "hidden min-[1600px]:block" : ""}`}
                >
                  <header className="flex flex-col gap-4 border-b border-surface-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between md:px-6">
                    <div className="min-w-0">
                      <div className="mb-1 text-[0.68rem] font-semibold uppercase tracking-widest text-brand-700">
                        {GRUPOS[detalle.grupo] || detalle.grupo}
                      </div>
                      <h2
                        id="editor-title"
                        className="m-0 text-lg font-semibold text-charcoal-950"
                      >
                        {detalle.nombre}
                      </h2>
                      <p className="m-0 mt-1 text-sm leading-6 text-muted">
                        {detalle.cuando}{" "}
                        <span className="whitespace-nowrap">
                          Para: {detalle.destinatario}.
                        </span>
                      </p>
                      <p className="m-0 mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-charcoal-500">
                        <span>
                          {detalle.version === 1
                            ? "Texto original"
                            : `Versión ${detalle.version} · ${detalle.actualizado_por || "—"} · ${formatFecha(detalle.actualizado_en)}`}
                        </span>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setHistorial(true)}
                          className="inline-flex items-center gap-1 font-semibold text-brand-700 underline-offset-2 hover:text-brand-800 hover:underline"
                        >
                          <FaClockRotateLeft
                            aria-hidden="true"
                            className="h-3 w-3"
                          />
                          Historial
                        </button>
                      </p>
                    </div>
                    <Interruptor
                      activa={borrador.activa}
                      desactivable={detalle.desactivable}
                      onChange={(activa) =>
                        setBorrador((b) => ({ ...b, activa }))
                      }
                    />
                  </header>

                  <div className="space-y-6 px-5 py-5 md:px-6">
                    {detalle.problemas.length > 0 && !sucio && (
                      <InlineNotice>
                        Este correo no se está enviando porque el texto guardado
                        tiene errores. Corrígelo y guarda.
                      </InlineNotice>
                    )}
                    {!borrador.activa && (
                      <InlineNotice tone="warning">
                        Desactivado: mientras esté así, este correo no se envía
                        a nadie.
                      </InlineNotice>
                    )}
                    {conflicto && (
                      <div
                        role="alert"
                        className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
                      >
                        <span className="flex-1">
                          Otra persona ha guardado este correo mientras lo
                          editabas.
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={recargar}
                        >
                          Cargar su versión
                        </button>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="correo-asunto"
                        className="mb-2 block text-sm font-semibold text-charcoal-800"
                      >
                        Asunto
                      </label>
                      <PlantillaCampo
                        id="correo-asunto"
                        ref={asuntoRef}
                        unaLinea
                        value={borrador.asunto}
                        nombres={nombres}
                        maxLength={200}
                        onFocus={() => setCampo("asunto")}
                        onSelect={recordar("asunto")}
                        onChange={(asunto) =>
                          setBorrador((b) => ({ ...b, asunto }))
                        }
                      />
                    </div>

                    <div className="rounded-lg border border-dashed border-surface-300 bg-surface-50/70 px-4 py-3.5">
                      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold text-charcoal-800">
                          Variables
                        </span>
                        <span className="text-xs text-muted">
                          Se insertan en{" "}
                          {campo === "asunto" ? "el asunto" : "el texto"}, donde
                          está el cursor
                        </span>
                      </div>
                      <Chips
                        variables={detalle.variables}
                        usadas={usadas}
                        campo={campo}
                        onInsert={insertarVariable}
                      />
                    </div>

                    <div>
                      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                        <label
                          htmlFor="correo-cuerpo"
                          className="block text-sm font-semibold text-charcoal-800"
                        >
                          Texto del correo
                        </label>
                        <div
                          className="flex gap-1"
                          role="toolbar"
                          aria-label="Formato"
                        >
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={negrita}
                            title="Negrita: **texto**"
                          >
                            <FaBold aria-hidden="true" /> Negrita
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={enlace}
                            title="Enlace: [texto](https://…)"
                          >
                            <FaLink aria-hidden="true" /> Enlace
                          </button>
                        </div>
                      </div>
                      <PlantillaCampo
                        id="correo-cuerpo"
                        ref={cuerpoRef}
                        value={borrador.cuerpo}
                        nombres={nombres}
                        minAlto={260}
                        invalido={errores.length > 0}
                        describedBy="correo-ayuda correo-errores"
                        onFocus={() => setCampo("cuerpo")}
                        onSelect={recordar("cuerpo")}
                        onChange={(cuerpo) =>
                          setBorrador((b) => ({ ...b, cuerpo }))
                        }
                      />
                      <p
                        id="correo-ayuda"
                        className="m-0 mt-2 text-xs leading-5 text-muted"
                      >
                        Deja una línea en blanco para empezar otro párrafo. El
                        pie con la firma se añade solo al final.
                      </p>
                    </div>

                    <div id="correo-errores" aria-live="polite">
                      {errores.length > 0 && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                          <p className="m-0 mb-1.5 font-semibold">
                            Hay que corregir esto antes de guardar:
                          </p>
                          <ul className="m-0 list-disc space-y-1 pl-5">
                            {errores.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {detalle.admite_adjuntos && (
                      <AdjuntosCorreo
                        correo={detalle}
                        lleva={borrador.lleva_adjuntos}
                        onLleva={(lleva_adjuntos) =>
                          setBorrador((b) => ({ ...b, lleva_adjuntos }))
                        }
                        onCambio={cambioAdjuntos}
                      />
                    )}

                    <details className="group rounded-lg border border-surface-200 text-sm">
                      <summary className="cursor-pointer select-none px-4 py-2.5 font-semibold text-charcoal-800 marker:text-charcoal-400">
                        Cómo se escribe
                      </summary>
                      <dl className="m-0 grid gap-x-4 gap-y-2 border-t border-surface-200 px-4 py-3 text-charcoal-800 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
                        <dt>
                          <code className="text-brand-800">{"{{alumno}}"}</code>
                        </dt>
                        <dd className="m-0 text-muted">
                          Se sustituye por el dato. Usa los botones de variables
                          para no equivocarte.
                        </dd>
                        <dt>
                          <code className="text-amber-800">
                            {"{{#motivo}}…{{/motivo}}"}
                          </code>
                        </dt>
                        <dd className="m-0 text-muted">
                          Lo de dentro solo aparece si hay motivo. Las variables
                          opcionales ya se insertan así.
                        </dd>
                        <dt>
                          <code className="text-amber-800">
                            {"{{^motivo}}…{{/motivo}}"}
                          </code>
                        </dt>
                        <dd className="m-0 text-muted">
                          Lo contrario: solo aparece si no hay motivo.
                        </dd>
                        <dt>
                          <code>**texto**</code>
                        </dt>
                        <dd className="m-0 text-muted">Negrita.</dd>
                        <dt>
                          <code>[texto](https://…)</code>
                        </dt>
                        <dd className="m-0 text-muted">
                          Enlace. También vale una variable de enlace en lugar
                          de la dirección.
                        </dd>
                      </dl>
                    </details>
                  </div>

                  <footer className="z-10 flex flex-wrap md:sticky md:bottom-0 items-center gap-2 rounded-b-xl2 border-t border-surface-200 bg-white/95 px-5 py-3.5 backdrop-blur md:px-6">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!sucio || guardando || errores.length > 0}
                      onClick={guardar}
                    >
                      {guardando ? "Guardando…" : "Guardar cambios"}
                    </button>
                    {sucio && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={descartar}
                        disabled={guardando}
                      >
                        Descartar
                      </button>
                    )}
                    <span className="flex-1" />
                    {sucio && (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 rounded-full bg-amber-500"
                        />
                        Sin guardar
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={enviarPrueba}
                      disabled={probando || errores.length > 0}
                      title="Te envía este texto, con datos de ejemplo, a tu correo"
                    >
                      <FaPaperPlane aria-hidden="true" />
                      {probando ? "Enviando…" : "Enviarme una prueba"}
                    </button>
                  </footer>
                </section>

                <div
                  className={`min-w-0 min-[1600px]:sticky min-[1600px]:top-4 ${vista === "editar" ? "hidden min-[1600px]:block" : ""}`}
                >
                  <VistaPrevia
                    correo={detalle}
                    preview={preview}
                    cargando={previewCargando}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <HistorialDialog
        open={historial}
        onClose={() => setHistorial(false)}
        correo={detalle}
        onRestaurar={restaurar}
        restaurando={restaurando}
      />
    </div>
  );
}

function Interruptor({ activa, desactivable, onChange }) {
  if (!desactivable) {
    return (
      <span
        title="Este correo es imprescindible y no se puede desactivar"
        className="shrink-0"
      >
        <StatusBadge variant="success">Siempre activo</StatusBadge>
      </span>
    );
  }
  return (
    <label className="flex shrink-0 cursor-pointer select-none items-center gap-2.5 text-sm font-medium text-charcoal-800">
      <span>{activa ? "Activo" : "Desactivado"}</span>
      <span className="relative inline-flex">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={activa}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden="true"
          className="h-6 w-11 rounded-full bg-charcoal-200 transition-colors duration-150 peer-checked:bg-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30"
        />
        <span
          aria-hidden="true"
          className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}
