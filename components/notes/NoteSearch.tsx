'use client';

import type { KeyboardEvent } from 'react';
import { Lock, Search, SearchX, X } from 'lucide-react';
import { IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatRelativeTime } from '@/lib/noteDisplay';
import type { Segment } from '@/lib/searchHighlight';
import type { NoteSearch, SearchResult } from '@/hooks/useNoteSearch';
import { cn } from '@/lib/cn';

// Highlighted text as React elements: plain strings and <mark>, never HTML (CNOTE-12)
export function Highlighted({ segments }: { segments: Segment[] }) {
  return segments.map((segment, i) => (segment.match ? (
    // Not colour alone: matches are also bold
    <mark key={i} className="rounded-[2px] bg-primary-pale font-semibold text-ink">{segment.text}</mark>
  ) : (
    <span key={i}>{segment.text}</span>
  )));
}

export const optionId = (listboxId: string, index: number) => `${listboxId}-option-${index}`;

interface SearchFieldProps {
  search: NoteSearch;
  inputId: string;
  listboxId: string;
  activeIndex: number;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

// The search landmark at the top of the sidebar. The field is a combobox: focus stays in it while
// the arrow keys move through the results listbox (aria-activedescendant).
export function SearchField({ search, inputId, listboxId, activeIndex, onKeyDown }: SearchFieldProps) {
  const searching = search.query.trim() !== '';
  return (
    <div role="search" aria-label="Search notes" className="relative">
      <label htmlFor={inputId} className="sr-only">Search notes</label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-body" />
      <input
        id={inputId}
        data-search-input
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={searching}
        aria-controls={searching ? listboxId : undefined}
        aria-activedescendant={searching && activeIndex >= 0 ? optionId(listboxId, activeIndex) : undefined}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder="Search notes"
        value={search.query}
        onChange={(event) => search.setQuery(event.target.value)}
        onFocus={search.prepare}
        onKeyDown={onKeyDown}
        className={cn(
          'min-h-11 w-full rounded-xl border border-transparent bg-canvas py-2 pr-11 pl-9 text-body-sm text-ink',
          'transition-[border-color] placeholder:text-mute hover:border-canvas-soft focus:border-ink focus:outline-none',
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
      />
      {search.query && (
        <IconButton
          label="Clear search"
          icon={X}
          onClick={search.clear}
          className="absolute top-0 right-0 hover:bg-canvas-soft"
        />
      )}
    </div>
  );
}

interface SearchResultsProps {
  search: NoteSearch;
  listboxId: string;
  activeIndex: number;
  selectedId: string | null;
  now: Date;
  onOpen: (id: string) => void;
  // The results' text summary, also announced by the sidebar's live region
  summary: string;
}

// Shown in place of the notes list while a query is active
export function SearchResults({ search, listboxId, activeIndex, selectedId, now, onOpen, summary }: SearchResultsProps) {
  const { results, status } = search;
  return (
    <div className="flex animate-fade-in flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 px-1">
        <p className="text-body-sm text-body" aria-hidden>{summary}</p>
        <label className="-mr-1 flex min-h-11 cursor-pointer items-center gap-2 px-1 text-body-sm text-ink">
          <input
            type="checkbox"
            checked={search.includeArchive}
            onChange={(event) => search.setIncludeArchive(event.target.checked)}
            className="size-4 cursor-pointer accent-ink"
          />
          Include Archive
        </label>
      </div>
      {status === 'error' ? (
        <EmptyState icon={SearchX} title="Search isn't available" className="bg-canvas py-10">
          Search couldn&apos;t load. Check your connection and try again.
        </EmptyState>
      ) : status === 'ready' && search.searched && results.length === 0 ? (
        <EmptyState icon={SearchX} title="No matching notes" className="bg-canvas py-10">
          {search.includeArchive ? 'Try other words.' : 'Try other words, or include Archive.'}
        </EmptyState>
      ) : null}
      <ul
        id={listboxId}
        role="listbox"
        aria-label="Search results"
        className={cn('flex flex-col gap-2', results.length === 0 && 'hidden')}
      >
        {results.map((result, i) => (
          <ResultOption
            key={result.note.id}
            id={optionId(listboxId, i)}
            result={result}
            active={i === activeIndex}
            current={result.note.id === selectedId}
            now={now}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </div>
  );
}

interface ResultOptionProps {
  id: string;
  result: SearchResult;
  active: boolean;
  current: boolean;
  now: Date;
  onOpen: (id: string) => void;
}

// A result row, styled like a list row. Picked with the arrow keys from the field, or by tap/click.
function ResultOption({ id, result, active, current, now, onOpen }: ResultOptionProps) {
  const { note } = result;
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onClick={() => onOpen(note.id)}
      className={cn(
        'relative flex min-h-11 cursor-pointer flex-col gap-0.5 overflow-hidden rounded-sm border bg-canvas py-3 pr-4 pl-5',
        'transition-[color,background-color,border-color]',
        active ? 'border-ink bg-primary-pale/40' : 'border-transparent hover:border-canvas-soft hover:bg-primary-pale/40',
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1.5', current ? 'bg-primary' : 'bg-transparent')} />
      <span className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-body-sm font-semibold text-ink">
          {note.locked && <Lock aria-hidden className="size-3.5 shrink-0" />}
          {note.locked && <span className="sr-only">Locked: </span>}
          <span className="truncate"><Highlighted segments={result.title} /></span>
        </span>
        <span className="flex shrink-0 items-baseline gap-2 text-caption text-body">
          {result.archived && <span className="rounded-sm bg-canvas-soft px-1.5 py-0.5 text-ink">Archived</span>}
          <time dateTime={note.updatedAt.toISOString()}>{formatRelativeTime(note.updatedAt, now)}</time>
        </span>
      </span>
      <span className="line-clamp-2 font-reading text-body-sm text-body">
        <Highlighted segments={result.snippet} />
      </span>
    </li>
  );
}

// What the live region says (and the visible summary shows)
export function searchSummary(search: NoteSearch): string {
  if (search.status === 'error') return 'Search is not available.';
  if (search.status !== 'ready' || !search.searched) return 'Searching…';
  const { total } = search;
  if (total === 0) return 'No results';
  const count = `${total} ${total === 1 ? 'result' : 'results'}`;
  return search.results.length < total ? `${count}, showing the first ${search.results.length}` : count;
}
