# CNOTE-12 – Sanitize stored note HTML before rendering

**Plane:** https://app.plane.so/nutriai/browse/CNOTE-12/   **Branch:** cnote-12/sanitize-html   **Blocked by:** none

Spec agreed: autonomous loop approved by user 2026-10-16.

## Goal
Note HTML stored in Firestore never reaches the DOM as live markup outside the Quill editor. Previews, search results and the dashboard (CNOTE-13/18/23) get one sanctioned way to show note content, as plain text, and the linter rejects the ways to inject HTML by accident.

## Current state (from the code)
- `app/notes/page.tsx` renders note content only through `QuillEditor`. The sidebar shows the title and date as React text. No `dangerouslySetInnerHTML` exists in the repo.
- `app/components/SimpleEditor.tsx` writes `value` straight into `innerHTML`. Nothing imports it; it is dead code from the initial commit.
- `eslint.config.mjs` uses `eslint-config-next`, which registers `eslint-plugin-react` but leaves `react/no-danger` off.
- How Quill handles hostile HTML (quill 2.0.3, `node_modules/quill`; verified in jsdom):
  - **Loading `value`:** react-quill-new's `setEditorContents` calls `editor.clipboard.convert({ html })` (`react-quill-new/lib/index.js`). That runs `new DOMParser().parseFromString(html, 'text/html')` (`quill/modules/clipboard.js`), which builds an inert document: scripts don't run and `onerror` doesn't fire. The DOM is then turned into a Delta. Only registered formats survive, and event-handler attributes are dropped. `<script>` text becomes plain text.
  - **Links:** `Link.sanitize` (`quill/formats/link.js`) only allows `http`, `https`, `mailto`, `tel` and `sms`; anything else, including `javascript:`, becomes `about:blank`. Video uses the same check. Image allows `http`, `https` and `data`; anything else becomes `//:0`.
  - **Saving (the gap):** react-quill-new's `onChange` returns `editor.getSemanticHTML()`, and that HTML is what gets stored in `content`. Most blots serialize through the DOM, so text is escaped. Two embeds build their HTML by string concatenation without escaping: `Video.html()` returns `` `<a href="${video}">${video}</a>` `` (`quill/formats/video.js`) and `Formula.html()` returns `` `<span>${formula}</span>` `` (`quill/formats/formula.js`). Pasting `<iframe class="ql-video" src="https://x&quot;&gt;&lt;img src=x onerror=alert(1)&gt;">` creates a video whose URL passes the `https` check. Its semantic HTML is then a live `<img onerror>` in stored `content`. This is advisory GHSA-v3m3-f69x-jf25 ("XSS via HTML export"), and no patched quill release exists. Neither embed has a toolbar button. Formula throws without KaTeX, which isn't loaded.

## Decision
- Previews, search results and the dashboard render **plain text**, not sanitized HTML, so no DOMPurify dependency (YAGNI). A rich-HTML path, and DOMPurify with it, only comes if a later ticket really needs formatted previews.
- Add the helper now even though nothing calls it at merge time. It is the sanctioned path for CNOTE-13/18/23, and the lint messages point to it. Without it, the first of those tickets would have to invent one under time pressure.
- Close the Quill export gap at the source by restricting the editor to Quill's default formats minus `video` and `formula`. Every format used today keeps working. Stored notes can't already contain a video embed, because export turns a video into an `<a>` link, so nothing is lost.

## Scope
**In:**
- ESLint guard against HTML sinks.
- `lib/noteHtml.ts` with the plain-text helper and the editor format whitelist.
- `QuillEditor` uses the whitelist.
- Delete the dead `SimpleEditor`.
- Unit tests in jsdom.

**Out:**
- DOMPurify and a rich-HTML render path (see Decision).
- Cleaning up HTML already stored in Firestore. The editor re-parses it inertly on load, and the next save goes through the whitelist.
- Quill `getSemanticHTML` upstream fix (no patched release; tracked via `npm audit`).
- Narrowing images: `data:` and remote `http(s)` images stay allowed. They can't run script, and dropping them would lose pasted content.

## Acceptance criteria
- [x] AC-1 `npm run lint` fails on any `dangerouslySetInnerHTML` (`react/no-danger`), any assignment to `innerHTML` or `outerHTML`, and any call to `insertAdjacentHTML`. The `innerHTML`/`outerHTML`/`insertAdjacentHTML` errors point to `lib/noteHtml.ts`; `react/no-danger` keeps the plugin's fixed message. Reading `innerHTML` is still allowed.
- [x] AC-2 `noteHtmlToText(html)` returns the note's text with tags removed, whitespace collapsed and blocks separated by a space. `<script>`/`<style>` contents are dropped, and `<img onerror>`/`javascript:` payloads come out as inert text or nothing, without running.
- [x] AC-3 `QuillEditor` passes `formats={NOTE_FORMATS}`: Quill's defaults minus `video` and `formula`.
- [x] AC-4 With `NOTE_FORMATS`, the pasted-video payload from "Current state" produces no `<img>`/`<iframe>` in the editor and none in `getSemanticHTML()`. A `javascript:` link loaded as HTML comes out as `about:blank`, and `onerror` attributes are dropped.
- [x] AC-5 The unused `app/components/SimpleEditor.tsx` is deleted.
- [x] AC-6 `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. Adding a `dangerouslySetInnerHTML` makes lint fail (checked by hand, not committed).

## Design
- `eslint.config.mjs`: one extra config object for `**/*.{js,jsx,mjs,ts,tsx,mts,cts}`:
  - `react/no-danger: error`.
  - `no-restricted-syntax` selectors for `AssignmentExpression > MemberExpression[property.name=/^(inner|outer)HTML$/]` and `CallExpression[callee.property.name='insertAdjacentHTML']`.
- `lib/noteHtml.ts`:
  - `NOTE_FORMATS: string[]`.
  - `noteHtmlToText(html: string): string` parses with `DOMParser` (inert), removes `script, style`, appends a space after block elements and `<br>`, then returns `body.textContent` with whitespace collapsed. It runs in the browser only, like the rest of the notes UI.
- `app/components/QuillEditor.tsx`: `formats={NOTE_FORMATS}`.
- Tests:
  - `tests/unit/noteHtml.test.ts` and `tests/unit/quillSanitize.test.ts`, each with `// @vitest-environment jsdom`.
  - New dev dependency: `jsdom`.

## Tests
| Test | Verifies | Type |
|---|---|---|
| plain text from Quill-style blocks, whitespace collapsed | AC-2 | vitest (jsdom) |
| `<script>`/`<style>` dropped; `<img onerror>` doesn't fire; `javascript:` link → its text | AC-2 | vitest (jsdom) |
| empty / non-HTML input | AC-2 | vitest (jsdom) |
| `NOTE_FORMATS` excludes video/formula, keeps the toolbar formats | AC-3 | vitest |
| pasted video payload → no live `<img>`/`<iframe>` in editor or semantic HTML | AC-4 | vitest (jsdom + real Quill) |
| `javascript:` link → `about:blank`; `onerror` dropped | AC-4 | vitest (jsdom + real Quill) |
| lint fails on temporary `dangerouslySetInnerHTML` | AC-1, AC-6 | manual |

## Assumptions / open questions
- Plain text is enough for previews, search and the dashboard. If CNOTE-13 wants formatted previews, it adds DOMPurify and a sanctioned `sanitizeNoteHtml` next to `noteHtmlToText`. It does not add an inline `dangerouslySetInnerHTML`.
- `react/no-danger` also blocks legitimate future uses, such as a trusted static SVG. Turning it off for one file means changing the config on purpose, which is the point.
