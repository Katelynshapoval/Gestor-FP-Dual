import { marked } from "marked";
import { coincide, normalizar } from "../../utils/busqueda";

marked.setOptions({ gfm: true, headerIds: false, mangle: false });

const ANCHOR = /^<a id="([^"]+)"><\/a>\s*$/;
const HEADING = /^(#{1,4})\s+(.+?)\s*$/;

function plainHeading(text) {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "");
}

// Rough markdown → text, only for searching and snippets.
function plainText(markdown) {
  return markdown
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+.*$/gm, " ")
    .replace(/^\s*(?:[-*>]|\d+\.)\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\|/g, " ")
    .replace(/-{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Splits the manual into its numbered chapters (## headings with an anchor).
// The title, version note and the manual's own index stay out: the page
// shows its own navigation.
export function parseManual(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const preamble = [];
  const chapters = [];
  let current = null;
  let section = null;
  let pendingId = null;

  for (const line of lines) {
    const anchor = line.match(ANCHOR);
    if (anchor) {
      pendingId = anchor[1];
      continue;
    }
    if (pendingId && !line.trim()) continue;
    const heading = line.match(HEADING);
    if (heading && heading[1].length === 2 && pendingId) {
      const full = plainHeading(heading[2]);
      const numbered = full.match(/^(\d+)\.\s+(.*)$/);
      current = {
        id: pendingId,
        number: numbered ? numbered[1] : null,
        title: numbered ? numbered[2] : full,
        lines: [],
        sections: [],
        ids: new Set([pendingId]),
      };
      section = { id: pendingId, title: current.title, lines: [] };
      current.segments = [section];
      chapters.push(current);
      pendingId = null;
      continue;
    }
    if (!current) {
      if (!heading || heading[1].length > 1) preamble.push(line);
      pendingId = null;
      continue;
    }
    if (pendingId) {
      // The blank line closes the HTML block so the heading still renders.
      current.lines.push(`<a id="${pendingId}"></a>`, "");
      current.ids.add(pendingId);
      const title = heading ? plainHeading(heading[2]) : current.title;
      if (heading && heading[1].length === 3) current.sections.push({ id: pendingId, title });
      section = { id: pendingId, title, lines: [] };
      current.segments.push(section);
      pendingId = null;
    }
    current.lines.push(line);
    section.lines.push(line);
  }

  const content = chapters
    .filter((chapter) => chapter.id !== "indice")
    .map(({ lines: body, segments, ...chapter }) => ({
      ...chapter,
      markdown: body.join("\n").replace(/(\s*\n-{3,}\s*)+$/, "").trim(),
      segments: segments
        .map((s) => ({ id: s.id, title: s.title, text: plainText(s.lines.join("\n")) }))
        .filter((s) => s.text),
    }));

  return {
    intro: preamble.join("\n").replace(/^\s*-{3,}\s*$/gm, "").trim(),
    chapters: content,
  };
}

// The manual is our own file. Image paths are rewritten to the public route
// before it is turned into HTML.
export function manualHtml(markdown) {
  const withImages = String(markdown).replace(
    /\]\(manual\/imagenes\/([^)\s]+)\)/g,
    (_, file) => `](/ayuda/imagenes/${encodeURIComponent(file)})`,
  );
  return marked
    .parse(withImages)
    .replace(/<p><a id="([^"]+)"><\/a><\/p>\s*<h(\d)>/g, '<h$2 id="$1">');
}

// Same folding as normalizar, one UTF-16 unit at a time, so positions in the
// folded text are positions in the original.
function fold(text) {
  return text
    .split("")
    .map((c) => c.normalize("NFD")[0].toLowerCase()[0])
    .join("");
}

function snippet(text, query) {
  const word = normalizar(query).split(/\s+/).filter(Boolean)[0];
  const at = word ? fold(text).indexOf(word) : -1;
  if (at < 0) return text.length > 160 ? `${text.slice(0, 160).trim()}…` : text;
  const start = Math.max(0, at - 50);
  const end = Math.min(text.length, at + 120);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

// Manual sections whose title or text contain every word of the query.
// Matches in the title come first.
export function searchManual(chapters, query, limit = 8) {
  if (!normalizar(query)) return [];
  const hits = [];
  for (const chapter of chapters) {
    for (const segment of chapter.segments) {
      if (!coincide(query, [segment.title, segment.text, chapter.title])) continue;
      hits.push({
        id: segment.id,
        chapter: chapter.number ? `${chapter.number}. ${chapter.title}` : chapter.title,
        title: segment.title,
        snippet: snippet(segment.text, query),
        inTitle: coincide(query, [segment.title]),
      });
    }
  }
  return hits.sort((a, b) => Number(b.inTitle) - Number(a.inTitle)).slice(0, limit);
}
