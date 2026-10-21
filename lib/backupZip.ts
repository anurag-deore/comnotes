// Packs a backup into one zip and reads notes.json back out of one (CNOTE-19). fflate:
// small, dependency-free, synchronous; personal data is small enough for the main thread.
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { ERRORS, MAX_BACKUP_BYTES, buildBackup } from '@/lib/backup';
import { markdownFiles } from '@/lib/backupMarkdown';
import type { Note } from '@/types/note';

export const BACKUP_JSON = 'notes.json';

export type ReadResult = { ok: true; text: string } | { ok: false; error: string };

// notes.json (lossless) + markdown/<slug>.md, markdown/trash/<slug>.md, markdown/assets/*
export function buildBackupZip(notes: Note[], now: Date): Uint8Array {
  const files: Zippable = { [BACKUP_JSON]: strToU8(JSON.stringify(buildBackup(notes, now), null, 2)) };
  for (const [path, data] of Object.entries(markdownFiles(notes))) {
    files[path] = typeof data === 'string' ? strToU8(data) : data;
  }
  return zipSync(files, { mtime: now });
}

// Local file header, or the end record of an empty zip
const isZip = (bytes: Uint8Array) =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);

// Only the root notes.json is inflated, and only if its declared size is within the limit
function unzipBackupJson(bytes: Uint8Array): Uint8Array | string {
  let tooLarge = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (file.name !== BACKUP_JSON) return false;
        tooLarge = file.originalSize > MAX_BACKUP_BYTES;
        return !tooLarge;
      },
    });
  } catch {
    return "This zip couldn't be read.";
  }
  if (tooLarge) return ERRORS.tooLarge;
  return files[BACKUP_JSON] ?? 'This zip has no notes.json at its top level.';
}

// The text of a backup's notes.json, from the exported zip or the JSON file itself
export function readBackupText(bytes: Uint8Array): ReadResult {
  if (bytes.length > MAX_BACKUP_BYTES) return { ok: false, error: ERRORS.tooLarge };
  let json = bytes;
  if (isZip(bytes)) {
    const entry = unzipBackupJson(bytes);
    if (typeof entry === 'string') return { ok: false, error: entry };
    if (entry.length > MAX_BACKUP_BYTES) return { ok: false, error: ERRORS.tooLarge };
    json = entry;
  }
  try {
    // Strict UTF-8; a leading BOM is dropped
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(json) };
  } catch {
    return { ok: false, error: ERRORS.notJson };
  }
}
