// Notes saved before CNOTE-14 hold Quill HTML. This rewrites the Quill-specific bits into
// HTML that Tiptap's schema (lib/editorExtensions.ts) parses into the same structure.
// It runs every time a note loads; HTML that is already Tiptap output passes through.
//
// Two shapes exist in Firestore (see specs/CNOTE-14.md):
// - Quill 2 getSemanticHTML (react-quill-new): nested lists, li[data-list=checked|unchecked]
//   checklists, <pre data-language>, ql-align-* / ql-indent-* classes, every space as &nbsp;.
// - Quill editor DOM (react-quill / Quill 1, or Quill 2 root): flat lists with ql-indent-N,
//   Quill 2 <ol><li data-list>, Quill 1 ul[data-checked], pre.ql-syntax, ql-code-block divs.

type ItemKind = 'bullet' | 'ordered' | 'task';

interface FlatItem {
  kind: ItemKind;
  checked: boolean;
  depth: number;
  nodes: Node[];
}

const INDENT = /(?:^|\s)ql-indent-(\d+)(?:\s|$)/;
const ALIGN = /(?:^|\s)ql-align-(center|right|justify)(?:\s|$)/;

const isList = (node: Node | null): node is HTMLElement =>
  node instanceof Element && (node.tagName === 'UL' || node.tagName === 'OL');

function indentOf(el: Element): number {
  const match = INDENT.exec(el.getAttribute('class') ?? '');
  return match ? Number(match[1]) : 0;
}

function codeBlock(doc: Document, text: string): HTMLElement {
  const pre = doc.createElement('pre');
  const code = doc.createElement('code');
  code.textContent = text;
  pre.append(code);
  return pre;
}

function convertCodeBlocks(doc: Document) {
  doc.body.querySelectorAll('div.ql-code-block-container').forEach((container) => {
    const lines = Array.from(container.querySelectorAll('.ql-code-block'), (line) => line.textContent ?? '');
    container.replaceWith(codeBlock(doc, lines.join('\n')));
  });
  doc.body.querySelectorAll('pre.ql-syntax, pre[data-language]').forEach((pre) => {
    let text = pre.textContent ?? '';
    // getSemanticHTML wraps the code in newlines; Quill 1 ends it with one
    if (pre.hasAttribute('data-language')) text = text.replace(/^\n/, '');
    text = text.replace(/\n$/, '');
    pre.replaceWith(codeBlock(doc, text));
  });
}

// A list Quill stored flat, with nesting expressed by ql-indent-N classes
function isFlatList(list: Element): boolean {
  if (list.hasAttribute('data-checked')) return true;
  return Array.from(list.children).some(
    (li) => INDENT.test(li.getAttribute('class') ?? '') || (list.tagName === 'OL' && li.hasAttribute('data-list')),
  );
}

function readFlatItems(list: Element): FlatItem[] {
  const listChecked = list.getAttribute('data-checked');
  return Array.from(list.children).map((li) => {
    const type = li.getAttribute('data-list');
    let kind: ItemKind = list.tagName === 'OL' ? 'ordered' : 'bullet';
    let checked = false;
    if (type === 'bullet' || type === 'ordered') kind = type;
    else if (type === 'checked' || type === 'unchecked') [kind, checked] = ['task', type === 'checked'];
    else if (listChecked !== null) [kind, checked] = ['task', listChecked === 'true'];
    return { kind, checked, depth: indentOf(li), nodes: Array.from(li.childNodes) };
  });
}

function newList(doc: Document, kind: ItemKind): HTMLElement {
  const list = doc.createElement(kind === 'ordered' ? 'ol' : 'ul');
  if (kind === 'task') list.setAttribute('data-type', 'taskList');
  return list;
}

function newItem(doc: Document, item: FlatItem): HTMLElement {
  const li = doc.createElement('li');
  if (item.kind === 'task') {
    li.setAttribute('data-type', 'taskItem');
    li.setAttribute('data-checked', String(item.checked));
  }
  li.append(...item.nodes);
  return li;
}

// Rebuilds flat items into nested lists. A deeper item nests in the previous item;
// a change of list kind at the same depth starts a new list there.
function buildNested(doc: Document, items: FlatItem[]): DocumentFragment {
  const root = doc.createDocumentFragment();
  const stack: { list: HTMLElement; kind: ItemKind }[] = [];
  for (const item of items) {
    const depth = Math.min(item.depth, stack.length);
    stack.length = Math.min(stack.length, depth + 1);
    if (stack.length === depth + 1 && stack[depth].kind !== item.kind) stack.length = depth;
    if (stack.length === depth) {
      const list = newList(doc, item.kind);
      (depth === 0 ? root : stack[depth - 1].list.lastElementChild!).append(list);
      stack.push({ list, kind: item.kind });
    }
    stack[depth].list.append(newItem(doc, item));
  }
  return root;
}

function convertFlatLists(doc: Document) {
  // Quill only puts lists at the top level. Adjacent flat lists (Quill 1 splits by type)
  // are rebuilt together so an indented item of another type nests in the right parent.
  let child = doc.body.firstElementChild;
  while (child) {
    if (!(isList(child) && isFlatList(child))) {
      child = child.nextElementSibling;
      continue;
    }
    const group: Element[] = [];
    let cur: Element | null = child;
    while (isList(cur) && isFlatList(cur)) {
      group.push(cur);
      cur = cur.nextElementSibling;
    }
    const built = buildNested(doc, group.flatMap(readFlatItems));
    group[0].before(built);
    group.forEach((list) => list.remove());
    child = cur;
  }
}

// Semantic HTML nests lists already; only its checklist items need the task-list shape
function convertSemanticChecklists(doc: Document) {
  doc.body.querySelectorAll('li[data-list="checked"], li[data-list="unchecked"]').forEach((li) => {
    li.parentElement?.setAttribute('data-type', 'taskList');
    li.setAttribute('data-type', 'taskItem');
    li.setAttribute('data-checked', String(li.getAttribute('data-list') === 'checked'));
  });
  doc.body.querySelectorAll('li[data-list]').forEach((li) => li.removeAttribute('data-list'));
}

function mergeAdjacentTaskLists(doc: Document) {
  doc.body.querySelectorAll('ul[data-type="taskList"]').forEach((list) => {
    const next = list.nextElementSibling;
    if (next?.tagName === 'UL' && next.getAttribute('data-type') === 'taskList') {
      next.prepend(...Array.from(list.childNodes));
      list.remove();
    }
  });
}

function convertClasses(doc: Document) {
  doc.body.querySelectorAll('[class*="ql-"]').forEach((el) => {
    const align = ALIGN.exec(el.getAttribute('class') ?? '');
    if (align && el instanceof HTMLElement) el.style.textAlign = align[1];
    const rest = Array.from(el.classList).filter((name) => !name.startsWith('ql-'));
    if (rest.length) el.setAttribute('class', rest.join(' '));
    else el.removeAttribute('class');
  });
  doc.body.querySelectorAll('[contenteditable], [spellcheck]').forEach((el) => {
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
  });
}

// Quill 2.0.3 exports every space as &nbsp;, which would stop lines from wrapping.
// Each run keeps one breakable space; the extra spaces stay non-breaking so they survive.
// Quill never puts a normal space next to an &nbsp;, so a run that touches one is already
// converted (or typed in Tiptap) and is left alone: converting twice changes nothing (CNOTE-21).
const NBSP_RUN = /(^|[^ \u00a0])(\u00a0+)(?=[^ ]|$)/g;

function convertNbsp(doc: Document) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('pre')) continue;
    const text = node.nodeValue ?? '';
    if (text.includes('\u00a0')) {
      node.nodeValue = text.replace(NBSP_RUN, (_match, before: string, run: string) => before + ' ' + run.slice(1));
    }
  }
}

// Browser only. DOMParser builds an inert document, so nothing in the note runs here.
export function convertQuillHtml(html: string): string {
  if (!html) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll('span.ql-ui').forEach((el) => el.remove());
  convertCodeBlocks(doc);
  convertFlatLists(doc);
  convertSemanticChecklists(doc);
  mergeAdjacentTaskLists(doc);
  convertClasses(doc);
  convertNbsp(doc);
  return doc.body.innerHTML;
}
