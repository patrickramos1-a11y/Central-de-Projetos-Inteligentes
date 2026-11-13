const SUMMARY_LIMIT = 280;

function normalized(value: string) {
  return value.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function shortenAtBoundary(value: string) {
  if (value.length <= SUMMARY_LIMIT) return value;
  const slice = value.slice(0, SUMMARY_LIMIT + 1);
  const boundary = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("; "), slice.lastIndexOf(": "));
  return `${slice.slice(0, boundary >= 100 ? boundary + 1 : SUMMARY_LIMIT).trimEnd()}...`;
}

/**
 * Produces a compact, presentation-safe context abstract without asking an AI
 * model. It intentionally ignores repeated titles and Markdown headings.
 */
export function createContextSummary(title: string, content: string) {
  const canonicalTitle = normalized(title);
  const candidates = content
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/, "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim())
    .filter((line) => {
      const canonical = normalized(line);
      return canonical.length >= 40 && canonical !== canonicalTitle && !canonical.startsWith(`${canonicalTitle} `) && !/^\d+(?:\.\d+)*\s+/.test(canonical);
    });
  const source = candidates[0] || content.replace(/\s+/g, " ").trim();
  return shortenAtBoundary(source);
}
