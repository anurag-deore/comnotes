// Command palette filtering (CNOTE-24). Pure: which commands show for a query, best first.
import { commandLabel, isAvailable, type Command, type CommandState } from '@/lib/shortcuts';

const PREFIX = 400;
const WORD_START = 300;
const SUBSTRING = 200;
const SUBSEQUENCE = 100;

// How well one query word matches the text, or null. Earlier matches score a little higher.
function wordScore(word: string, text: string): number | null {
  const at = text.indexOf(word);
  if (at === 0) return PREFIX;
  if (at > 0) {
    for (let i = at; i !== -1; i = text.indexOf(word, i + 1)) {
      if (!/[a-z0-9]/.test(text[i - 1])) return WORD_START - i;
    }
    return SUBSTRING - at;
  }
  // Letters in order with gaps: fewer gaps score higher
  let from = 0;
  let first = -1;
  for (const char of word) {
    const found = text.indexOf(char, from);
    if (found === -1) return null;
    if (first === -1) first = found;
    from = found + 1;
  }
  return Math.max(1, SUBSEQUENCE - (from - first - word.length));
}

// Case-insensitive; every word of the query must match. Empty query → 0 (matches everything).
export function fuzzyScore(query: string, text: string): number | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const target = text.toLowerCase();
  let total = 0;
  for (const word of words) {
    const score = wordScore(word, target);
    if (score === null) return null;
    total += score;
  }
  return total;
}

export interface PaletteCommand {
  command: Command;
  label: string;
}

// A keyword counts only as a prefix, word or substring match (not letters scattered through it),
// and below a label match
function keywordScore(query: string, keywords: readonly string[] = []): number | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  let best: number | null = null;
  for (const keyword of keywords) {
    if (!words.every((word) => keyword.includes(word))) continue;
    const score = fuzzyScore(query, keyword);
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best === null ? null : best / 2;
}

// The palette's commands: available ones only (unavailable ones are hidden), the palette itself
// left out; with a query, ranked by score with ties in registry order
export function paletteCommands(commands: readonly Command[], query: string, state: CommandState): PaletteCommand[] {
  const shown = commands
    .filter((command) => command.inPalette !== false && isAvailable(command, state))
    .map((command) => ({ command, label: commandLabel(command, state) }));
  if (!query.trim()) return shown;
  return shown
    .flatMap((item) => {
      const scores = [fuzzyScore(query, item.label), keywordScore(query, item.command.keywords)]
        .filter((score): score is number => score !== null);
      return scores.length ? [{ item, score: Math.max(...scores) }] : [];
    })
    // Array.prototype.sort is stable, so equal scores keep registry order
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}
