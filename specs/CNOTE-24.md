# CNOTE-24 – Keyboard shortcuts + command palette

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-24/   **Branch:** cnote-24/shortcuts   **Blocked by:** none (builds on CNOTE-3/8 app lock, CNOTE-7 locked notes, CNOTE-15 theme, CNOTE-16 sidebar, CNOTE-17 archive, CNOTE-18 search, CNOTE-23 Home)

**Spec agreed:** pre-approved by the user 2026-10-21 (approach and constraints given with the task).

## Goal
Everything you do often in ComNotes has a keyboard shortcut: open the command palette, search, create a note, lock the app, archive or trash the open note, hide the sidebar, go Home, switch theme, and see the list of shortcuts. ⌘K (Ctrl+K on Windows/Linux) opens a command palette that lists every command with its shortcut, filters them as you type, and also finds notes by title so you can jump to one. `?` shows every shortcut. Shortcuts never get in the way of typing: single keys are ignored in text fields and the editor, IME composition is respected, and the editor's own formatting keys keep working.

## Current state (from the code)
- `app/notes/page.tsx` owns every action: `createNewNote`, `toggleArchiveSelected`, `deleteSelectedNote` (Trash with Undo toast), `toggleLock` (Lock note / Remove lock, CNOTE-7), `toggleSidebar` (desktop, CNOTE-16) / drawer state (phones), `goHome` (CNOTE-23), `setView` (Archive/Trash), and `logout` (app lock).
- `lib/searchFocus.ts` `requestSearchFocus()` focuses the visible search field (CNOTE-18 left the shortcut to this ticket).
- `useNoteSearch` keeps the only MiniSearch index in hook state, lazy-loaded by `prepare()`, synced incrementally, locked notes only while decrypted.
- Theme is a preference store (`lib/themeStore.ts`); the shown theme is `data-theme` on `<html>`.
- Editor keys (Tiptap 3 StarterKit + TextAlign + lists): Mod-B/I/U/E, Mod-Shift-S/B/7/8/9, Mod-Shift-L/E/R/J (align), Mod-Alt-0..6/C, Mod-Z/Y/Shift-Z, Mod-Enter, Mod-Backspace/Delete, Mod-A. **No Mod-K binding** (the Link extension has no keyboard shortcut; links use the toolbar popover), so ⌘K is free everywhere.

## Decisions
- **Registry** (`lib/shortcuts.ts`, pure): one list of commands, the single source of truth for the matcher, the palette and the help dialog. Each command has `id`, `label` (static, used in help), optional `paletteLabel(state)` (e.g. Archive/Unarchive), `group`, `keys` (zero or more bindings like `'Mod+Alt+N'`), optional `keywords`, optional `when(state)`, optional `hint` (help text for `when`), and `inPalette` (false only for "Open command palette"). Handlers live in the page as a `Record<CommandId, () => void>`.
- **Mod** is ⌘ (metaKey) on Apple platforms and Ctrl elsewhere; the other one must not be pressed. Platform from `navigator.userAgentData.platform ?? navigator.platform`.
- **Matching** (`matchShortcut(event, registry, context)`, pure): ignores repeats, `isComposing`/keyCode 229 (IME), events already `defaultPrevented` (the editor or a field handled it), and everything while focus is in a modal dialog or popover other than the notes drawer (`blocked`). Single-key bindings (no Mod/Alt) are ignored while typing (text inputs, textarea, select, contenteditable). Letters compare case-insensitively with Shift exact; punctuation (`/`, `?`, `\`) ignores Shift (layout-dependent). When `event.key` isn't printable ASCII (Mac Option combos give `å`/Dead, non-Latin layouts) letters and digits fall back to `event.code`. On Windows/Linux, AltGr (`getModifierState('AltGraph')`) never matches, so Ctrl+Alt shortcuts don't steal characters on international layouts. A command whose `when` is false doesn't match and the key keeps its default.
- **Bindings** (browser-reserved ⌘N/T/W/Q and editor keys avoided):

  | Command | Mac | Windows/Linux | Notes |
  |---|---|---|---|
  | Open command palette | ⌘K | Ctrl+K | Works in the editor too (no Tiptap Mod-K) |
  | Search notes | `/` or ⇧⌘F | `/` or Ctrl+Shift+F | `/` not while typing |
  | Keyboard shortcuts | `?` or ⌘/ | `?` or Ctrl+/ | `?` not while typing |
  | New note | ⌥⌘N | Ctrl+Alt+N | ⌘N is reserved by browsers |
  | Archive / Unarchive note | ⌥⌘A | Ctrl+Alt+A | Needs an open note |
  | Move note to Trash | ⌥⌘⌫ | Ctrl+Alt+Backspace | Needs an open note; Undo toast as today |
  | Go to Home | ⇧⌘H | Ctrl+Shift+H | |
  | Toggle sidebar | ⌘\ | Ctrl+\ | ⌘B is Bold; phones: opens/closes the drawer |
  | Toggle light/dark theme | ⇧⌘D | Ctrl+Shift+D | Sets the opposite of the shown theme |
  | Lock ComNotes | ⌥⌘L | Ctrl+Alt+L | ⇧⌘L is Align left in the editor |
  | Lock note / Remove lock | — | — | Palette only; needs an open, readable note |
  | Show Archive / Show Trash | — | — | Palette only; reveals the sidebar |

- **Palette** (`components/notes/CommandPalette.tsx`, Radix Dialog): a combobox input (`aria-expanded`, `aria-controls`, `aria-activedescendant`) over a listbox with option groups "Commands" and "Notes". **Unavailable commands are hidden** (`when` false), so every row does something; the help dialog lists them all with their condition. Empty query: every available command in registry order. With a query: commands ranked by a pure fuzzy score (`lib/commandPalette.ts`: exact prefix > word start > contiguous substring > subsequence, keywords count, ties keep registry order), then up to 8 notes from the existing index via a new `useNoteSearch().find(query)` (same MiniSearch instance and `searchSources` rules: trash never, archived included and tagged, locked notes only while decrypted and only by their decrypted title; nothing new is indexed or stored). The notes query uses `useDeferredValue`. ArrowUp/Down wrap, Enter runs the active row (first by default), Esc closes, click runs, hover doesn't move the active row. ⌘K inside the palette closes it. Running a row closes the palette first; if the command moved focus (search, new note, help) the palette doesn't pull it back, otherwise focus returns where it was (`hooks/useReturnFocus.ts`: Radix only returns focus to a `Dialog.Trigger`, and keyboard-opened dialogs have none).
- **Help** (`components/notes/ShortcutsHelp.tsx`, Radix Dialog): every registry command with bindings, grouped, `<kbd>` keys with platform labels (⌥⌘N vs Ctrl+Alt+N), "or" between alternatives, `hint` for conditional ones. Also reachable from a "Keyboard shortcuts" button in the sidebar header (768 px and up).
- **Key labels** (`keyTokens`/`formatKeys`, pure): Mac uses symbols in Apple order ⌃⌥⇧⌘ with no separator (`⌥⌘N`, `⌥⌘⌫`); others `Ctrl+Alt+N`, `Ctrl+Alt+Backspace`.
- **Motion and themes:** both dialogs use `animate-pop-in/out` and `fade-in/out` (reduced motion keeps opacity only, globals.css); tokens only; 44 px rows; the palette is `top-[12vh]` and `w-[min(36rem,calc(100vw-2rem))]`, so it fits phones.
- **No new dependency.** cmdk would give the list/filter UI, but we'd still need our own matcher, registry, help and note results, its fuzzy ranking isn't configurable to the "title prefix first" order we want, and it adds ~6 kB plus its own Radix Dialog copy. The combobox pattern already exists here (CNOTE-18).

## Scope
**In:** registry, matcher, key labels, palette filter, `find` on the search hook, palette + help dialogs, global keydown wiring in the notes page, sidebar help button, theme helper, tests.
**Out:** user-remappable shortcuts; chord sequences (g h); shortcuts on the sign-in / PIN screens (the notes page isn't mounted there); editor formatting shortcuts (unchanged).

## Acceptance criteria
- [x] AC-1 A pure registry in `lib/shortcuts.ts` defines every command (id, label, group, keys, when, keywords); the matcher, palette and help dialog all read it.
- [x] AC-2 `matchShortcut` maps Mod to ⌘ on Mac and Ctrl elsewhere (the other must be up), ignores repeats, IME composition (`isComposing`, keyCode 229), already-handled events and events inside modal dialogs; single-key shortcuts are ignored while typing in inputs/textarea/contenteditable; AltGr never matches on Windows/Linux; Mac Option letters match via `event.code`; `when` false doesn't match.
- [x] AC-3 Shortcuts work in the notes page: palette (Mod+K), search (`/`, Mod+Shift+F), help (`?`, Mod+/), new note, archive/unarchive, Trash with Undo toast, Home, toggle sidebar (drawer on phones), toggle theme, lock app — with the bindings in the table, none clashing with browser-reserved keys or Tiptap's formatting keys.
- [x] AC-4 Key labels are platform-aware: ⌘/⌥/⇧/⌃ symbols in Apple order on Mac, `Ctrl+Alt+…` elsewhere.
- [x] AC-5 Command palette: Radix Dialog with combobox + listbox (`aria-activedescendant`), fuzzy-filtered commands with shortcut hints, unavailable commands hidden, arrows/Enter/Esc, click; Mod+K closes it.
- [x] AC-6 The palette lists matching notes from the existing search index (no second index); locked notes appear only while unlocked, by their decrypted title; trashed notes never; archived tagged. Choosing one opens it.
- [x] AC-7 Shortcuts help dialog lists the registry with platform-aware keys and conditions; opened by `?`, Mod+/, the palette, and a sidebar button.
- [x] AC-8 Both dialogs: tokens only, both themes, phone width, 44 px targets, pop/fade motion that reduces to opacity with reduced motion.
- [x] AC-9 No `eslint-disable`, `ts-ignore`, npm overrides, `innerHTML` or `dangerouslySetInnerHTML`; `firestore.rules` unchanged; no new dependency.
- [x] AC-10 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass; `/` and `/notes` return 200 from `next dev`.

## Design
- `lib/shortcuts.ts` (new, pure): `CommandId`, `CommandState`, `Command`, `COMMANDS`, `parseKeys`, `isMacPlatform`, `keyTokens`, `formatKeys`, `isTypingTarget`, `isBlockedTarget`, `toKeyInput(event, mac)`, `matchShortcut`, `isAvailable`, `commandLabel`.
- `lib/commandPalette.ts` (new, pure): `fuzzyScore`, `paletteCommands(commands, query, state)`.
- `lib/theme.ts`: `oppositeTheme(theme)`.
- `hooks/useNoteSearch.ts`: `find(query, limit)` on the same index; result mapping shared with `results`.
- `components/notes/CommandPalette.tsx`, `components/notes/ShortcutsHelp.tsx`, `components/ui/Kbd.tsx` (`Keys`, `useIsMac`), `hooks/useReturnFocus.ts` (new). `components/notes/NoteSearch.tsx` exports `Highlighted` for the palette's note titles.
- `components/notes/Sidebar.tsx`: optional `onShowShortcuts` header button.
- `app/notes/page.tsx`: command state, handlers, `window` keydown listener (`useEffectEvent`), palette + help dialogs, `openDrawer` / `toggleNotesList` / `showView` helpers (sidebar on desktop, drawer on phones).

## Tests
| Test | Verifies | Type |
|---|---|---|
| registry: unique ids, every binding parses, no duplicate bindings, no reserved/editor keys | AC-1, AC-3 | vitest |
| matcher: Mod on mac vs others, wrong modifier, repeat, isComposing/229, defaultPrevented, blocked, single key while typing vs Mod key while typing, punctuation ignores Shift, Option-letter via code, AltGr, `when` | AC-2 | vitest |
| isTypingTarget / isBlockedTarget on real DOM nodes | AC-2 | vitest (jsdom) |
| keyTokens / formatKeys mac vs others | AC-4 | vitest |
| fuzzyScore order; paletteCommands ordering, keywords, hidden unavailable, dynamic labels, palette command excluded | AC-5 | vitest |
| isAvailable / commandLabel for note-dependent commands | AC-3, AC-5 | vitest |
| oppositeTheme | AC-3 | vitest |
| useNoteSearch.find: same index, locked only while decrypted, trash never, archived included | AC-6 | vitest (jsdom, react-dom) |
| CommandPalette render: combobox/listbox attrs, filter, arrows + Enter run, notes group, Mod+K closes | AC-5, AC-6 | vitest (jsdom, react-dom) |
| ShortcutsHelp render: every bound command listed, mac vs other labels | AC-7 | vitest (jsdom, react-dom) |
| real keyboard in the page, both themes, phone width | AC-3, AC-8 | manual (dev server; real Firebase env needed for data) |

Verification (2026-10-21): 625 unit tests (42 new), lint, typecheck and build pass; no dependency or lockfile change; `next dev` on :3100 serves `/` and `/notes` with 200 and no server errors. The palette's focus hand-off (command moves focus → kept; otherwise → back to where it was) is covered by a jsdom test with real Radix Dialog. A pass with a real keyboard in both themes and at phone width needs a signed-in session with real Firebase config and is still to do.

## Open questions
None. Assumptions: "lock" in the ticket is the app lock (a shortcut); Lock note is in the palette without a shortcut. Palette notes include Archive (tagged) because jumping to a note shouldn't depend on where it lives.
