// Copy for the older-notes banner (CNOTE-21). Pure.
import type { MigrationResult } from '@/lib/notes';

const count = (n: number) => n.toLocaleString('en-US');
const notes = (n: number) => `${count(n)} ${n === 1 ? 'note' : 'notes'}`;

export function migrationHeading(remaining: number, afterRun: boolean): string {
  const verb = remaining === 1 ? 'needs' : 'need';
  return `${count(remaining)} older ${remaining === 1 ? 'note' : 'notes'} ${afterRun ? 'still ' : ''}${verb} updating`;
}

export function migrationProgress(done: number, total: number): string {
  return `Updating ${count(done)} of ${notes(total)}…`;
}

// "Updated 5 notes" when all went through (a toast); otherwise what's left and why (the banner)
export function migrationSummary({ updated, skipped, failed }: MigrationResult): string {
  const head = `Updated ${notes(updated)}`;
  if (!skipped && !failed) return head;
  const parts = [`${head}.`];
  if (skipped) parts.push(`${count(skipped)} changed while updating${failed ? '.' : '; try again to update them.'}`);
  if (failed) parts.push(`${count(failed)} couldn't be updated; check your connection and try again.`);
  return parts.join(' ');
}
