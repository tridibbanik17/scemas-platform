import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { invoke } from '@tauri-apps/api/core'
import { useState, useMemo, useCallback, useRef } from 'react'
import { PeriodSelector } from '@/components/period-selector'
import { CHART_PERIODS } from '@/lib/chart-utils'
import { useTauriQuery } from '@/lib/tauri'
import { useAuthStore } from '@/store/auth'

interface Alert {
  id: string
  ruleId: string | null
  sensorId: string
  severity: number
  status: string
  triggeredValue: number
  zone: string
  metricType: string
  acknowledgedBy: string | null
  acknowledgedAt: string | null
  resolvedAt: string | null
  createdAt: string
}

interface CursorPage {
  items: Alert[]
  nextCursor: string | null
}

const SEVERITY: Record<number, { label: string; cls: string }> = {
  1: { label: 'low', cls: 'bg-green-500/15 text-green-700' },
  2: { label: 'warning', cls: 'bg-amber-500/15 text-amber-700' },
  3: { label: 'critical', cls: 'bg-red-500/15 text-red-700' },
}

type SortMode = 'latest' | 'severity' | 'oldest'

function sortAlerts(items: Alert[], mode: SortMode): Alert[] {
  const copy = [...items]
  switch (mode) {
    case 'latest':
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    case 'severity':
      return copy.sort((a, b) => b.severity - a.severity || b.createdAt.localeCompare(a.createdAt))
    case 'oldest':
      return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
}

export function AlertsPage() {
  const user = useAuthStore(s => s.user)
  const [sortMode, setSortMode] = useState<SortMode>('latest')
  const [zoneFilter, setZoneFilter] = useState('all')
  const [hours, setHours] = useState(24)
  const [live, setLive] = useState(false)
  const [inflightId, setInflightId] = useState<string | null>(null)

  const readings = useTauriQuery<{ zone: string }[]>('telemetry_get_latest', { limit: 50 })
  const availableZones = useMemo(() => {
    const zones = new Set((readings.data ?? []).map(r => r.zone))
    return Array.from(zones).sort()
  }, [readings.data])

  const alerts = useTauriQuery<CursorPage>(
    'alerts_list',
    {
      limit: 100,
      zone: zoneFilter !== 'all' ? zoneFilter : undefined,
      hours: live ? undefined : hours,
    },
    { refetchInterval: live ? 5000 : false, placeholderData: prev => prev },
  )

  const queryClient = useQueryClient()
  const queryKey = [
    'alerts_list',
    {
      limit: 100,
      zone: zoneFilter !== 'all' ? zoneFilter : undefined,
      hours: live ? undefined : hours,
    },
  ]

  const patchStatus = useCallback(
    (id: string, status: string) => {
      queryClient.setQueryData<CursorPage>(queryKey, old => {
        if (!old) return old
        return { ...old, items: old.items.map(a => (a.id === id ? { ...a, status } : a)) }
      })
    },
    [queryClient, queryKey],
  )

  const removeItem = useCallback(
    (id: string) => {
      queryClient.setQueryData<CursorPage>(queryKey, old => {
        if (!old) return old
        return { ...old, items: old.items.filter(a => a.id !== id) }
      })
    },
    [queryClient, queryKey],
  )

  const removeItems = useCallback(
    (ids: Set<string>) => {
      queryClient.setQueryData<CursorPage>(queryKey, old => {
        if (!old) return old
        return { ...old, items: old.items.filter(a => !ids.has(a.id)) }
      })
    },
    [queryClient, queryKey],
  )

  const ack = useMutation({
    mutationFn: (args: { alertId: string; userId: string }) =>
      invoke('alerts_acknowledge', { args }),
    onMutate: ({ alertId }) => {
      setInflightId(alertId)
      if (live) return
      const prev = queryClient.getQueryData<CursorPage>(queryKey)
      patchStatus(alertId, 'acknowledged')
      return { prev }
    },
    onSuccess: () => {
      if (live) queryClient.invalidateQueries({ queryKey: ['alerts_list'] })
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev)
    },
    onSettled: () => setInflightId(null),
  })

  const resolve = useMutation({
    mutationFn: (args: { alertId: string; userId: string }) => invoke('alerts_resolve', { args }),
    onMutate: ({ alertId }) => {
      setInflightId(alertId)
      if (live) return
      const prev = queryClient.getQueryData<CursorPage>(queryKey)
      removeItem(alertId)
      return { prev }
    },
    onSuccess: () => {
      if (live) queryClient.invalidateQueries({ queryKey: ['alerts_list'] })
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev)
    },
    onSettled: () => setInflightId(null),
  })

  const batchResolve = useMutation({
    mutationFn: (args: { ids: string[]; userId: string }) =>
      invoke('alerts_batch_resolve', { args }),
    onMutate: ({ ids }) => {
      if (live) return
      const prev = queryClient.getQueryData<CursorPage>(queryKey)
      removeItems(new Set(ids))
      return { prev }
    },
    onSuccess: () => {
      if (live) queryClient.invalidateQueries({ queryKey: ['alerts_list'] })
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev)
    },
  })

  const filtered = useMemo(() => {
    const items = (alerts.data?.items ?? []).filter(a => a.status !== 'resolved')
    return sortAlerts(items, sortMode)
  }, [alerts.data, sortMode])

  const acknowledgedIds = useMemo(
    () => filtered.filter(a => a.status === 'acknowledged').map(a => a.id),
    [filtered],
  )

  const handleAck = (alertId: string) => {
    if (!user?.id) return
    ack.mutate({ alertId, userId: user.id })
  }

  const handleResolve = (alertId: string) => {
    if (!user?.id) return
    resolve.mutate({ alertId, userId: user.id })
  }

  const handleBatchResolve = () => {
    if (!user?.id || acknowledgedIds.length === 0) return
    batchResolve.mutate({ ids: acknowledgedIds.slice(0, 50), userId: user.id })
  }

  const isBackgroundRefetch = alerts.dataUpdatedAt > 0 && !alerts.isLoading && alerts.isFetching

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <span className="text-sm font-medium text-balance">alert queue</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={zoneFilter}
              onChange={e => setZoneFilter(e.target.value)}
              className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="all">all zones</option>
              {availableZones.map(z => (
                <option key={z} value={z}>
                  {z.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as SortMode)}
              className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="latest">latest first</option>
              <option value="severity">severity</option>
              <option value="oldest">oldest first</option>
            </select>
            {!live && <PeriodSelector periods={CHART_PERIODS} value={hours} onChange={setHours} />}
            <button
              onClick={() => setLive(v => !v)}
              className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors ${
                live
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                  : 'border-input text-muted-foreground hover:text-foreground'
              }`}
            >
              {live ? '\u23F8' : '\u25B7'} Live
            </button>
            {acknowledgedIds.length > 0 && (
              <button
                onClick={handleBatchResolve}
                disabled={batchResolve.isPending}
                className="h-7 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
              >
                resolve all ({Math.min(acknowledgedIds.length, 50)})
              </button>
            )}
          </div>
        </div>

        <AlertList
          alerts={filtered}
          isLoading={alerts.isLoading}
          isBackgroundRefetch={isBackgroundRefetch}
          live={live}
          zoneFilter={zoneFilter}
          inflightId={inflightId}
          onAck={handleAck}
          onResolve={handleResolve}
        />

        <div className="flex items-center justify-between border-t px-4 py-2">
          <p className="text-xs tabular-nums text-muted-foreground">
            {filtered.length} loaded{alerts.data?.nextCursor ? ' of many' : ''}
          </p>
          {(batchResolve.isError || ack.isError || resolve.isError) && (
            <p className="text-xs text-destructive">
              {String(batchResolve.error ?? ack.error ?? resolve.error)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const ROW_HEIGHT = 56
const VISIBLE_ROWS = 4

function AlertList({
  alerts,
  isLoading,
  isBackgroundRefetch,
  live,
  zoneFilter,
  inflightId,
  onAck,
  onResolve,
}: {
  alerts: Alert[]
  isLoading: boolean
  isBackgroundRefetch: boolean
  live: boolean
  zoneFilter: string
  inflightId: string | null
  onAck: (id: string) => void
  onResolve: (id: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: alerts.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })

  const listHeight = ROW_HEIGHT * VISIBLE_ROWS

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height: listHeight }}>
        <p className="text-sm text-muted-foreground">loading alerts</p>
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: listHeight }}>
        <p className="text-sm text-muted-foreground text-pretty">
          {live
            ? 'events will appear here as they arrive'
            : zoneFilter === 'all'
              ? 'no alerts in this time window'
              : `no alerts in ${zoneFilter.replaceAll('_', ' ')}`}
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      {isBackgroundRefetch && (
        <div className="absolute inset-x-0 top-0 z-10 flex justify-center py-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
            updating
          </span>
        </div>
      )}
      <div ref={scrollRef} className="overflow-y-auto" style={{ height: listHeight }}>
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map(virtualRow => {
            const alert = alerts[virtualRow.index]
            const sev = SEVERITY[alert.severity] ?? SEVERITY[1]
            const isAcked = alert.status === 'acknowledged' || alert.status === 'resolved'
            const isResolved = alert.status === 'resolved'
            const loading = inflightId === alert.id
            return (
              <div
                key={alert.id}
                className="absolute left-0 top-0 flex w-full items-center justify-between border-b px-4 transition-colors hover:bg-muted/50"
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              >
                <Link
                  to="/alerts/$alertId"
                  params={{ alertId: alert.id }}
                  className="min-w-0 flex-1 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm tabular-nums">{alert.triggeredValue}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sev.cls}`}>
                      {sev.label}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground/60">
                    <span>{new Date(alert.createdAt).toLocaleString()}</span>
                    <span className="rounded bg-muted px-1.5 py-px">
                      {alert.metricType.replaceAll('_', ' ')}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-px">
                      {alert.zone.replaceAll('_', ' ')}
                    </span>
                  </div>
                </Link>
                {!isResolved && (
                  <div className="flex shrink-0 items-center gap-1.5 pl-3">
                    {isAcked ? (
                      <span className="inline-flex h-6 items-center rounded-md border border-amber-600/20 bg-amber-500/10 px-2 text-xs font-medium text-amber-700">
                        ack'd
                      </span>
                    ) : (
                      <button
                        onClick={() => onAck(alert.id)}
                        disabled={loading}
                        className="inline-flex h-7 min-w-[40px] items-center justify-center rounded-md border border-input px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        ack
                      </button>
                    )}
                    <button
                      onClick={() => onResolve(alert.id)}
                      disabled={loading}
                      className="inline-flex h-7 min-w-[40px] items-center justify-center rounded-md border border-blue-500/30 bg-blue-500/10 px-2 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
                    >
                      resolve
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
