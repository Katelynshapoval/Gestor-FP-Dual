import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { segmentar } from "./plantillaTokens";

// Text field for an email template with live highlighting of {{variables}},
// blocks and **bold** markers. A transparent textarea sits on top of a mirror
// that draws the coloured text; both share exactly the same typography and
// padding, and the textarea grows with its content so they never scroll apart.
// Highlights use background and box-shadow only: no padding, margin or weight
// changes, which would shift the text under the caret.

const TEXTO =
  "m-0 whitespace-pre-wrap break-words border-0 px-3.5 py-3 font-body text-[0.9375rem] leading-7 tracking-normal";

const SEGMENTO = {
  variable:
    "rounded-[3px] bg-brand-50 text-brand-800 shadow-[0_0_0_1px_#ffcfc9]",
  bloque: "rounded-[3px] bg-amber-50 text-amber-800 shadow-[0_0_0_1px_#fde68a]",
  desconocida:
    "rounded-[3px] bg-red-50 text-red-700 underline decoration-red-400 decoration-wavy underline-offset-4",
  negrita: "text-charcoal-300",
};

const PlantillaCampo = forwardRef(function PlantillaCampo(
  {
    id,
    value,
    onChange,
    nombres,
    unaLinea = false,
    minAlto = 0,
    invalido = false,
    describedBy,
    ...rest
  },
  ref,
) {
  const areaRef = useRef(null);
  useImperativeHandle(ref, () => areaRef.current);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minAlto)}px`;
  }, [value, minAlto]);

  const segmentos = useMemo(() => segmentar(value, nombres), [value, nombres]);

  return (
    <div
      className={`relative rounded-lg border bg-white transition-[border-color,box-shadow] duration-150 focus-within:ring-2 ${
        invalido
          ? "border-red-300 focus-within:border-red-500 focus-within:ring-red-500/15"
          : "border-surface-200 hover:border-surface-300 focus-within:border-brand-700 focus-within:ring-brand-500/20"
      }`}
    >
      <div
        aria-hidden="true"
        className={`${TEXTO} pointer-events-none absolute inset-0 overflow-hidden text-charcoal-950`}
      >
        {segmentos.map((s, i) =>
          s.tipo === "texto" ? (
            <span key={i}>{s.texto}</span>
          ) : (
            <span key={i} className={SEGMENTO[s.tipo]}>
              {s.texto}
            </span>
          ),
        )}
        {/* keeps the last empty line as tall as in the textarea */}
        {"​"}
      </div>
      <textarea
        ref={areaRef}
        id={id}
        value={value}
        rows={1}
        // The browser would underline every {{variable}} as a spelling mistake.
        spellCheck={false}
        lang="es"
        aria-invalid={invalido || undefined}
        aria-describedby={describedBy}
        className={`${TEXTO} relative block w-full resize-none overflow-hidden rounded-lg bg-transparent text-transparent caret-charcoal-950 outline-none selection:bg-brand-200/50 selection:text-transparent placeholder:italic placeholder:text-charcoal-400`}
        onKeyDown={
          unaLinea ? (e) => e.key === "Enter" && e.preventDefault() : undefined
        }
        onChange={(e) =>
          onChange(
            unaLinea ? e.target.value.replace(/\r?\n/g, " ") : e.target.value,
          )
        }
        {...rest}
      />
    </div>
  );
});

export default PlantillaCampo;
