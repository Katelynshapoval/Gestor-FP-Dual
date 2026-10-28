import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaArrowLeft,
  FaArrowRight,
  FaBookOpen,
  FaBuilding,
  FaChevronDown,
  FaCircleQuestion,
  FaGraduationCap,
  FaMagnifyingGlass,
  FaUserShield,
  FaUsersGear,
  FaXmark,
} from "react-icons/fa6";
import PageHeader from "../../components/ui/PageHeader";
import { publicJSON } from "../../utils/api";
import { coincide } from "../../utils/busqueda";
import { FAQ, PERFILES } from "./faq.js";
import { manualHtml, parseManual, searchManual } from "./manual.js";

const PERFIL_ICONOS = {
  "#administrador": FaUserShield,
  "#coordinador": FaUsersGear,
  "#empresa": FaBuilding,
  "#alumno": FaGraduationCap,
};

const SECCIONES_PAGINA = ["preguntas", "manual"];

function currentHash() {
  return decodeURIComponent(window.location.hash.slice(1));
}

function ProfileCards({ onGo }) {
  return (
    <ul className="m-0 mb-10 grid list-none grid-cols-2 gap-3 p-0 xl:grid-cols-4">
      {PERFILES.map((perfil) => {
        const Icon = PERFIL_ICONOS[perfil.href] || FaBookOpen;
        return (
          <li key={perfil.href}>
            <a
              href={perfil.href}
              onClick={(event) => onGo(event, perfil.href.slice(1))}
              className="group flex h-full min-w-0 flex-col rounded-xl2 border border-surface-200 bg-white p-4 shadow-card outline-none transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-brand-500/30"
            >
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="break-words font-semibold text-charcoal-950 sm:mb-1">{perfil.title}</span>
              <span className="mb-3 hidden text-sm leading-5 text-muted sm:block">{perfil.text}</span>
              <span className="mt-auto hidden items-center sm:inline-flex gap-1.5 text-sm font-semibold text-brand-700">
                Ver la guía
                <FaArrowRight aria-hidden="true" className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function SearchBox({ value, onChange }) {
  return (
    <div className="relative mb-6">
      <label htmlFor="ayuda-buscar" className="sr-only">
        Buscar en la ayuda
      </label>
      <FaMagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
      <input
        id="ayuda-buscar"
        type="search"
        className="input !py-3.5 !pl-11 !pr-11 shadow-card [&::-webkit-search-cancel-button]:hidden"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Busca en la ayuda: contraseña, convenio, reserva, plazo…"
        autoComplete="off"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Borrar la búsqueda"
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-charcoal-500 hover:bg-surface-100 hover:text-charcoal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
        >
          <FaXmark aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function FaqList({ items, onGo }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <details
          key={item.q}
          className="group rounded-xl2 border border-surface-200 bg-white shadow-card transition-[border-color,box-shadow] duration-150 open:border-brand-200 open:shadow-card-hover"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl2 px-4 py-3.5 font-semibold text-charcoal-950 outline-none marker:content-none hover:bg-surface-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/30 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 break-words">{item.q}</span>
            <FaChevronDown
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-charcoal-400 transition-transform duration-150 group-open:rotate-180 group-open:text-brand-600"
            />
          </summary>
          <div className="border-t border-surface-200 px-4 pb-4 pt-3 text-sm leading-6 text-charcoal-800">
            <p className="m-0 break-words">{item.a}</p>
            <a
              href={item.href}
              onClick={(event) => onGo(event, item.href.slice(1))}
              className="mt-3 inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"
            >
              Ver en el manual
              <FaArrowRight aria-hidden="true" className="h-3 w-3" />
            </a>
          </div>
        </details>
      ))}
    </div>
  );
}

function ManualHits({ hits, onGo }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {hits.map((hit) => (
        <li key={hit.id}>
          <a
            href={`#${hit.id}`}
            onClick={(event) => onGo(event, hit.id)}
            className="block rounded-xl2 border border-surface-200 bg-white px-4 py-3 shadow-card outline-none transition-[border-color,box-shadow] duration-150 hover:border-brand-200 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-brand-500/30"
          >
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted">{hit.chapter}</span>
            <span className="mt-0.5 block break-words font-semibold text-charcoal-950">{hit.title}</span>
            <span className="mt-1 block break-words text-sm leading-6 text-charcoal-700">{hit.snippet}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function SearchResults({ query, preguntas, hits, onGo }) {
  if (!preguntas.length && !hits.length) {
    return (
      <div className="rounded-xl2 border border-dashed border-surface-300 bg-white px-6 py-10 text-center">
        <FaMagnifyingGlass aria-hidden="true" className="mx-auto mb-3 h-5 w-5 text-charcoal-300" />
        <p className="m-0 font-semibold text-charcoal-900">Nada coincide con «{query}»</p>
        <p className="m-0 mt-1 text-sm text-muted">Prueba con otras palabras o recorre el manual por capítulos.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      {preguntas.length > 0 && (
        <div>
          <h3 className="m-0 mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
            Preguntas frecuentes · {preguntas.length}
          </h3>
          <FaqList items={preguntas} onGo={onGo} />
        </div>
      )}
      {hits.length > 0 && (
        <div>
          <h3 className="m-0 mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
            En el manual · {hits.length}
          </h3>
          <ManualHits hits={hits} onGo={onGo} />
        </div>
      )}
    </div>
  );
}

function ChapterNav({ chapters, active, onGo }) {
  return (
    <nav
      aria-label="Contenido de la ayuda"
      className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto lg:pb-4"
    >
      <a
        href="#preguntas"
        onClick={(event) => onGo(event, "preguntas")}
        className="mb-5 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-charcoal-900 hover:bg-surface-100"
      >
        <FaCircleQuestion aria-hidden="true" className="h-3.5 w-3.5 text-brand-600" />
        Preguntas frecuentes
      </a>
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-widest text-muted">Manual</p>
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0 text-sm">
        {chapters.map((chapter) => {
          const isActive = chapter.id === active?.id;
          return (
            <li key={chapter.id}>
              <a
                href={`#${chapter.id}`}
                onClick={(event) => onGo(event, chapter.id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-start gap-2 rounded-md border-l-2 px-2 py-1.5 leading-5 ${
                  isActive
                    ? "border-brand-600 bg-brand-50 font-semibold text-charcoal-950"
                    : "border-transparent text-charcoal-700 hover:bg-surface-100 hover:text-charcoal-950"
                }`}
              >
                {chapter.number && (
                  <span className={`w-4 shrink-0 tabular-nums ${isActive ? "text-brand-700" : "text-charcoal-400"}`}>
                    {chapter.number}
                  </span>
                )}
                <span className="min-w-0 break-words">{chapter.title}</span>
              </a>
              {isActive && chapter.sections.length > 0 && (
                <ul className="m-0 mb-1 ml-6 mt-1 flex list-none flex-col gap-0.5 border-l border-surface-200 p-0">
                  {chapter.sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        onClick={(event) => onGo(event, section.id)}
                        className="block break-words py-1 pl-3 text-[0.8125rem] leading-5 text-muted hover:text-charcoal-950"
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ManualSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando el manual" className="animate-pulse rounded-xl2 border border-surface-200 bg-white p-6 shadow-card">
      <div className="mb-5 h-6 w-1/2 rounded bg-surface-200" />
      {[100, 92, 96, 70, 0, 100, 88, 60].map((width, index) =>
        width ? (
          <div key={index} className="mb-3 h-3 rounded bg-surface-100" style={{ width: `${width}%` }} />
        ) : (
          <div key={index} className="h-4" />
        ),
      )}
    </div>
  );
}

function ChapterReader({ intro, chapters, chapter, onGo }) {
  const index = chapters.indexOf(chapter);
  const prev = chapters[index - 1];
  const next = chapters[index + 1];
  const html = useMemo(() => manualHtml(chapter.markdown), [chapter]);
  const introHtml = useMemo(() => (intro ? manualHtml(intro) : ""), [intro]);

  return (
    <article className="overflow-hidden rounded-xl2 border border-surface-200 bg-white shadow-card">
      <header id={chapter.id} className="scroll-mt-24 border-b border-surface-200 bg-surface-50 px-5 py-5 sm:px-8">
        <p className="m-0 text-xs font-semibold uppercase tracking-widest text-brand-700">
          Capítulo {chapter.number || index + 1} de {chapters.length}
        </p>
        <h3 className="m-0 mt-1 font-display text-2xl font-semibold leading-tight text-charcoal-950">{chapter.title}</h3>
      </header>

      <div className="px-5 py-6 sm:px-8">
        {index === 0 && introHtml && (
          <div className="manual-body manual-intro mb-6" dangerouslySetInnerHTML={{ __html: introHtml }} />
        )}
        <div className="manual-body min-w-0" dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      <footer className="grid grid-cols-1 gap-3 border-t border-surface-200 bg-surface-50 px-5 py-4 sm:grid-cols-2 sm:px-8">
        {prev ? (
          <a
            href={`#${prev.id}`}
            onClick={(event) => onGo(event, prev.id)}
            className="group flex min-w-0 items-center gap-3 rounded-lg border border-surface-200 bg-white px-4 py-3 hover:border-brand-200"
          >
            <FaArrowLeft aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-charcoal-400 group-hover:text-brand-600" />
            <span className="min-w-0">
              <span className="block text-xs text-muted">Anterior</span>
              <span className="block truncate font-semibold text-charcoal-950">{prev.title}</span>
            </span>
          </a>
        ) : (
          <span className="hidden sm:block" />
        )}
        {next && (
          <a
            href={`#${next.id}`}
            onClick={(event) => onGo(event, next.id)}
            className="group flex min-w-0 items-center justify-end gap-3 rounded-lg border border-surface-200 bg-white px-4 py-3 text-right hover:border-brand-200"
          >
            <span className="min-w-0">
              <span className="block text-xs text-muted">Siguiente</span>
              <span className="block truncate font-semibold text-charcoal-950">{next.title}</span>
            </span>
            <FaArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-charcoal-400 group-hover:text-brand-600" />
          </a>
        )}
      </footer>
    </article>
  );
}

export default function Ayuda() {
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [chapterId, setChapterId] = useState(null);
  // Anchor to scroll to once the chapter that holds it is on screen.
  const [target, setTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;
    publicJSON("/ayuda/manual")
      .then((data) => {
        if (!cancelled) setMarkdown(data.markdown || "");
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "No se ha podido cargar el manual.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { intro, chapters } = useMemo(() => parseManual(markdown), [markdown]);
  const chapter = chapters.find((item) => item.id === chapterId) || chapters[0] || null;

  const show = useCallback(
    (id) => {
      if (!id) return;
      const owner = chapters.find((item) => item.ids.has(id));
      if (owner) {
        setChapterId(owner.id);
        setQuery("");
      }
      if (owner || SECCIONES_PAGINA.includes(id)) setTarget({ id });
    },
    [chapters],
  );

  // Links in the page and inside the manual go through here, so an anchor in
  // another chapter opens that chapter first.
  const go = useCallback(
    (event, id) => {
      event?.preventDefault();
      if (currentHash() !== id) window.history.pushState(null, "", `#${encodeURIComponent(id)}`);
      show(id);
    },
    [show],
  );

  useEffect(() => {
    if (!chapters.length) return undefined;
    show(currentHash());
    const onHash = () => show(currentHash());
    window.addEventListener("popstate", onHash);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("popstate", onHash);
      window.removeEventListener("hashchange", onHash);
    };
  }, [chapters, show]);

  // Screenshots above the anchor load after the first jump and push it down,
  // so jump again once they are in (or after a short wait at most).
  useEffect(() => {
    if (!target) return undefined;
    let cancelled = false;
    const jump = () => {
      if (!cancelled) document.getElementById(target.id)?.scrollIntoView({ block: "start" });
    };
    const timer = window.setTimeout(() => {
      jump();
      const node = document.getElementById(target.id);
      const pending = [...document.querySelectorAll("#manual img")].filter(
        (img) => !img.complete && node && img.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      if (!pending.length) return;
      Promise.race([
        Promise.all(
          pending.map(
            (img) =>
              new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
              }),
          ),
        ),
        new Promise((resolve) => window.setTimeout(resolve, 2500)),
      ]).then(jump);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [target, chapterId]);

  const onManualClick = (event) => {
    const link = event.target.closest("a[href^='#']");
    if (link && !event.defaultPrevented) go(event, decodeURIComponent(link.getAttribute("href").slice(1)));
  };

  const searching = query.trim().length > 0;
  const preguntas = searching ? FAQ.filter((item) => coincide(query, [item.q, item.a])) : FAQ;
  const hits = useMemo(() => searchManual(chapters, query), [chapters, query]);

  return (
    <div className="page-container">
      <PageHeader
        kicker="Ayuda"
        title="¿En qué podemos ayudarte?"
        subtitle="Busca una duda, elige la guía de tu perfil o recorre el manual de usuario capítulo a capítulo."
      />

      <SearchBox value={query} onChange={setQuery} />

      {!searching && <ProfileCards onGo={go} />}

      <div className="grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] xl:gap-10">
        <ChapterNav chapters={chapters} active={chapter} onGo={go} />

        <div className="min-w-0">
          <section id="preguntas" className="scroll-mt-24" aria-live={searching ? "polite" : undefined}>
            {searching ? (
              <>
                <h2 className="m-0 mb-4 font-display text-xl font-semibold text-charcoal-950">Resultados</h2>
                <SearchResults query={query.trim()} preguntas={preguntas} hits={hits} onGo={go} />
              </>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="m-0 font-display text-xl font-semibold text-charcoal-950">Preguntas frecuentes</h2>
                  <p className="m-0 text-sm text-muted">Respuestas cortas; el detalle está en el manual.</p>
                </div>
                <FaqList items={FAQ} onGo={go} />
              </>
            )}
          </section>

          <section id="manual" className="mt-12 scroll-mt-24">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 flex items-center gap-2 font-display text-xl font-semibold text-charcoal-950">
                <FaBookOpen aria-hidden="true" className="h-4 w-4 text-brand-600" />
                Manual de usuario
              </h2>
              {chapters.length > 0 && (
                <div className="w-full lg:hidden">
                  <label htmlFor="ayuda-capitulo" className="sr-only">
                    Capítulo
                  </label>
                  <select
                    id="ayuda-capitulo"
                    className="select-input"
                    value={chapter?.id || ""}
                    onChange={(event) => go(null, event.target.value)}
                  >
                    {chapters.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.number ? `${item.number}. ` : ""}
                        {item.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {loading && <ManualSkeleton />}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error} Si acabas de entrar, vuelve a intentarlo desde el menú{" "}
                <Link to="/ayuda" className="font-semibold underline">Ayuda</Link>.
              </div>
            )}
            {chapter && (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <div onClick={onManualClick}>
                <ChapterReader intro={intro} chapters={chapters} chapter={chapter} onGo={go} />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
