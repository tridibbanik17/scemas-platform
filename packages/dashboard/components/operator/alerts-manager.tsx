'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { SeverityBadge } from '@/components/ui/severity-badge'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
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
  const [inflightId, setInflightId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('latest')
  const [zoneFilter, setZoneFilter] = useState<string>('all')
  const scrollRef = useRef<HTMLDivElement>(null)

  const alertsQuery = trpc.alerts.list.useInfiniteQuery(
    { limit: 100, zone: zoneFilter !== 'all' ? zoneFilter : undefined },
    { getNextPageParam: lastPage => lastPage.nextCursor },
  )

  const [localAcked, setLocalAcked] = useState<Set<string>>(new Set())
  const [localResolved, setLocalResolved] = useState<Set<string>>(new Set())

  const acknowledgeAlert = trpc.alerts.acknowledge.useMutation({
    onMutate: ({ id }) => setInflightId(id),
    onSuccess: (_data, { id }) => {
      setLocalAcked(prev => new Set(prev).add(id))
      utils.alerts.list.invalidate()
      utils.alerts.count.invalidate()
    },
    onSettled: () => setInflightId(null),
  })
  const resolveAlert = trpc.alerts.resolve.useMutation({
    onMutate: ({ id }) => setInflightId(id),
    onSuccess: (_data, { id }) => {
      setLocalResolved(prev => new Set(prev).add(id))
      utils.alerts.list.invalidate()
      utils.alerts.count.invalidate()
    },
    onSettled: () => setInflightId(null),
  })
  const batchResolve = trpc.alerts.batchResolve.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate()
      utils.alerts.count.invalidate()
    },
  })

  const filtered = useMemo(() => {
    const allAlerts = (alertsQuery.data?.pages.flatMap(p => p.items) ?? []) as Alert[]
    return sortAlerts(allAlerts, sortMode)
  }, [alertsQuery.data, sortMode])

  const acknowledgedIds = useMemo(
    () => filtered.filter(a => a.status === 'acknowledged').map(a => a.id),
    [filtered],
  )

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const lastItemIndex = virtualItems[virtualItems.length - 1]?.index ?? 0

  useEffect(() => {
    if (
      lastItemIndex >= filtered.length - 20 &&
      alertsQuery.hasNextPage &&
      !alertsQuery.isFetchingNextPage
    ) {
      alertsQuery.fetchNextPage()
    }
  }, [lastItemIndex, filtered.length, alertsQuery])

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
        <span className="text-sm font-medium">alert queue</span>
        <div className="flex items-center gap-2">
          {acknowledgedIds.length > 0 && (
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-600/80 dark:bg-emerald-600 dark:hover:bg-emerald-600/80"
              disabled={batchResolve.isPending}
              onClick={() => batchResolve.mutate({ ids: acknowledgedIds.slice(0, 50) })}
              size="sm"
            >
              {batchResolve.isPending ? (
                <Spinner />
              ) : (
                `resolve all (${Math.min(acknowledgedIds.length, 50)})`
              )}
            </Button>
          )}
          <NativeSelect value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}>
            <NativeSelectOption value="all">all zones</NativeSelectOption>
            {availableZones.map(zone => (
              <NativeSelectOption key={zone} value={zone}>
                {formatZoneName(zone)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)}>
            <NativeSelectOption value="latest">latest first</NativeSelectOption>
            <NativeSelectOption value="severity">severity</NativeSelectOption>
            <NativeSelectOption value="oldest">oldest first</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>

      {/* virtualized list */}
      {filtered.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground text-pretty">
          {zoneFilter === 'all' ? 'no alerts' : `no alerts in ${formatZoneName(zoneFilter)}`}
        </p>
      ) : (
        <div className="h-100 overflow-y-auto md:h-150" ref={scrollRef}>
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualItems.map(virtualRow => {
              const alert = filtered[virtualRow.index]
              const isResolved = localResolved.has(alert.id) || alert.status === 'resolved'
              return (
                <div
                  className="absolute left-0 top-0 w-full overflow-hidden"
                  key={alert.id}
                  style={{
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div
                    className="relative size-full transition-[transform,opacity] duration-250 ease-[cubic-bezier(0.23,1,0.32,1)]"
                    style={isResolved ? { transform: 'translateX(100%)', opacity: 0 } : undefined}
                  >
                    <Link
                      className="flex size-full items-center justify-between gap-2 border-b border-border px-4 hover:bg-muted"
                      href={`/alerts/${alert.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm tabular-nums">
                            {alert.triggeredValue}
                          </span>
                          <SeverityBadge severity={alert.severity} />
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground/60">
                          <span>{alert.createdAt.toLocaleString()}</span>
                          <span className="rounded bg-muted px-1 py-px text-xs">
                            {alert.metricType.replaceAll('_', ' ')}
                          </span>
                          <span className="rounded bg-muted px-1 py-px text-xs">
                            {formatZoneName(alert.zone)}
                          </span>
                        </div>
                      </div>
                    </Link>
                    <div
                      className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1.5"
                      onClick={e => e.stopPropagation()}
                    >
                      <AlertActions
                        alert={alert}
                        inflightId={inflightId}
                        ackPending={acknowledgeAlert.isPending}
                        resolvePending={resolveAlert.isPending}
                        localAcked={localAcked.has(alert.id)}
                        localResolved={localResolved.has(alert.id)}
                        onAck={() => acknowledgeAlert.mutate({ id: alert.id })}
                        onResolve={() => resolveAlert.mutate({ id: alert.id })}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2">
        <p className="text-xs tabular-nums text-muted-foreground">
          {filtered.length} loaded{alertsQuery.hasNextPage ? ' of many' : ''}
        </p>
        {alertsQuery.isFetchingNextPage ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner /> loading more
          </span>
        ) : null}
      </div>
    </div>
  )
}

function AlertActions({
  alert,
  inflightId,
  ackPending,
  resolvePending,
  localAcked,
  localResolved,
  onAck,
  onResolve,
}: {
  alert: Alert
  inflightId: string | null
  ackPending: boolean
  resolvePending: boolean
  localAcked: boolean
  localResolved: boolean
  onAck: () => void
  onResolve: () => void
}) {
  const isThisAlert = inflightId === alert.id
  const ackLoading = isThisAlert && ackPending
  const resolveLoading = isThisAlert && resolvePending
  const isAcked = localAcked || alert.status === 'acknowledged' || alert.status === 'resolved'
  const isResolved = localResolved || alert.status === 'resolved'

  return (
    <>
      {isAcked ? (
        <span className="inline-flex h-6 items-center rounded-md border border-amber-600/20 bg-amber-500/10 px-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          ack'd
        </span>
      ) : (
        <Button
          disabled={ackLoading}
          onClick={onAck}
          size="sm"
          variant="outline"
        >
          {ackLoading ? <Spinner /> : 'ack'}
        </Button>
      )}
      <Button
        className={`border-blue-500/30 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400 ${ackLoading ? 'pointer-events-none' : ''}`}
        disabled={resolveLoading || isResolved}
        onClick={onResolve}
        size="sm"
      >
        {resolveLoading ? <Spinner /> : 'resolve'}
      </Button>
    </>
  )
}
