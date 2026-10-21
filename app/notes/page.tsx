'use client';

import {
  useCallback, useEffect, useEffectEvent, useRef, useState, useMemo, useSyncExternalStore, type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import {
  archiveNote, createNote, deleteNotesForever, purgeExpiredTrash, restoreNote, subscribeNotes, trashNote, unarchiveNote,
} from '@/lib/notes';
import { noteView, visibleNotes, type NoteView } from '@/lib/noteViews';
import { useAutosave } from '@/hooks/useAutosave';
import { useNoteMigration } from '@/hooks/useNoteMigration';
import { useNoteSearch } from '@/hooks/useNoteSearch';
import { onSearchFocusRequest, requestSearchFocus } from '@/lib/searchFocus';
import {
  COMMANDS, isBlockedTarget, isTypingTarget, matchShortcut, toKeyInput, type CommandId, type CommandState,
} from '@/lib/shortcuts';
import { oppositeTheme } from '@/lib/theme';
import { setThemePreference } from '@/lib/themeStore';
import { Note } from '@/types/note';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useNow } from '@/hooks/useNow';
import { displayTitle } from '@/lib/noteDisplay';
import { LOCKED_TITLE, noteLabel, withDraft } from '@/lib/lockedNotes';
import { noteVault } from '@/lib/vault';
import type { NoteText } from '@/lib/noteCrypto';
import { DESKTOP, MobileSidebar, Sidebar } from '@/components/notes/Sidebar';
import { EditorPane } from '@/components/notes/EditorPane';
import { HomeView } from '@/components/notes/HomeView';
import { LockedNotePane, type LockedState } from '@/components/notes/LockedNotePane';
import { LockDialog, type LockDialogMode } from '@/components/notes/LockDialog';
import { NotesSkeleton } from '@/components/notes/NotesSkeleton';
import { MigrationBanner } from '@/components/notes/MigrationBanner';
import { CommandPalette } from '@/components/notes/CommandPalette';
import { ShortcutsHelp } from '@/components/notes/ShortcutsHelp';
import { useIsMac } from '@/components/ui/Kbd';
import { animateListChange } from '@/lib/listMotion';
import { noteListsChanged, prefersReducedMotion, runViewTransition } from '@/lib/motion';
import { browserStorage, readSidebarHidden, writeSidebarHidden } from '@/lib/sidebarPreference';

// A locked note's decrypted text and the IV of the payload it matches (CNOTE-7). Memory only.
type Decrypted = NoteText & { iv: string };

// Focuses (and selects) the search field inside `scope`: the desktop sidebar or the drawer
function focusSearchField(scope: string) {
  const field = document.querySelector<HTMLInputElement>(`${scope} [data-search-input]`);
  field?.focus();
  field?.select();
}

// A quiet toast with an Undo button (Trash, Archive)
function undoToast(message: ReactNode, onUndo: () => void) {
  toast(t => (
    <span className="flex items-center gap-3">
      <span className="min-w-0 truncate">{message}</span>
      <button
        type="button"
        onClick={() => {
          toast.dismiss(t.id);
          onUndo();
        }}
        className="-my-2 min-h-11 shrink-0 rounded-sm px-2 font-semibold text-ink underline underline-offset-2"
      >
        Undo
      </button>
    </span>
  ));
}

export default function NotesPage() {
  const { logout } = useAuth();
  const [localNotes, setLocalNotes] = useState<Note[]>([]);
  // The latest list, ahead of React state while an animated update waits for its View Transition
  const notesRef = useRef<Note[]>([]);
  // Store only the ID of the selected note
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Desktop: sidebar hidden by the user (remembered in this browser). Phones: the notes drawer is open.
  // Read on the client only matters after loading, as the skeleton doesn't show the sidebar.
  const [isSidebarHidden, setIsSidebarHidden] = useState(() => readSidebarHidden(browserStorage()));
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Which list the sidebar shows: notes, Archive (CNOTE-17) or Trash
  const [view, setView] = useState<NoteView>('notes');
  // A just-created note whose title gets focus
  const [focusTitleId, setFocusTitleId] = useState<string | null>(null);
  const now = useNow();
  // Set when the drawer closes because a note was opened, so focus goes to the note, not the menu button
  const drawerClosedByNavigation = useRef(false);
  // Set when the drawer opens because search was asked for, so its field gets focus
  const drawerOpenedForSearch = useRef(false);
  // Locked notes (CNOTE-7): decrypted text by note id, payload IVs that failed to decrypt, decryptions
  // running, and a counter per note so only the latest edit's encryption is queued
  const [plain, setPlain] = useState<Record<string, Decrypted>>({});
  const [failedIvs, setFailedIvs] = useState<ReadonlySet<string>>(() => new Set());
  const decrypting = useRef(new Set<string>());
  const sealCount = useRef(new Map<string, number>());
  const [lockDialog, setLockDialog] = useState<LockDialogMode | null>(null);
  const vaultVersion = useSyncExternalStore(noteVault.subscribe, noteVault.getVersion, noteVault.getVersion);
  // Notes saved by older versions (CNOTE-21), checked once the list has loaded
  const migration = useNoteMigration(!isLoading);
  // Search (CNOTE-18) over the notes and, while the vault is unlocked, the decrypted locked notes
  const search = useNoteSearch(localNotes, plain);
  // Command palette and shortcuts help (CNOTE-24)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const mac = useIsMac();

  // Every change to the notes goes through here. Adding, removing or re-ordering rows animates
  // (View Transition, lib/listMotion.ts); edits that keep the order are applied as usual.
  const commitNotes = useCallback((update: (prev: Note[]) => Note[], animate = true) => {
    const prev = notesRef.current;
    const next = update(prev);
    notesRef.current = next;
    if (!animate || !noteListsChanged(prev, next)) {
      setLocalNotes(next);
      return;
    }
    // The transition applies the latest list, so updates made while it starts aren't lost
    animateListChange(() => flushSync(() => setLocalNotes(notesRef.current)));
  }, []);

  // On a conflict the server version replaces ours and our version shows up as a copy
  const { status, change, draft, flush } = useAutosave(({ server, copy }) => {
    commitNotes(prevNotes => [
      copy,
      ...prevNotes.filter(note => note.id !== copy.id).map(note => (note.id === server.id ? server : note)),
    ]);
    toast.error(
      copy.locked
        ? `"${noteLabel(server)}" was changed elsewhere. Your version was saved as a locked conflict copy.`
        : `"${noteLabel(server)}" was changed elsewhere. Your version was saved as "${copy.title}".`,
    );
  }, (dropped) => {
    const title = dropped.sealed ? LOCKED_TITLE : displayTitle(dropped.title);
    toast.error(`"${title}" no longer exists, so its unsaved changes were discarded.`);
  });

  // Locking the app forgets every decrypted note at once. Encryptions already running still finish
  // and queue their ciphertext, so the last keystrokes aren't lost.
  useEffect(() => noteVault.subscribe(() => {
    if (!noteVault.canEncrypt()) setPlain({});
  }), []);

  // Neither archived nor in Trash; also what search will look through (lib/noteViews.ts)
  const activeNotes = useMemo(() => visibleNotes(localNotes), [localNotes]);
  const archivedNotes = useMemo(() => visibleNotes(localNotes, 'archive'), [localNotes]);
  const trashedNotes = useMemo(
    () => localNotes.filter((note): note is Note & { deletedAt: Date } => note.deletedAt !== null),
    [localNotes],
  );

  // Derive the selected note from the notes not in Trash, so trashed notes can't be edited.
  // Archived notes open and edit like any other (CNOTE-17).
  const selectedNote = useMemo(() => {
    return localNotes.find(note => note.id === selectedNoteId && note.deletedAt === null) || null;
  }, [localNotes, selectedNoteId]);

  // Keep the list live; changes from other tabs and devices arrive here
  // app/notes/layout.tsx only renders this page while unlocked
  useEffect(() => {
    let isFirstSnapshot = true;
    let purged = false;
    return subscribeNotes(
      (serverNotes, fromCache) => {
        // A note with unsaved edits shows them until its save lands, even after a lock and unlock.
        // Drafts carry no deletedAt, so the server decides whether the note is in Trash.
        // The first load isn't animated: the skeleton is showing
        commitNotes(() => serverNotes.map(note => withDraft(note, draft(note.id))), !isFirstSnapshot);
        if (isFirstSnapshot) {
          isFirstSnapshot = false;
          // Select the first note by default, only on initial load
          setSelectedNoteId(visibleNotes(serverNotes)[0]?.id ?? null);
          setIsLoading(false);
        }
        // Cached data may be stale (a note restored elsewhere), so only the server's list is purged (CNOTE-20)
        if (!purged && !fromCache) {
          purged = true;
          purgeExpiredTrash(serverNotes).catch(error => console.error('Error purging trash:', error));
        }
      },
      (error) => {
        setIsLoading(false);
        toast.error('Failed to load notes');
        console.error('Error loading notes:', error);
      },
    );
  }, [draft, commitNotes]);

  // Decrypts locked notes the vault has a key for, and again whenever a new payload arrives (an edit
  // from elsewhere). Our own saves carry the IV we already have, so they aren't decrypted again.
  useEffect(() => {
    for (const note of localNotes) {
      const payload = note.encrypted;
      const known = plain[note.id];
      if (!payload || known?.iv === payload.iv || failedIvs.has(payload.iv) || decrypting.current.has(payload.iv)) continue;
      if (!noteVault.hasKeyFor(payload)) continue;
      decrypting.current.add(payload.iv);
      noteVault.decrypt(note.id, payload)
        .then(
          (text) => {
            // Dropped if the vault locked meanwhile, or the note was edited here meanwhile
            if (!noteVault.hasKeyFor(payload)) return;
            setPlain(prev => (prev[note.id] === known ? { ...prev, [note.id]: { ...text, iv: payload.iv } } : prev));
          },
          (error) => {
            console.error('Error decrypting note:', error);
            setFailedIvs(prev => new Set(prev).add(payload.iv));
          },
        )
        .finally(() => decrypting.current.delete(payload.iv));
    }
  }, [localNotes, plain, failedIvs, vaultVersion]);

  // Encrypts a locked note's text and queues the ciphertext for saving. Resolves to false when a
  // newer edit (or Remove lock) superseded it. Plaintext never goes to the saver. `keepOpen` (Lock
  // note) keeps the just-locked note decrypted on screen.
  const sealAndSave = (note: Note, text: NoteText, keepOpen = false) => {
    const count = (sealCount.current.get(note.id) ?? 0) + 1;
    sealCount.current.set(note.id, count);
    return noteVault.encrypt(note.id, text, note.encrypted ?? undefined).then((payload) => {
      if (sealCount.current.get(note.id) !== count) return false;
      // Once the app locked, nothing decrypted comes back into memory; the ciphertext is still queued
      const open = noteVault.hasKeyFor(payload);
      setPlain(prev => {
        const shown = prev[note.id] ?? (keepOpen ? text : undefined);
        return open && shown ? { ...prev, [note.id]: { ...shown, iv: payload.iv } } : prev;
      });
      commitNotes(prevNotes => prevNotes.map(n => (
        n.id === note.id ? { ...n, title: '', content: '', locked: true, encrypted: payload } : n
      )));
      change({ id: note.id, title: '', content: '', rev: note.rev, sealed: { noteId: note.id, payload } });
      return true;
    });
  };

  // Applies an edit locally and queues an autosave of just that note
  const updateSelectedNote = (fields: Partial<Pick<Note, 'title' | 'content'>>) => {
    if (!selectedNote) return;
    if (selectedNote.locked) {
      const known = plain[selectedNote.id];
      if (!known) return;
      const text = { title: fields.title ?? known.title, content: fields.content ?? known.content };
      setPlain(prev => ({ ...prev, [selectedNote.id]: { ...text, iv: prev[selectedNote.id]?.iv ?? known.iv } }));
      sealAndSave(selectedNote, text).catch(error => {
        console.error('Error encrypting note:', error);
        toast.error("Couldn't encrypt your change. Unlock the note and try again.");
      });
      return;
    }
    const updated = { ...selectedNote, ...fields };
    commitNotes(prevNotes => prevNotes.map(note => (note.id === updated.id ? updated : note)));
    change({ id: updated.id, title: updated.title, content: updated.content, rev: updated.rev });
  };

  // Handles changes in the editor content
  const handleEditorChange = (content: string) => updateSelectedNote({ content });

  // Handles changes to the note title input
  const handleTitleChange = (newTitle: string) => updateSelectedNote({ title: newTitle });

  // A no-op when the drawer is closed; opening it resets the flag
  const closeDrawerForNavigation = useCallback(() => {
    drawerClosedByNavigation.current = true;
    setIsDrawerOpen(false);
  }, []);

  // Creates a new note in Firebase, opens it and focuses its title. Only a failure toasts.
  const createNewNote = async () => {
    try {
      const createdNote = await createNote();
      commitNotes(prevNotes => [createdNote, ...prevNotes.filter(note => note.id !== createdNote.id)]);
      setSelectedNoteId(createdNote.id);
      setFocusTitleId(createdNote.id);
      setView('notes');
      // The new note is empty, so it would not be among the results
      search.clear();
      closeDrawerForNavigation();
    } catch (error) {
      console.error('Error creating note:', error);
      toast.error('Failed to create note');
    }
  };

  // Restores a note from Trash and selects it
  const restore = (id: string) => {
    setSelectedNoteId(id);
    restoreNote(id).catch(error => {
      console.error('Error restoring note:', error);
      toast.error('Failed to restore note');
    });
  };

  // Lock note: encrypts the open note in place. Needs a key; the dialog gets one first.
  const lockSelectedNote = async () => {
    if (!selectedNote || selectedNote.locked) return;
    try {
      if (await sealAndSave(selectedNote, { title: selectedNote.title, content: selectedNote.content }, true)) void flush();
    } catch (error) {
      console.error('Error locking note:', error);
      toast.error("Couldn't lock the note. Try again.");
    }
  };

  // Remove lock: saves the decrypted text as plain text again; pending encryptions are dropped
  const removeLockFromSelectedNote = () => {
    if (!selectedNote?.locked) return;
    const { id, rev } = selectedNote;
    const text = plain[id];
    if (!text) return;
    sealCount.current.delete(id);
    commitNotes(prevNotes => prevNotes.map(n => (
      n.id === id ? { ...n, title: text.title, content: text.content, locked: false, encrypted: null } : n
    )));
    setPlain(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    change({ id, title: text.title, content: text.content, rev });
    void flush();
  };

  // An existing locked note checks the passphrase; without one this is the first lock (setup)
  const lockedSample = useMemo(() => {
    const note = localNotes.find(n => n.encrypted);
    return note?.encrypted ? { id: note.id, payload: note.encrypted } : null;
  }, [localNotes]);

  const unlockedTitles = useMemo(
    () => Object.fromEntries(Object.entries(plain).map(([id, text]) => [id, text.title])),
    [plain],
  );

  const toggleLock = () => {
    if (!selectedNote) return;
    if (selectedNote.locked) setLockDialog('remove');
    else if (noteVault.canEncrypt()) void lockSelectedNote();
    else setLockDialog(lockedSample ? 'verify' : 'setup');
  };

  const confirmLockDialog = () => {
    const mode = lockDialog;
    setLockDialog(null);
    if (mode === 'remove') removeLockFromSelectedNote();
    else void lockSelectedNote();
  };

  // A note leaving its list selects the next one in that list (or the previous one, or none)
  const selectNeighbourOf = (note: Note) => {
    const list = visibleNotes(localNotes, noteView(note));
    const index = list.findIndex(n => n.id === note.id);
    setSelectedNoteId((list[index + 1] ?? list[index - 1])?.id ?? null);
  };

  // Moves the selected note to Trash. Unsaved edits keep saving to it, so restoring brings them back.
  // The live snapshot shows the change at once and rolls it back if the write fails.
  const deleteSelectedNote = () => {
    if (!selectedNote) return;
    const { id } = selectedNote;
    selectNeighbourOf(selectedNote);
    trashNote(id).catch(error => {
      console.error('Error moving note to Trash:', error);
      toast.error('Failed to move note to Trash');
    });
    undoToast(<>Moved &quot;{noteLabel(selectedNote)}&quot; to Trash</>, () => restore(id));
  };

  // Back to the notes list; `reselect` (Undo of Archive) opens it again
  const unarchive = (id: string, reselect = false) => {
    if (reselect) setSelectedNoteId(id);
    unarchiveNote(id).catch(error => {
      console.error('Error unarchiving note:', error);
      toast.error('Failed to unarchive note');
    });
  };

  // Unarchive from the editor or an Archive row: the note stays open if it was
  const unarchiveWithToast = (note: Note) => {
    unarchive(note.id);
    toast(`Moved "${noteLabel(note)}" back to notes`);
  };

  // Archive (CNOTE-17): like Trash, the note leaves the list at once and Undo brings it back.
  // Only archivedAt is written, so unsaved edits keep saving and a locked note isn't decrypted.
  const toggleArchiveSelected = () => {
    if (!selectedNote) return;
    if (selectedNote.archivedAt) {
      unarchiveWithToast(selectedNote);
      return;
    }
    const { id } = selectedNote;
    selectNeighbourOf(selectedNote);
    archiveNote(id).catch(error => {
      console.error('Error archiving note:', error);
      toast.error('Failed to archive note');
    });
    undoToast(<>Archived &quot;{noteLabel(selectedNote)}&quot;</>, () => unarchive(id, true));
  };

  const deleteForever = (ids: string[]) => {
    deleteNotesForever(ids).catch(error => {
      console.error('Error deleting notes:', error);
      toast.error('Failed to delete notes');
    });
  };

  // Selecting a note on a phone also closes the drawer. Stable, so list rows can skip re-rendering.
  const handleNoteSelect = useCallback((id: string) => {
    setSelectedNoteId(id);
    closeDrawerForNavigation();
  }, [closeDrawerForNavigation]);

  // Opening a search result keeps the query; on desktop focus moves to the note (the drawer does
  // that itself when it closes)
  const openSearchResult = (id: string) => {
    const inDrawer = isDrawerOpen;
    handleNoteSelect(id);
    if (!inDrawer) document.getElementById('note-editor')?.focus();
  };

  // requestSearchFocus() (lib/searchFocus.ts; CNOTE-24 binds a shortcut to it): focus the visible
  // field, showing the desktop sidebar or opening the drawer first
  useEffect(() => onSearchFocusRequest(() => {
    if (window.matchMedia(DESKTOP).matches) {
      if (isSidebarHidden) {
        writeSidebarHidden(browserStorage(), false);
        flushSync(() => setIsSidebarHidden(false));
      }
      focusSearchField('#notes-sidebar');
    } else if (isDrawerOpen) {
      focusSearchField('#notes-drawer');
    } else {
      drawerClosedByNavigation.current = false;
      drawerOpenedForSearch.current = true;
      setIsDrawerOpen(true);
    }
  }), [isSidebarHidden, isDrawerOpen]);

  const onDrawerOpenAutoFocus = (event: Event) => {
    if (!drawerOpenedForSearch.current) return;
    drawerOpenedForSearch.current = false;
    event.preventDefault();
    focusSearchField('#notes-drawer');
  };

  // After the drawer closes: a new note keeps focus on its title; an opened note focuses the editor area
  const onDrawerCloseAutoFocus = (event: Event) => {
    if (!drawerClosedByNavigation.current) return;
    drawerClosedByNavigation.current = false;
    event.preventDefault();
    const main = document.getElementById('note-editor');
    if (main && !main.contains(document.activeElement)) main.focus();
  };

  const clearFocusTitle = useCallback(() => setFocusTitleId(null), []);

  // Home (CNOTE-23): closing the open note shows Home in the main area
  const goHome = useCallback(() => {
    setSelectedNoteId(null);
    closeDrawerForNavigation();
  }, [closeDrawerForNavigation]);

  // The banner goes away once every older note is updated, or when hidden; focus moves to the note area
  const focusNoteArea = () => document.getElementById('note-editor')?.focus();
  const updateOlderNotes = () => {
    void migration.update().then((remaining) => {
      if (remaining === 0) focusNoteArea();
    });
  };
  const hideMigrationBanner = () => {
    migration.dismiss();
    focusNoteArea();
  };

  // Hide/show the desktop sidebar: it slides while the editor card resizes (instant with reduced motion)
  const toggleSidebar = () => {
    const hidden = !isSidebarHidden;
    writeSidebarHidden(browserStorage(), hidden);
    runViewTransition(() => flushSync(() => setIsSidebarHidden(hidden)), {
      doc: document,
      reduced: prefersReducedMotion(window),
      kind: 'sidebar',
    });
  };

  // The notes list on any screen: the sidebar (768px and up) or the drawer
  const openDrawer = () => {
    drawerClosedByNavigation.current = false;
    setIsDrawerOpen(true);
  };
  const toggleNotesList = () => {
    if (window.matchMedia(DESKTOP).matches) toggleSidebar();
    else if (isDrawerOpen) setIsDrawerOpen(false);
    else openDrawer();
  };

  // Show Archive / Show Trash from the palette: the list replaces any search, and becomes visible
  const showView = (next: NoteView) => {
    search.clear();
    setView(next);
    if (!window.matchMedia(DESKTOP).matches) openDrawer();
    else if (isSidebarHidden) toggleSidebar();
  };

  // Light ⇄ dark from whatever shows now (System included); the choice is then explicit
  const toggleTheme = () => {
    const shown = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    setThemePreference(oppositeTheme(shown));
  };

  // What the shortcuts and the palette can do right now (lib/shortcuts.ts `when`). Kept stable while
  // these flags hold, so the palette's highlighted row doesn't reset when the note is edited.
  const hasNote = selectedNote !== null;
  const noteArchived = selectedNote?.archivedAt != null;
  const noteLocked = selectedNote?.locked === true;
  const noteReadable = hasNote && (!noteLocked || plain[selectedNote.id] !== undefined);
  const commandState = useMemo<CommandState>(
    () => ({ hasNote, noteArchived, noteLocked, noteReadable }),
    [hasNote, noteArchived, noteLocked, noteReadable],
  );

  // Every command's handler (the registry in lib/shortcuts.ts has the keys and labels)
  const commandHandlers: Record<CommandId, () => void> = {
    palette: () => setIsPaletteOpen(open => !open),
    search: () => requestSearchFocus(),
    'new-note': () => void createNewNote(),
    'toggle-archive': toggleArchiveSelected,
    'trash-note': deleteSelectedNote,
    'lock-note': toggleLock,
    'go-home': goHome,
    'show-archive': () => showView('archive'),
    'show-trash': () => showView('trash'),
    'toggle-sidebar': toggleNotesList,
    'toggle-theme': toggleTheme,
    shortcuts: () => setIsHelpOpen(true),
    'lock-app': () => void logout(),
  };

  // Global shortcuts (CNOTE-24). The matcher leaves keys alone while typing (single keys), during IME
  // composition, inside dialogs, and when the editor or a field already handled them.
  const onShortcutKey = useEffectEvent((event: KeyboardEvent) => {
    if (isLoading) return;
    const target = event.target instanceof Element ? event.target : null;
    const command = matchShortcut(toKeyInput(event, mac), COMMANDS, {
      mac,
      typing: isTypingTarget(target),
      blocked: isBlockedTarget(target),
      state: commandState,
    });
    if (!command) return;
    event.preventDefault();
    commandHandlers[command.id]();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onShortcutKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  if (isLoading) return <NotesSkeleton />;

  // The open note: a locked one shows its decrypted text, or the unlock pane until it has it
  const decrypted = selectedNote?.locked ? plain[selectedNote.id] : undefined;
  const openNote = selectedNote && decrypted ? { ...selectedNote, title: decrypted.title, content: decrypted.content } : selectedNote;
  let lockedState: LockedState = 'needs-passphrase';
  if (!selectedNote?.encrypted) lockedState = 'unreadable';
  else if (failedIvs.has(selectedNote.encrypted.iv)) lockedState = 'failed';
  else if (noteVault.hasKeyFor(selectedNote.encrypted)) lockedState = 'decrypting';

  const sidebarProps = {
    notes: activeNotes,
    archivedNotes,
    trashedNotes,
    selectedId: selectedNoteId,
    now,
    view,
    onShowView: setView,
    onSelect: handleNoteSelect,
    onCreate: () => void createNewNote(),
    onUnarchive: (id: string) => {
      const note = archivedNotes.find(n => n.id === id);
      if (note) unarchiveWithToast(note);
    },
    onRestore: restore,
    onDeleteForever: deleteForever,
    onLock: () => void logout(),
    unlockedTitles,
    search,
    onOpenResult: openSearchResult,
    onHome: goHome,
    homeActive: selectedNote === null,
    onShowShortcuts: () => setIsHelpOpen(true),
  };
  const toggles = {
    sidebarHidden: isSidebarHidden,
    onToggleSidebar: toggleSidebar,
    onOpenDrawer: openDrawer,
  };

  return (
    <div className="flex h-dvh animate-app-in bg-canvas-soft text-ink">
      <a
        href="#note-editor"
        className="sr-only z-50 rounded-md bg-canvas px-4 py-3 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to note
      </a>

      <aside id="notes-sidebar" hidden={isSidebarHidden} className="w-72 shrink-0 flex-col max-md:hidden md:flex lg:w-80">
        <Sidebar {...sidebarProps} />
      </aside>
      <MobileSidebar
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onOpenAutoFocus={onDrawerOpenAutoFocus}
        onCloseAutoFocus={onDrawerCloseAutoFocus}
        {...sidebarProps}
      />

      <main
        id="note-editor"
        tabIndex={-1}
        className={`flex min-w-0 flex-1 flex-col outline-none md:py-3 md:pr-3 ${isSidebarHidden ? 'md:pl-3' : ''}`}
      >
        {migration.legacy.length > 0 && (
          <MigrationBanner
            count={migration.legacy.length}
            phase={migration.phase}
            done={migration.done}
            result={migration.result}
            onExport={() => void migration.exportBackup()}
            onUpdate={updateOlderNotes}
            onDismiss={hideMigrationBanner}
          />
        )}
        {selectedNote?.locked && !decrypted ? (
          <LockedNotePane
            // A fresh form per note, so a typed passphrase never carries over
            key={selectedNote.id}
            note={selectedNote}
            state={lockedState}
            onTrash={deleteSelectedNote}
            onToggleArchive={toggleArchiveSelected}
            // The form is about to be replaced by the editor; keep focus in the note area
            onUnlocked={() => document.getElementById('note-editor')?.focus()}
            {...toggles}
          />
        ) : openNote ? (
          <EditorPane
            note={openNote}
            status={status}
            focusTitle={focusTitleId === openNote.id}
            onTitleFocused={clearFocusTitle}
            onTitleChange={handleTitleChange}
            onContentChange={handleEditorChange}
            onTrash={deleteSelectedNote}
            onToggleArchive={toggleArchiveSelected}
            onToggleLock={toggleLock}
            {...toggles}
          />
        ) : (
          <HomeView
            notes={localNotes}
            decrypted={plain}
            unlockedTitles={unlockedTitles}
            now={now}
            onSelect={handleNoteSelect}
            onCreate={() => void createNewNote()}
            {...toggles}
          />
        )}
      </main>

      <LockDialog mode={lockDialog} sample={lockedSample} onClose={() => setLockDialog(null)} onConfirm={confirmLockDialog} />
      <CommandPalette
        open={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        state={commandState}
        mac={mac}
        search={search}
        onRun={id => commandHandlers[id]()}
        onOpenNote={openSearchResult}
      />
      <ShortcutsHelp open={isHelpOpen} onOpenChange={setIsHelpOpen} mac={mac} />
    </div>
  );
}
