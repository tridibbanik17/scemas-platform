'use client'

import { Tick02Icon, TickDouble02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { keepPreviousData } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { SeverityBadge } from '@/components/ui/severity-badge'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { trpc } from '@/lib/trpc'
import { formatZoneName } from '@/lib/zones'

const ROW_HEIGHT = 56

type Alert = {
  id: string
  zone: string
  metricType: string
  severity: number
  status: string
  triggeredValue: number
  createdAt: Date
}

type SortMode = 'latest' | 'severity' | 'oldest'

function sortAlerts(alerts: Alert[], mode: SortMode): Alert[] {
  switch (mode) {
    case 'severity':
      return alerts.toSorted(
        (a, b) => b.severity - a.severity || b.createdAt.getTime() - a.createdAt.getTime(),
      )
    case 'oldest':
      return alerts.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    case 'latest':
    default:
      return alerts.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }
}

export function AlertsManager({ availableZones }: { availableZones: string[] }) {
  const utils = trpc.useUtils()
  const alertsQuery = trpc.alerts.list.useQuery(
    { limit: 200 },
    { placeholderData: keepPreviousData },
  )
  const [inflightId, setInflightId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('latest')
  const [zoneFilter, setZoneFilter] = useState<string>('all')
  const scrollRef = useRef<HTMLDivElement>(null)

  function optimisticallyRemove(id: string) {
    utils.alerts.list.setData({ limit: 200 }, old => {
      if (!old) return old
      return old.filter(a => a.id !== id)
    })
  }

  const acknowledgeAlert = trpc.alerts.acknowledge.useMutation({
    onMutate: ({ id }) => setInflightId(id),
    onSuccess: () => utils.alerts.list.invalidate(),
    onSettled: () => setInflightId(null),
  })
  const resolveAlert = trpc.alerts.resolve.useMutation({
    onMutate: ({ id }) => {
      setInflightId(id)
      optimisticallyRemove(id)
    },
    onSuccess: () => utils.alerts.list.invalidate(),
    onSettled: () => setInflightId(null),
  })

  const filtered = useMemo(() => {
    const all = alertsQuery.data ?? []
    const byZone = zoneFilter === 'all' ? all : all.filter(a => a.zone === zoneFilter)
    return sortAlerts(byZone, sortMode)
  }, [alertsQuery.data, zoneFilter, sortMode])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  if (alertsQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Spinner />
          loading alerts
        </span>
      </div>
    )
  }

  if (alertsQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-card p-4 text-sm text-destructive">
        {alertsQuery.error.message}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">alert queue</span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground/50">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
            onChange={e => setZoneFilter(e.target.value)}
            value={zoneFilter}
          >
            <option value="all">all zones</option>
            {availableZones.map(zone => (
              <option key={zone} value={zone}>
                {formatZoneName(zone)}
              </option>
            ))}
          </select>
          <select
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
            onChange={e => setSortMode(e.target.value as SortMode)}
            value={sortMode}
          >
            <option value="latest">latest first</option>
            <option value="severity">severity</option>
            <option value="oldest">oldest first</option>
          </select>
        </div>
      </div>

      {/* virtualized list */}
      {filtered.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {zoneFilter === 'all' ? 'no alerts' : `no alerts in ${formatZoneName(zoneFilter)}`}
        </p>
      ) : (
        <div className="h-[400px] overflow-y-auto md:h-[600px]" ref={scrollRef}>
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const alert = filtered[virtualRow.index]
              const isResolved = alert.status === 'resolved'
              return (
                <div
                  className="absolute left-0 top-0 w-full"
                  key={alert.id}
                  style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                >
                  <Link
                    className={`flex size-full items-center justify-between gap-2 border-b border-border px-4 transition-colors ${isResolved ? 'bg-emerald-500/5' : 'hover:bg-muted/50'}`}
                    href={`/alerts/${alert.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm tabular-nums">
                          {alert.triggeredValue}
                        </span>
                        <SeverityBadge severity={alert.severity} />
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/60">
                        <span>{alert.createdAt.toLocaleString()}</span>
                        <span className="rounded bg-muted px-1 py-px text-[10px]">
                          {alert.metricType.replaceAll('_', ' ')}
                        </span>
                        <span className="rounded bg-muted px-1 py-px text-[10px]">
                          {formatZoneName(alert.zone)}
                        </span>
                      </div>
                    </div>
                  </Link>
                  <div
                    className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1"
                    onClick={e => e.stopPropagation()}
                  >
                    <AckIcon
                      alert={alert}
                      inflightId={inflightId}
                      isPending={acknowledgeAlert.isPending}
                      onAck={() => acknowledgeAlert.mutate({ id: alert.id })}
                    />
                    <ResolveIcon
                      alert={alert}
                      inflightId={inflightId}
                      isPending={resolveAlert.isPending}
                      onResolve={() => resolveAlert.mutate({ id: alert.id })}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function AckIcon({
  alert,
  inflightId,
  isPending,
  onAck,
}: {
  alert: Alert
  inflightId: string | null
  isPending: boolean
  onAck: () => void
}) {
  const isLoading = inflightId === alert.id && isPending
  const isAcked = alert.status === 'acknowledged' || alert.status === 'resolved'

  if (isAcked) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex size-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>acknowledged</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label="acknowledge alert"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground active:scale-[0.96] disabled:opacity-50"
            disabled={isLoading}
            onClick={onAck}
            type="button"
          >
            {isLoading ? <Spinner /> : <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>acknowledge</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function ResolveIcon({
  alert,
  inflightId,
  isPending,
  onResolve,
}: {
  alert: Alert
  inflightId: string | null
  isPending: boolean
  onResolve: () => void
}) {
  const isLoading = inflightId === alert.id && isPending
  const isResolved = alert.status === 'resolved'

  if (isResolved) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex size-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <HugeiconsIcon icon={TickDouble02Icon} size={14} strokeWidth={2} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>resolved</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label="resolve alert"
            className="flex size-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 transition-colors hover:bg-blue-500/20 active:scale-[0.96] disabled:opacity-50 dark:text-blue-400"
            disabled={isLoading}
            onClick={onResolve}
            type="button"
          >
            {isLoading ? <Spinner /> : <HugeiconsIcon icon={TickDouble02Icon} size={14} strokeWidth={2} />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>resolve</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
