export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      {/* Filter row placeholder */}
      <div className="flex items-center gap-2">
        <div className="h-7 w-40 animate-pulse rounded-md border bg-muted/40" />
        <div className="h-7 w-24 animate-pulse rounded-md border bg-muted/40" />
      </div>

      {/* Feed card skeletons */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-row items-start gap-2 rounded-md border bg-card px-3 py-3 shadow-sm sm:px-4 sm:py-2"
        >
          <div className="flex w-8 shrink-0 flex-col items-center gap-1 self-center">
            <div className="size-5 animate-pulse rounded-sm bg-muted" />
            <div className="h-4 w-6 animate-pulse rounded bg-muted" />
            <div className="size-5 animate-pulse rounded-sm bg-muted" />
          </div>
          <div className="flex w-full grow flex-col gap-2 self-center">
            <div className="flex items-start gap-3">
              <div className="size-10 shrink-0 animate-pulse rounded-md bg-muted" />
              <div className="flex w-full grow flex-col gap-1.5">
                <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              </div>
            </div>
            <div className="flex gap-4">
              <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
              <div className="h-3.5 w-12 animate-pulse rounded bg-muted" />
              <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
