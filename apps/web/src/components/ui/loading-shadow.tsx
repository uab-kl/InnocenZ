import { useIsFetching, useIsMutating } from '@tanstack/react-query'

import { cn } from '@/lib/utils'

export function GlobalLoadingShadow({ className }: { className?: string }) {
  const isFetching = useIsFetching()
  const isMutating = useIsMutating()
  const active = isFetching + isMutating > 0

  if (!active) return null

  return (
    <div
      className={cn('fixed inset-0 z-50 pointer-events-none', className)}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-background/35 backdrop-blur-[2px]" />
      <div className="absolute top-4 right-4 rounded-lg border bg-card/90 px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <div className="text-xs text-muted-foreground">Loading…</div>
        </div>
      </div>
    </div>
  )
}
