import { Skeleton } from '@/components/ui/Skeleton';

// Lines standing in for note content while the editor chunk loads
export function EditorSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-5 py-6 md:px-12 md:py-10">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-5/6" />
      <Skeleton className="h-5 w-2/3" />
    </div>
  );
}

// First load of the notes list: the app's shape with placeholder rows
export function NotesSkeleton() {
  return (
    <div role="status" className="flex h-dvh animate-app-in bg-canvas-soft">
      <span className="sr-only">Loading notes…</span>
      <div className="hidden w-72 shrink-0 flex-col gap-4 p-3 md:flex lg:w-80">
        <Skeleton className="mx-2 mt-2 h-6 w-28 bg-canvas" />
        <Skeleton className="h-11 rounded-xl bg-canvas" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 bg-canvas" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col md:py-3 md:pr-3">
        <div className="flex flex-1 flex-col bg-canvas md:rounded-xl">
          <div className="flex h-16 items-center gap-3 border-b border-canvas-soft px-3 md:px-6">
            <Skeleton className="h-8 w-1/2" />
          </div>
          <div className="h-14 border-b border-canvas-soft" />
          <EditorSkeleton />
        </div>
      </div>
    </div>
  );
}
