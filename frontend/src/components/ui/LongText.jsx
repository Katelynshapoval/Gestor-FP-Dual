// Long emails, names and notes wrap at @ . _ - / and, if a piece is still
// wider than the column, anywhere inside that piece. The full value stays
// available on hover.
const BREAK_AFTER = /([@._\-/])/g;

export function withBreaks(value) {
  const text = String(value);
  const out = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(BREAK_AFTER)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(match[1]);
    out.push(<wbr key={key++} />);
    last = match.index + match[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function LongText({ children, className = "" }) {
  if (children == null || children === "") return null;
  if (typeof children !== "string" && typeof children !== "number") {
    return <span className={`min-w-0 break-words ${className}`}>{children}</span>;
  }
  const text = String(children);
  return (
    <span className={`min-w-0 break-words ${className}`} title={text.length > 28 ? text : undefined}>
      {withBreaks(text)}
    </span>
  );
}
