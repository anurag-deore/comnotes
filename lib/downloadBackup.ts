// The CNOTE-19 export as one call: every note read once, zipped, and downloaded by the browser.
// Used by the Backup dialog and the older-notes banner (CNOTE-21). Browser only.
import { backupFileName } from '@/lib/backup';
import { fetchAllNotes } from '@/lib/notes';

// Zip and Markdown code (fflate, @tiptap/markdown) loads only when a backup is made or read
export const loadBackupZip = () => import('@/lib/backupZip');

function downloadFile(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Some browsers start the download after click() returns
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadBackup(now = new Date()) {
  const [{ buildBackupZip }, notes] = await Promise.all([loadBackupZip(), fetchAllNotes()]);
  downloadFile(buildBackupZip(notes, now), backupFileName(now), 'application/zip');
}
