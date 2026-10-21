// Search highlighting as data (CNOTE-18). Plain text in, `{ text, match }` segments out; components
// render them as text and <mark> elements. Nothing here builds or parses HTML (CNOTE-12), so
// markup-looking text such as "<script>" stays literal.

export interface Segment {
  text: string;
  match: boolean;
}

// A word is a run of letters, digits and combining marks. The search index splits text the same way
// (lib/noteSearch.ts), so what is highlighted is what was matched.
export const NON_WORD = /[^\p{L}\p{N}\p{M}]+/u;
const WORD = /[\p{L}\p{N}\p{M}]+/gu;

interface Word {
  start: number;
  end: number;
  match: boolean;
}

function wordsOf(text: string, terms: readonly string[]): Word[] {
  const wanted = new Set(terms.map((term) => term.toLowerCase()));
  return Array.from(text.matchAll(WORD), (m) => ({
    start: m.index,
    end: m.index + m[0].length,
    match: wanted.has(m[0].toLowerCase()),
  }));
}

// Splits text[from, to) into plain and matched runs; adjacent plain text is merged
function segmentsOf(text: string, words: readonly Word[], from: number, to: number): Segment[] {
  const segments: Segment[] = [];
  const push = (part: string, match: boolean) => {
    if (!part) return;
    const last = segments.at(-1);
    if (last && !last.match && !match) last.text += part;
    else segments.push({ text: part, match });
  };
  let at = from;
  for (const word of words) {
    if (!word.match || word.start < from || word.end > to) continue;
    push(text.slice(at, word.start), false);
    push(text.slice(word.start, word.end), true);
    at = word.end;
  }
  push(text.slice(at, to), false);
  return segments;
}

// The whole text with every whole-word, case-insensitive match of `terms` marked
export function highlightSegments(text: string, terms: readonly string[]): Segment[] {
  return segmentsOf(text, wordsOf(text, terms), 0, text.length);
}

const ELLIPSIS = '…';

// About `maxLength` characters around the first match (or from the start when only the title
// matched), cut at word boundaries, with "…" where text was left out
export function snippetSegments(text: string, terms: readonly string[], maxLength = 120): Segment[] {
  const words = wordsOf(text, terms);
  if (text.length <= maxLength) return segmentsOf(text, words, 0, text.length);

  const first = words.find((word) => word.match);
  // Some context before the match, but fill the window when the match is near the end
  const lead = Math.floor(maxLength * 0.3);
  const target = first ? Math.max(0, Math.min(first.start - lead, text.length - maxLength)) : 0;
  const startWord = words.find((word) => word.start >= target);
  let start = target === 0 ? 0 : (startWord?.start ?? target);
  if (first && start > first.start) start = first.start;

  const limit = start + maxLength;
  let end = start;
  for (const word of words) {
    if (word.start < start) continue;
    if (word.end > limit) break;
    end = word.end;
  }
  if (first && end < first.end) end = first.end;
  if (end === start) end = Math.min(text.length, limit);

  const segments = segmentsOf(text, words, start, end);
  if (start > 0) segments.unshift({ text: ELLIPSIS, match: false });
  if (end < text.length) segments.push({ text: ELLIPSIS, match: false });
  // Merge the ellipses into neighbouring plain text
  return segments.reduce<Segment[]>((merged, segment) => {
    const last = merged.at(-1);
    if (last && !last.match && !segment.match) last.text += segment.text;
    else merged.push({ ...segment });
    return merged;
  }, []);
}
