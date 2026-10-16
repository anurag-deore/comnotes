import type { NoteDraft, SaveResult } from '@/lib/notes';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface AutosaverOptions {
  save: (draft: NoteDraft) => Promise<SaveResult>;
  delayMs: number;
  retryMs: number;
  onStatus: (status: SaveStatus) => void;
  onConflict: (result: Extract<SaveResult, { status: 'conflict' }>) => void;
}

// Debounced per-note saving, kept free of React and Firebase so it can be unit tested
export function createAutosaver({ save, delayMs, retryMs, onStatus, onConflict }: AutosaverOptions) {
  const pending = new Map<string, NoteDraft>();
  const inFlight = new Map<string, Promise<void>>();
  // Last rev we know the server has for each note, so we don't conflict with our own saves
  const revs = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failed = false;
  let status: SaveStatus = 'idle';

  const report = () => {
    const next = failed ? 'error' : inFlight.size ? 'saving' : pending.size ? 'pending' : 'saved';
    if (next !== status) onStatus((status = next));
  };

  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), ms);
  };

  async function saveOne(id: string) {
    const draft = pending.get(id)!;
    pending.delete(id);
    try {
      const result = await save({ ...draft, rev: Math.max(draft.rev, revs.get(id) ?? 0) });
      failed = false;
      if (result.status === 'saved') {
        revs.set(id, result.rev);
        return;
      }
      revs.set(id, result.server.rev);
      revs.set(result.copy.id, result.copy.rev);
      // Edits typed during the conflicting save belong with the local version, i.e. the copy
      const newer = pending.get(id);
      if (newer) {
        pending.delete(id);
        pending.set(result.copy.id, { ...newer, id: result.copy.id, rev: result.copy.rev });
      }
      onConflict(result);
    } catch {
      failed = true;
      if (!pending.has(id)) pending.set(id, draft);
      schedule(retryMs);
    }
  }

  function start(id: string) {
    const saving = saveOne(id).finally(() => {
      inFlight.delete(id);
      report();
    });
    inFlight.set(id, saving);
    report();
  }

  // Saves everything now; resolves true when nothing is left unsaved
  async function flush() {
    clearTimeout(timer);
    failed = false;
    while (true) {
      for (const id of [...pending.keys()]) {
        if (!inFlight.has(id)) start(id);
      }
      if (!inFlight.size) break;
      await Promise.all(inFlight.values());
      // Leave failed drafts to the retry timer instead of hammering the server
      if (failed) break;
    }
    report();
    return !failed && !pending.size && !inFlight.size;
  }

  return {
    change(draft: NoteDraft) {
      pending.set(draft.id, draft);
      report();
      schedule(delayMs);
    },
    flush,
    isDirty: (id: string) => pending.has(id) || inFlight.has(id),
    hasPending: () => pending.size > 0 || inFlight.size > 0,
    dispose: () => clearTimeout(timer),
  };
}

export type Autosaver = ReturnType<typeof createAutosaver>;
