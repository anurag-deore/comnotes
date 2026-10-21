import type { NoteDraft, SaveResult } from '@/lib/notes';

// 'offline': unsaved edits are waiting for the connection (CNOTE-20)
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'offline';

interface AutosaverOptions {
  save: (draft: NoteDraft) => Promise<SaveResult>;
  delayMs: number;
  retryMs: number;
  onStatus: (status: SaveStatus) => void;
  onConflict: (result: Extract<SaveResult, { status: 'conflict' }>) => void;
  // The note was deleted for good; its unsaved draft has been dropped
  onGone: (draft: NoteDraft) => void;
  // Saves need the server (a rev-checked transaction), so none are tried while this is false (CNOTE-20)
  isOnline?: () => boolean;
}

// Debounced per-note saving, kept free of React and Firebase so it can be unit tested
export function createAutosaver({
  save, delayMs, retryMs, onStatus, onConflict, onGone, isOnline = () => true,
}: AutosaverOptions) {
  const pending = new Map<string, NoteDraft>();
  const inFlight = new Map<string, Promise<void>>();
  // The draft each in-flight save is writing, so draft() can still return it
  const sending = new Map<string, NoteDraft>();
  // Last rev we know the server has for each note, so we don't conflict with our own saves
  const revs = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failed = false;
  let status: SaveStatus = 'idle';

  const report = () => {
    let next: SaveStatus = 'saved';
    if (inFlight.size) next = 'saving';
    else if (pending.size && !isOnline()) next = 'offline';
    else if (failed) next = 'error';
    else if (pending.size) next = 'pending';
    if (next !== status) onStatus((status = next));
  };

  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), ms);
  };

  async function saveOne(id: string) {
    const draft = pending.get(id)!;
    pending.delete(id);
    sending.set(id, draft);
    try {
      const result = await save({ ...draft, rev: Math.max(draft.rev, revs.get(id) ?? 0) });
      failed = false;
      if (result.status === 'saved') {
        revs.set(id, result.rev);
        return;
      }
      if (result.status === 'gone') {
        // Retrying can never succeed, so drop this note's edits, including any typed meanwhile
        revs.delete(id);
        pending.delete(id);
        sending.delete(id);
        onGone(draft);
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
      // Offline, the reconnect flushes instead of a timer that can only fail
      if (isOnline()) schedule(retryMs);
    }
  }

  function start(id: string) {
    const saving = saveOne(id).finally(() => {
      inFlight.delete(id);
      sending.delete(id);
      report();
    });
    inFlight.set(id, saving);
    report();
  }

  // Saves everything now; resolves true when nothing is left unsaved
  async function flush() {
    clearTimeout(timer);
    // Offline nothing can be saved: keep the drafts and say so at once, so a lock doesn't wait
    if (!isOnline()) {
      report();
      return !pending.size && !inFlight.size;
    }
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
    // Latest unsaved text of a note, so a remounted page shows it instead of the server copy
    draft: (id: string) => pending.get(id) ?? sending.get(id),
    hasPending: () => pending.size > 0 || inFlight.size > 0,
    // Call on online/offline events: back online, every waiting draft is saved with the rev it was
    // based on, so an edit made elsewhere meanwhile still ends up as a conflict copy (CNOTE-20)
    connectionChanged() {
      report();
      if (isOnline() && pending.size) void flush();
    },
    dispose: () => clearTimeout(timer),
  };
}

export type Autosaver = ReturnType<typeof createAutosaver>;
