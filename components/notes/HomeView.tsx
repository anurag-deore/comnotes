'use client';

import { useDeferredValue, useMemo, type ReactNode } from 'react';
import { NotebookPen, Plus } from 'lucide-react';
import type { Note } from '@/types/note';
import type { NoteText } from '@/lib/noteCrypto';
import { noteHtmlToText } from '@/lib/noteHtml';
import { activeDays, createdGrid, noteCounts, recentNotes, streaks, wordsWritten } from '@/lib/metrics';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { NoteListItem } from '@/components/notes/NoteListItem';
import { ActivityGrid } from '@/components/notes/ActivityGrid';
import { SidebarButtons, type SidebarToggles } from '@/components/notes/EditorPane';

interface HomeViewProps extends SidebarToggles {
  // Every loaded note, Trash included
  notes: Note[];
  // Locked notes' decrypted text, in memory only (CNOTE-7)
  decrypted: Readonly<Record<string, NoteText>>;
  unlockedTitles: Record<string, string>;
  now: Date;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

const number = (n: number) => n.toLocaleString('en-US');
const days = (n: number) => `${number(n)} ${n === 1 ? 'day' : 'days'}`;
const notesWord = (n: number) => `${number(n)} ${n === 1 ? 'note' : 'notes'}`;

function Stat({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-canvas-soft p-4">
      <dt className="text-body-sm text-body">{label}</dt>
      <dd className="mt-1 text-display-xs text-ink tabular-nums">{value}</dd>
      {children && <dd className="mt-1 text-caption text-body">{children}</dd>}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-body-md font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

// Home (CNOTE-23): shown while no note is open. Everything comes from the notes already loaded;
// it works on a deferred copy and only while mounted, so typing in a note never recomputes it.
export function HomeView({ notes, decrypted, unlockedTitles, now, onSelect, onCreate, ...toggles }: HomeViewProps) {
  const list = useDeferredValue(notes);
  const texts = useDeferredValue(decrypted);

  const counts = useMemo(() => noteCounts(list), [list]);
  // The costliest metric (parses every note's HTML): only redone when the notes or decrypted texts change
  const words = useMemo(() => wordsWritten(list, texts, noteHtmlToText), [list, texts]);
  const streak = useMemo(() => streaks(activeDays(list, now), now), [list, now]);
  const grid = useMemo(() => createdGrid(list, now), [list, now]);
  const recent = useMemo(() => recentNotes(list), [list]);

  const today = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const hasNotes = notes.length > 0;
  let streakNote = 'Create or edit a note to start one';
  if (streak.activeToday) streakNote = 'Including today';
  else if (streak.current > 0) streakNote = 'Write today to keep it going';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas md:rounded-xl">
      <header className="flex shrink-0 items-center gap-1 border-b border-canvas-soft px-2 py-2 md:gap-3 md:px-4">
        <SidebarButtons {...toggles} />
        <h1 className="min-w-0 flex-1 truncate px-2 py-1 text-display-xs text-ink">Home</h1>
        {hasNotes && (
          <Button variant="secondary" size="sm" onClick={onCreate}>
            <Plus aria-hidden className="size-4" />
            New note
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl animate-fade-in flex-col gap-8 p-4 md:p-8">
          <p className="text-body-sm text-body">{today}</p>

          {!hasNotes ? (
            <EmptyState
              icon={NotebookPen}
              title="No notes yet"
              className="w-full"
              action={
                <Button variant="primary" onClick={onCreate}>
                  <Plus aria-hidden className="size-5" />
                  New note
                </Button>
              }
            >
              Write your first note. It saves as you type.
            </EmptyState>
          ) : (
            <>
              <Section id="home-counts" title="Your notes">
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Notes" value={number(counts.notes)} />
                  <Stat label="Archived" value={number(counts.archived)} />
                  <Stat label="Locked" value={number(counts.locked)} />
                  <Stat label="In Trash" value={number(counts.trash)} />
                </dl>
              </Section>

              <Section id="home-writing" title="Writing">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Stat label="Words written" value={number(words.words)}>
                    In {notesWord(words.counted)}, Trash not included.
                    {words.excludedLocked > 0 && (
                      <> Excludes {words.excludedLocked} locked {words.excludedLocked === 1 ? 'note' : 'notes'}.</>
                    )}
                  </Stat>
                  <Stat label="Current streak" value={days(streak.current)}>
                    {streakNote}
                  </Stat>
                  <Stat label="Longest streak" value={days(streak.longest)}>
                    Days in a row with a note created or edited
                  </Stat>
                </dl>
              </Section>

              <Section id="home-created" title="Notes created">
                <ActivityGrid grid={grid} />
              </Section>

              <Section id="home-recent" title="Recent notes">
                {recent.length === 0 ? (
                  <p className="text-body-sm text-body">Nothing here yet: your notes are all in Trash.</p>
                ) : (
                  <ul role="list" aria-labelledby="home-recent" className="flex flex-col gap-2 rounded-xl bg-canvas-soft p-2">
                    {recent.map((note) => (
                      <NoteListItem
                        key={note.id}
                        note={note}
                        active={false}
                        now={now}
                        onSelect={onSelect}
                        unlockedTitle={unlockedTitles[note.id]}
                      />
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
