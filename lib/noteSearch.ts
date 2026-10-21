// Full-text search over notes (CNOTE-18), in this tab's memory only: the index is never written to
// localStorage, IndexedDB or anywhere else. MiniSearch is passed in (loadNoteSearchIndex imports it
// on demand), so it stays out of the main bundle and tests can use it directly.
//
// Locked notes (CNOTE-7): ciphertext is never indexed. A locked note is a source only while its
// decrypted text is in memory (the notes page decrypts locked notes when the vault unlocks), and
// dropLocked() rebuilds the index without them, so no decrypted word survives a vault lock.
import type MiniSearch from 'minisearch';
import type { SearchOptions } from 'minisearch';
import { noteHtmlToText } from '@/lib/noteHtml';
import type { NoteText } from '@/lib/noteCrypto';
import { noteView, type NoteView } from '@/lib/noteViews';
import { NON_WORD } from '@/lib/searchHighlight';
import type { Vault } from '@/lib/vault';
import type { Note } from '@/types/note';

// What the index is built from: title and content HTML, never ciphertext
export interface SearchSource {
  id: string;
  title: string;
  html: string;
  view: Exclude<NoteView, 'trash'>;
  locked: boolean;
}

export interface SearchHit {
  id: string;
  score: number;
  // The document words that matched (lowercase), for highlighting
  terms: string[];
  title: string;
  // The note's plain text
  text: string;
  view: SearchSource['view'];
  locked: boolean;
}

export interface SearchScope {
  includeArchive: boolean;
}

// Trashed notes are never searched (they can't be opened). A locked note needs its decrypted text.
export function searchSources(notes: readonly Note[], decrypted: Readonly<Record<string, NoteText>>): SearchSource[] {
  const sources: SearchSource[] = [];
  for (const note of notes) {
    const view = noteView(note);
    if (view === 'trash') continue;
    if (!note.locked) {
      sources.push({ id: note.id, title: note.title, html: note.content, view, locked: false });
      continue;
    }
    const text = note.encrypted ? decrypted[note.id] : undefined;
    if (text) sources.push({ id: note.id, title: text.title, html: text.content, view, locked: true });
  }
  return sources;
}

type Entry = Omit<SearchSource, 'id'> & { text: string };
type Doc = { id: string; title: string; text: string };
type MiniSearchClass = typeof MiniSearch;

const tokenize = (text: string) => text.split(NON_WORD).filter(Boolean);

const SEARCH_OPTIONS: SearchOptions = {
  boost: { title: 3 },
  prefix: true,
  // Typos only on longer words; short ones would match too much
  fuzzy: (term) => (term.length > 3 ? 0.2 : false),
  combineWith: 'AND',
};

export class NoteSearchIndex {
  private mini: MiniSearch<Doc>;
  // What each note was indexed from, so unchanged notes are skipped and changed HTML re-extracted
  private entries = new Map<string, Entry>();

  constructor(private readonly MiniSearchCtor: MiniSearchClass, private readonly toText: (html: string) => string = noteHtmlToText) {
    this.mini = this.create();
  }

  private create() {
    return new this.MiniSearchCtor<Doc>({ fields: ['title', 'text'], tokenize, searchOptions: SEARCH_OPTIONS });
  }

  get size() {
    return this.entries.size;
  }

  // Brings the index in line with `sources`: adds, replaces and discards by id
  sync(sources: readonly SearchSource[]) {
    const counts = { added: 0, replaced: 0, removed: 0 };
    const seen = new Set<string>();
    for (const { id, ...source } of sources) {
      seen.add(id);
      const prev = this.entries.get(id);
      if (!prev) {
        const entry = { ...source, text: this.toText(source.html) };
        this.entries.set(id, entry);
        this.mini.add({ id, title: entry.title, text: entry.text });
        counts.added += 1;
        continue;
      }
      if (prev.title === source.title && prev.html === source.html && prev.view === source.view && prev.locked === source.locked) continue;
      const text = prev.html === source.html ? prev.text : this.toText(source.html);
      this.entries.set(id, { ...source, text });
      if (prev.title !== source.title || prev.text !== text) this.mini.replace({ id, title: source.title, text });
      counts.replaced += 1;
    }
    for (const id of [...this.entries.keys()]) {
      if (seen.has(id)) continue;
      this.entries.delete(id);
      this.mini.discard(id);
      counts.removed += 1;
    }
    return counts;
  }

  // Ranked hits in the main list (and Archive when asked); title matches weigh 3× body matches
  search(query: string, { includeArchive }: SearchScope): SearchHit[] {
    if (!query.trim()) return [];
    const inScope = (id: string) => {
      const view = this.entries.get(id)?.view;
      return view === 'notes' || (includeArchive && view === 'archive');
    };
    return this.mini.search(query, { filter: (result) => inScope(result.id) }).flatMap((result) => {
      const entry = this.entries.get(result.id);
      if (!entry) return [];
      return [{
        id: result.id, score: result.score, terms: result.terms,
        title: entry.title, text: entry.text, view: entry.view, locked: entry.locked,
      }];
    });
  }

  // Vault locked: forget every locked note. Rebuilt rather than discarded, because MiniSearch keeps a
  // discarded document's words until it vacuums.
  dropLocked() {
    if (![...this.entries.values()].some((entry) => entry.locked)) return;
    for (const [id, entry] of this.entries) {
      if (entry.locked) this.entries.delete(id);
    }
    this.mini = this.create();
    this.mini.addAll([...this.entries].map(([id, entry]) => ({ id, title: entry.title, text: entry.text })));
  }

  clear() {
    this.entries.clear();
    this.mini = this.create();
  }
}

// MiniSearch is fetched the first time search is used
export async function loadNoteSearchIndex(): Promise<NoteSearchIndex> {
  const { default: MiniSearchCtor } = await import('minisearch');
  return new NoteSearchIndex(MiniSearchCtor);
}

// Drops locked notes from the index as soon as the vault locks. Returns the unsubscribe function.
export function dropLockedOnVaultLock(index: NoteSearchIndex, vault: Pick<Vault, 'subscribe' | 'canEncrypt'>): () => void {
  return vault.subscribe(() => {
    if (!vault.canEncrypt()) index.dropLocked();
  });
}
