'use client'

import { trpc } from '@/lib/trpc'

export function BackendStatus() {
  const ping = trpc.health.ping.useQuery(undefined, { refetchInterval: 10_000, retry: false })

  const ok = ping.data?.ok === true
  const loading = ping.isLoading

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={
          loading
            ? 'size-1.5 rounded-full bg-muted-foreground/40'
            : ok
              ? 'size-1.5 rounded-full bg-emerald-500'
              : 'size-1.5 rounded-full bg-red-500'
        }
      />
      {loading ? null : ok ? 'operational' : 'offline'}
    </span>
  )
}
