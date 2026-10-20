import { noteHtmlToText } from '@/lib/noteHtml';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The title shown in lists and toasts; a blank title still needs something to click
export function displayTitle(title: string): string {
  return title.trim() || 'Untitled';
}

// One line of plain text for a list row. Content is never rendered as HTML (CNOTE-12).
export function notePreview(html: string, maxLength = 120): string {
  const text = noteHtmlToText(html);
  if (!text) return 'No content';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

// "Just now", "5 min ago", "3 h ago", "Yesterday", "Fri", "Oct 3", "Dec 31, 2025" (local time)
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - date.getTime();
  // A pending server timestamp or clock skew can put the date slightly in the future
  if (elapsed < MINUTE) return 'Just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;

  // Round, so a daylight-saving change doesn't shift the calendar day count
  const days = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / DAY);
  if (days === 0) return `${Math.floor(elapsed / HOUR)} h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Whole days until a trashed note is purged (see purgeExpiredTrash), never negative
export function daysLeftInTrash(deletedAt: Date, now: Date, trashDays: number): number {
  const left = trashDays * DAY - (now.getTime() - deletedAt.getTime());
  return Math.max(0, Math.ceil(left / DAY));
}
