# CNOTE-14 – Pick editor: move from Quill to Tiptap

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-14/   **Branch:** cnote-14/tiptap-editor   **Blocked by:** none (blocks the UI revamp, CNOTE-13)

**Spec agreed:** decisions pre-approved by the user 2026-10-20 (move to Tiptap, keep HTML storage, convert Quill HTML on read).

## Goal
Notes are edited in a Tiptap editor instead of Quill. Every existing note opens with its formatting intact (headings, bold/italic/underline/strike, colors, links, nested bullet and numbered lists, checklists, quotes, code blocks, alignment, pasted images). Markdown shortcuts work while typing. Autosave behaves exactly as before: opening or switching notes never saves anything, typing saves within the autosave delay.

## Decision
- **Tiptap v3** (ProseMirror) over Quill 2:
  - Extensibility: schema-based nodes/marks/extensions; slash commands, mentions, drag handles, collaboration (Yjs) are first-party or well-trodden. Quill 2 needs custom blots and has a stale ecosystem (`react-quill-new` fork, `quill-magic-url`).
  - Theming: Tiptap is headless. Content and toolbar are styled with our own Tailwind classes and tokens, which suits the CNOTE-13 revamp. Quill ships its own `snow` theme CSS that we fight with `!important`.
  - Security: Quill 2.0.3 has an unpatched HTML-export XSS (GHSA-v3m3-f69x-jf25, see CNOTE-12). Tiptap parses with an inert `DOMParser` and keeps only what the schema allows.
  - Markdown shortcuts: built in via StarterKit input rules.
- **Storage stays HTML** in the existing `content` field. `lib/notes.ts`, autosave, trash and `noteHtmlToText` don't change. JSON/markdown storage was rejected for now: it would need a data migration (CNOTE-21) and every reader of `content` would change, for no user-visible gain today. Tiptap can switch to JSON later via `getJSON()` if collaboration needs it.
- **Convert on read, no bulk migration.** `lib/quillToTiptap.ts` rewrites Quill HTML into HTML Tiptap's schema parses correctly, every time a note is loaded into the editor. A note is rewritten as Tiptap HTML only when the user edits it. Converting already-Tiptap HTML is a no-op in effect, so the converter needs no format flag.

## Current state (from the code)
- `app/components/QuillEditor.tsx` wraps `react-quill-new` (Quill 2.0.3) with `quill-magic-url`, the `snow` theme CSS and `NOTE_FORMATS`. It calls `onChange` only for `source === 'user'`, so loading content never saves.
- `app/notes/page.tsx` renders it via `next/dynamic` (`ssr: false`) with `key={selectedNoteId}`, `value={selectedNote.content}`, `onChange={handleEditorChange}` → `updateSelectedNote({ content })` → `change(draft)` on the app-wide autosaver (CNOTE-5/8).
- Stored HTML comes in two shapes (git history: `react-quill` 2.0 / Quill 1.3.7 in the initial commit, `react-quill-new` / Quill 2.0.3 since CNOTE-4):
  - Quill 2 `getSemanticHTML()` (what react-quill-new saves): nested `<ul>`/`<ol>`, checklists as `<ul><li data-list="checked|unchecked">`, code blocks as `<pre data-language="plain">\n…\n</pre>`, `class="ql-align-*"`, `class="ql-indent-N"` on paragraphs, **every space as `&nbsp;`**, colors as `<span style="color|background-color">`, images as `<img src="data:…">` inside `<p>`.
  - Quill editor DOM (`root.innerHTML`, Quill 1 and Quill 2): flat lists with `class="ql-indent-N"`; Quill 2 puts all lists in `<ol><li data-list="bullet|ordered|checked|unchecked">` with a `<span class="ql-ui">`; Quill 1 uses `<ul data-checked="true|false">` for checklists. Code blocks are `<pre class="ql-syntax">` (Quill 1) or `<div class="ql-code-block-container"><div class="ql-code-block">` lines (Quill 2).
- `lib/noteHtml.ts` says "Note content is Quill HTML" and exports `NOTE_FORMATS` (Quill only). `tests/unit/quillSanitize.test.ts` pins Quill's handling of hostile HTML.

## Scope
**In:**
- Tiptap editor component replacing `QuillEditor`, with a minimal Tailwind toolbar (bold, italic, underline, strike, H1–H3, bullet/numbered/check list, quote, code block, link, clear formatting).
- `lib/quillToTiptap.ts` converter, `lib/editorExtensions.ts` (schema config + link/image URL rules), content-sync helper so prop updates never emit a change.
- Extensions: StarterKit (incl. Link with autolink, Underline, input rules), TaskList/TaskItem, Image (inline, base64 allowed), TextAlign, TextStyle + Color + BackgroundColor (to keep Quill colors).
- Remove `react-quill-new`, `quill-magic-url`, `QuillEditor.tsx`, Quill CSS, `NOTE_FORMATS`, `quillSanitize.test.ts`.

**Out (deferred):**
- Slash commands (follow-up, after CNOTE-13 settles the look).
- Real visual design of the editor and toolbar (CNOTE-13). The toolbar uses plain Tailwind classes only. The link button uses `window.prompt` until CNOTE-13 builds a link popover.
- Rewriting stored HTML in bulk / switching storage format (CNOTE-21).
- Color pickers, alignment buttons and image upload in the toolbar. Existing colors, alignment and images are kept and shown, just not offered as new toolbar actions.

**Lossy cases (accepted, text is always kept):**
- Paragraph indentation (`ql-indent-N` on non-list blocks): text kept, indent dropped (Tiptap has no block indent).
- Quill `font`, `size`, `script` (sub/superscript) and `direction`: not in the toolbar, could only arrive by paste; text kept, format dropped.
- Code block language label (`data-language`): always `plain` in Quill, dropped.
- A single non-breaking space outside code becomes a normal space (needed to undo Quill 2's `&nbsp;` export; runs of 2+ keep their extra spaces).

## Acceptance criteria
- [x] AC-1 `convertQuillHtml` turns Quill 2 semantic HTML into Tiptap-parseable HTML: nested bullet/ordered lists keep their nesting and type; `data-list="checked|unchecked"` items become a task list with the right checked state; `<pre data-language>` keeps its code lines without the wrapping newlines; `ql-align-*` becomes `text-align`; runs of `&nbsp;` become wrappable spaces while keeping the extra spaces.
- [x] AC-2 `convertQuillHtml` turns Quill editor-DOM HTML (Quill 2 `<ol><li data-list>` + `ql-indent-N`, `span.ql-ui`, `ql-code-block` divs; Quill 1 `<ul>/<ol>` + `ql-indent-N`, `ul[data-checked]`, `pre.ql-syntax`) into the same nested list / task list / code block structure.
- [x] AC-3 Loading converted Quill HTML into the editor keeps headings, bold, italic, underline, strike, inline code, links, text color, background color, blockquotes and base64 images (checked through the real Tiptap schema, `editor.getHTML()`).
- [x] AC-4 Converting HTML that is already Tiptap output leaves the editor document unchanged.
- [x] AC-5 Links only keep `http:`, `https:` and `mailto:` hrefs (pasted, loaded or autolinked); others lose the link and keep the text. Rendered links carry `rel="noopener noreferrer nofollow"` and `target="_blank"`. Images only keep `http(s):` and `data:image/` sources. Scripts and event-handler attributes never survive loading.
- [x] AC-6 Loading a note, or a new `value` arriving from props (snapshot from another tab), never calls `onChange`. Typing calls `onChange` with the editor HTML. A `value` equal to what the editor last emitted is not re-applied (no cursor jump, no loop).
- [x] AC-7 Switching notes remounts the editor per note (`key={selectedNoteId}`), so content never leaks between notes.
- [x] AC-8 Markdown shortcuts are enabled: `# `/`## `/`### ` headings, `- `/`* ` bullets, `1. ` numbered list, `[ ] ` checklist, `> ` quote, ```` ``` ```` code block, `**bold**`, `*italic*`, `` `code` ``.
- [x] AC-9 `react-quill-new`, `quill-magic-url`, `QuillEditor.tsx`, Quill CSS rules and `NOTE_FORMATS` are gone; nothing in app code mentions Quill except the converter and its callers. `lib/noteHtml.ts` describes the content as editor (Tiptap) HTML. No eslint-disable, ts-ignore or npm overrides added.
- [x] AC-10 `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` pass.

## Design
- `lib/quillToTiptap.ts` – `convertQuillHtml(html: string): string`, pure, browser/jsdom (`DOMParser`, inert). Steps on the parsed body:
  1. Remove `span.ql-ui`; unwrap `div.ql-code-block-container` lines and `pre.ql-syntax` / `pre[data-language]` into `<pre><code>text</code></pre>` (trim one leading/trailing newline).
  2. Lists: flat Quill lists (any `li` with `ql-indent-N`, or `ol > li[data-list]`, or `ul[data-checked]`) are read into `{type, depth, children}` items and rebuilt as nested `<ul>`/`<ol>`/`<ul data-type="taskList">` with `<li data-type="taskItem" data-checked>`. Already nested semantic lists only have their `li[data-list=checked|unchecked]` groups turned into task lists. Adjacent task lists are merged.
  3. `ql-align-(center|right|justify)` → `style="text-align: …"`; remaining `ql-*` classes are removed.
  4. Text nodes outside `<pre>`: a run of n `U+00A0` becomes one space + (n−1) `U+00A0` (Quill 2.0.3 exports every space as `&nbsp;`, which would stop lines wrapping).
  - Returns `body.innerHTML` (a read, allowed by the CNOTE-12 lint rules).
- `lib/editorExtensions.ts` – `noteExtensions()` used by both the component and the tests: StarterKit (`link: { autolink, openOnClick: false, protocols: [], isAllowedUri: isAllowedLinkHref, shouldAutoLink, HTMLAttributes: { rel, target } }`), TaskList, TaskItem (`nested: true`), Image (`inline: true, allowBase64: true`, parse rule restricted by `isAllowedImageSrc`), TextAlign (`paragraph`, `heading`), TextStyle, Color, BackgroundColor. Also `isAllowedLinkHref` (http/https/mailto; a scheme-less host like `example.com` is allowed because autolink/paste validate the typed text before adding `https://`/`mailto:`) and `isAllowedImageSrc`.
- `lib/editorContent.ts` – `createContentSync(editor, initial)` / `applyExternalValue`: keeps the last HTML emitted or applied; a new prop value different from it is converted and applied with `setContent(..., { emitUpdate: false })`.
- `app/components/NoteEditor.tsx` – `useEditor({ extensions: noteExtensions(), content: convertQuillHtml(value), immediatelyRender: false, onUpdate })`; a toolbar driven by `useEditorState`; `EditorContent` with a `note-editor` class. Still loaded via `next/dynamic` with `ssr: false`.
- `app/notes/page.tsx` – swaps `QuillEditor` for `NoteEditor`, same props and `key`.
- `app/globals.css` – drops `.ql-*` rules; adds small `.note-editor` rules (headings, lists, task list, quote, code, links) using the existing `--foreground` token and Tailwind `@apply`.
- `lib/noteHtml.ts` – comment updated, `NOTE_FORMATS` removed. `noteHtmlToText` unchanged.
- No Firestore schema or rules changes.

## Tests
| Test | Verifies | Type |
|---|---|---|
| quillToTiptap: semantic nested bullet/ordered lists, checklists, pre, align, nbsp | AC-1 | vitest + jsdom |
| quillToTiptap: Quill 2 `ol>li[data-list]` + ql-indent, ql-code-block, Quill 1 ul/ol + ql-indent, ul[data-checked], pre.ql-syntax | AC-2 | vitest + jsdom |
| editor: realistic Quill note loads with marks, links, colors, quote, image intact | AC-3 | vitest + jsdom (Tiptap core Editor) |
| editor: getHTML → convert → load is unchanged | AC-4 | vitest + jsdom |
| editor: javascript:/data:text links dropped, rel/target set, bad img src dropped, onerror/script dropped; isAllowedLinkHref/isAllowedImageSrc | AC-5 | vitest + jsdom |
| editor: loading and moving the cursor emit no update (trailingNode off) | AC-6 | vitest + jsdom |
| contentSync: init and external value emit no update; typing emits; echo of last emitted value not re-applied | AC-6 | vitest + jsdom |
| editor: markdown input rules produce heading/list/task/quote/code/bold | AC-8 | vitest + jsdom |
| note switch remount, toolbar buttons, typing → "Saving…/Saved", reopening an old Quill note | AC-6, AC-7 | manual check with real Firebase env |
| no quill imports / deps left | AC-9 | `grep`, `npm ls` |

## Assumptions / open questions
- Quill 2's `getSemanticHTML` in jsdom drops code-block text, so the semantic code-block fixture is hand-written from Quill's source (`<pre data-language="plain">\n…\n</pre>`).
- The editor component itself has no DOM test (no React Testing Library in the repo; not added to stay lean). Its logic lives in the tested `lib/` modules; the wiring is checked by hand.
- Tiptap emits `<p></p>` for an empty doc; a brand-new note's empty content loads as an empty paragraph without saving.
- StarterKit's `trailingNode` is off: it appends a paragraph on the first transaction (even a click), which would save notes nobody edited. Leaving a final code block works with arrow-down / triple Enter.
- AC-7 is met by the existing `key={selectedNoteId}` plus `createContentSync`/`initialContent` living in per-mount state; verified by reading the code, browser check still listed below.

## Manual checks (real Firebase env)
- Open an old Quill note: formatting intact, status stays blank (no save).
- Type, switch notes quickly, switch back: no content crosses notes; "Saving… / Saved" as before.
- Edit the same note in two tabs: the other tab picks up the change without saving it back.
- Toolbar buttons, link prompt (javascript: refused), checklist toggling, pasting an image.
