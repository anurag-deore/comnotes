// The readable half of a backup (CNOTE-19): each note as a Markdown file with YAML front
// matter. Content goes through the editor's load path (lib/editorContent.ts) and is written
// by Tiptap's own Markdown serializer, so the Markdown holds what the editor shows.
// Browser only (DOMParser).
import type { JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { noteExtensions } from '@/lib/editorExtensions';
import { noteHtmlToDoc } from '@/lib/editorContent';
import { LOCKED_TITLE } from '@/lib/lockedNotes';
import type { Note } from '@/types/note';

const MAX_SLUG = 60;
// Names Windows won't create files with, whatever the extension
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/;

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export interface MarkdownAsset {
  // Relative to the markdown/ folder
  path: string;
  bytes: Uint8Array;
}

// ASCII, lowercase, dash-separated, at most 60 characters; "untitled" when nothing is left
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  if (!slug) return 'untitled';
  return RESERVED.test(slug) ? `${slug}-note` : slug;
}

// One slug per title, in order; repeats get -2, -3, … so no two files share a name
export function uniqueSlugs(titles: string[]): string[] {
  const used = new Set<string>();
  return titles.map((title) => {
    const base = slugify(title);
    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    used.add(slug);
    return slug;
  });
}

function decodeBase64(data: string): Uint8Array | null {
  const compact = data.replace(/\s+/g, '');
  if (compact.length % 4 !== 0 || !BASE64.test(compact)) return null;
  try {
    return Uint8Array.from(atob(compact), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

// The bytes and file extension of a data:image URI; null when it isn't one we can decode
export function dataUriToFile(uri: string): { bytes: Uint8Array; ext: string } | null {
  if (!/^data:/i.test(uri)) return null;
  const comma = uri.indexOf(',');
  if (comma === -1) return null;
  const [mime, ...params] = uri.slice(5, comma).split(';');
  const ext = IMAGE_EXTENSIONS[mime.trim().toLowerCase()];
  if (!ext) return null;
  const data = uri.slice(comma + 1);
  if (params.some((param) => param.trim().toLowerCase() === 'base64')) {
    const bytes = decodeBase64(data);
    return bytes ? { bytes, ext } : null;
  }
  try {
    return { bytes: new TextEncoder().encode(decodeURIComponent(data)), ext };
  } catch {
    return null;
  }
}

let serializer: MarkdownManager | null = null;
const markdownSerializer = () => (serializer ??= new MarkdownManager({ extensions: noteExtensions() }));

// Pulls pasted (data URI) images out into asset files and points the image at them
function extractImages(node: JSONContent, slug: string, prefix: string, assets: MarkdownAsset[]): JSONContent {
  if (node.type === 'image' && typeof node.attrs?.src === 'string') {
    const file = dataUriToFile(node.attrs.src);
    if (!file) return node;
    const path = `assets/${slug}-${assets.length + 1}.${file.ext}`;
    assets.push({ path, bytes: file.bytes });
    return { ...node, attrs: { ...node.attrs, src: `${prefix}${path}` } };
  }
  if (!node.content) return node;
  return { ...node, content: node.content.map((child) => extractImages(child, slug, prefix, assets)) };
}

// A locked note is never decrypted into a backup (CNOTE-7): its Markdown file only says where it is
const LOCKED_BODY =
  'This note is locked. Its title and text are encrypted with your passphrase and are only in notes.json. ' +
  'Import the backup into ComNotes and enter the passphrase to read it.\n';

function frontMatter(note: Note): string {
  const lines = [
    '---',
    // A JSON string is a valid YAML double-quoted scalar
    `title: ${JSON.stringify(note.locked ? LOCKED_TITLE : note.title)}`,
    `created: ${note.createdAt.toISOString()}`,
    `updated: ${note.updatedAt.toISOString()}`,
  ];
  if (note.deletedAt) lines.push(`deleted: ${note.deletedAt.toISOString()}`);
  if (note.archivedAt) lines.push(`archived: ${note.archivedAt.toISOString()}`);
  if (note.locked) lines.push('locked: true');
  lines.push('---');
  return `${lines.join('\n')}\n\n`;
}

// One note as Markdown. Notes in Trash live one folder down, so their assets are under ../
export function noteMarkdown(note: Note, slug: string, inTrash: boolean) {
  const assets: MarkdownAsset[] = [];
  if (note.locked) return { markdown: `${frontMatter(note)}${LOCKED_BODY}`, assets };
  const doc = extractImages(noteHtmlToDoc(note.content), slug, inTrash ? '../' : '', assets);
  const body = markdownSerializer().serialize(doc).trim();
  return { markdown: `${frontMatter(note)}${body ? `${body}\n` : ''}`, assets };
}

// Every note's Markdown file and asset, keyed by path in the zip
export function markdownFiles(notes: Note[]): Record<string, string | Uint8Array> {
  const files: Record<string, string | Uint8Array> = {};
  const slugs = uniqueSlugs(notes.map((note) => (note.locked ? LOCKED_TITLE : note.title)));
  notes.forEach((note, i) => {
    const inTrash = note.deletedAt !== null;
    const { markdown, assets } = noteMarkdown(note, slugs[i], inTrash);
    files[`markdown/${inTrash ? 'trash/' : ''}${slugs[i]}.md`] = markdown;
    assets.forEach((asset) => {
      files[`markdown/${asset.path}`] = asset.bytes;
    });
  });
  return files;
}
