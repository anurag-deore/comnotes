'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from '@/lib/debounce';
import { displayTitle } from '@/lib/noteDisplay';
import type { NoteText } from '@/lib/noteCrypto';
import { dropLockedOnVaultLock, loadNoteSearchIndex, searchSources, type NoteSearchIndex } from '@/lib/noteSearch';
import { highlightSegments, snippetSegments, type Segment } from '@/lib/searchHighlight';
import { LOCKED_PREVIEW } from '@/lib/lockedNotes';
import { noteVault } from '@/lib/vault';
import type { Note } from '@/types/note';

export const SEARCH_DEBOUNCE_MS = 150;
// Enough to scan; more only costs rendering
const MAX_RESULTS = 50;
const SNIPPET_LENGTH = 120;

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SearchResult {
  note: Note;
  archived: boolean;
  title: Segment[];
  snippet: Segment[];
}

export interface NoteSearch {
  query: string;
  setQuery: (query: string) => void;
  clear: () => void;
  // Starts loading the index (on focus), so the first query doesn't wait for it
  prepare: () => void;
  includeArchive: boolean;
  setIncludeArchive: (include: boolean) => void;
  // The query that `results` are for (debounced); empty while not searching
  searched: string;
  // Hits past MAX_RESULTS are counted, not shown
  total: number;
  results: SearchResult[];
  status: SearchStatus;
}

// Search over the notes list and the decrypted locked notes (CNOTE-18). The index lives in this
// hook's state only, is kept in step with the notes only while a query is active, drops locked
// notes when the vault locks, and is cleared when the notes page unmounts (app lock).
export function useNoteSearch(notes: readonly Note[], decrypted: Readonly<Record<string, NoteText>>): NoteSearch {
  const [query, setQueryState] = useState('');
  const [searched, setSearched] = useState('');
  const [includeArchive, setIncludeArchive] = useState(false);
  const [index, setIndex] = useState<NoteSearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);

  const debounced = useMemo(() => debounce((value: string) => setSearched(value.trim()), SEARCH_DEBOUNCE_MS), []);
  useEffect(() => debounced.cancel, [debounced]);

  const prepare = useCallback(() => {
    if (index || loading.current) return;
    loading.current = true;
    setFailed(false);
    loadNoteSearchIndex()
      .then(setIndex, (error) => {
        console.error('Error loading search:', error);
        setFailed(true);
      })
      .finally(() => {
        loading.current = false;
      });
  }, [index]);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    if (value.trim()) {
      prepare();
      debounced.call(value);
    } else {
      debounced.cancel();
      setSearched('');
    }
  }, [prepare, debounced]);

  const clear = useCallback(() => setQuery(''), [setQuery]);

  // Locked notes leave the index the moment the vault locks; unmounting (app lock) empties it
  useEffect(() => {
    if (!index) return;
    const stop = dropLockedOnVaultLock(index, noteVault);
    return () => {
      stop();
      index.clear();
    };
  }, [index]);

  const sources = useMemo(() => (searched ? searchSources(notes, decrypted) : null), [searched, notes, decrypted]);

  const hits = useMemo(() => {
    if (!index || !sources) return [];
    // Incremental: only notes that changed since the last search are re-indexed
    index.sync(sources);
    return index.search(searched, { includeArchive });
  }, [index, sources, searched, includeArchive]);

  const results = useMemo(() => {
    const byId = new Map(notes.map((note) => [note.id, note]));
    return hits.slice(0, MAX_RESULTS).flatMap((hit): SearchResult[] => {
      const note = byId.get(hit.id);
      if (!note) return [];
      return [{
        note,
        archived: hit.view === 'archive',
        title: highlightSegments(displayTitle(hit.title), hit.terms),
        // Like the list, a locked note never shows decrypted text in a preview (CNOTE-7)
        snippet: hit.locked ? [{ text: LOCKED_PREVIEW, match: false }] : snippetSegments(hit.text, hit.terms, SNIPPET_LENGTH),
      }];
    });
  }, [hits, notes]);

  let status: SearchStatus = 'idle';
  if (query.trim()) status = failed ? 'error' : index ? 'ready' : 'loading';

  return {
    query, setQuery, clear, prepare, includeArchive, setIncludeArchive, searched, total: hits.length, results, status,
  };
}
