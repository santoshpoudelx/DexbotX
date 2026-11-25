import { Skeleton } from '@/components/ui/misc';

export function GuildListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading servers" role="status" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function EditorSkeleton({ title = 'Welcome message', description = 'Sent when someone joins your server.' }: { title?: string; description?: string }) {
  return (
    <section aria-busy="true" aria-label="Loading configuration" role="status" className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-20 rounded-lg" />
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>
      </header>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="space-y-3 rounded-xl border border-border bg-card p-5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <div className="space-y-4 rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-5 w-40" />
            <div className="flex gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-28 w-full rounded-lg" />
              </div>
            </div>
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    </section>
  );
}

export function EconomySkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading Economy configuration" role="status" className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Economy</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage the economy and set Dex prices for purchasable server roles.</p>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-20 rounded-lg" />
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>
      </header>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_110px_100px_auto] sm:items-center">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="size-9 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OverviewSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading overview" role="status" className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your server modules at a glance.</p>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex min-h-52 flex-col rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="size-10 rounded-lg" />
              <Skeleton className="h-6 w-20 rounded-lg" />
            </div>
            <Skeleton className="mt-4 h-5 w-32" />
            <Skeleton className="mt-2 h-4 w-4/5" />
            <Skeleton className="mt-auto h-11 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </section>
  );
}