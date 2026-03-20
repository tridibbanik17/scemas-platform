'use client'

import { keepPreviousData } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { ListPagination } from '@/components/list-pagination'
import { Button } from '@/components/ui/button'
import { SeverityBadge } from '@/components/ui/severity-badge'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'
import { formatZoneName } from '@/lib/zones'

const ALERTS_PER_METRIC = 5
const ROW_HEIGHT = 'h-14'

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

type ZoneNode = { zone: string; metrics: Map<string, Alert[]>; activeCount: number }

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

function buildTree(alerts: Alert[], sortMode: SortMode, allZones: string[]): ZoneNode[] {
  const zones = new Map<string, Map<string, Alert[]>>()

  for (const zone of allZones) {
    zones.set(zone, new Map())
  }

  for (const alert of alerts) {
    let metrics = zones.get(alert.zone)
    if (!metrics) {
      metrics = new Map()
      zones.set(alert.zone, metrics)
    }
    let list = metrics.get(alert.metricType)
    if (!list) {
      list = []
      metrics.set(alert.metricType, list)
    }
    list.push(alert)
  }

  for (const metrics of zones.values()) {
    for (const [key, list] of metrics.entries()) {
      metrics.set(key, sortAlerts(list, sortMode))
    }
  }

  return Array.from(zones.entries())
    .map(([zone, metrics]) => ({
      zone,
      metrics,
      activeCount: Array.from(metrics.values())
        .flat()
        .filter(a => a.status === 'active').length,
    }))
    .toSorted((a, b) => a.zone.localeCompare(b.zone))
}

export function AlertsManager({ availableZones }: { availableZones: string[] }) {
  const utils = trpc.useUtils()
  const alertsQuery = trpc.alerts.list.useQuery(
    { limit: 50 },
    { placeholderData: keepPreviousData },
  )
  const [inflightId, setInflightId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('latest')
  const [openZone, setOpenZone] = useState<string | null | undefined>(undefined)

  function optimisticallyRemove(id: string) {
    utils.alerts.list.setData({ limit: 50 }, old => {
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

  const alerts = alertsQuery.data ?? []
  const tree = buildTree(alerts, sortMode, availableZones)
  const firstActiveZone = tree.find(n => n.activeCount > 0)?.zone ?? tree[0]?.zone ?? null
  const effectiveOpenZone = openZone === undefined ? firstActiveZone : openZone

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium">operator alert queue</span>
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
      <div className="divide-y divide-border">
        {tree.map(node => (
          <ZoneBranch
            acknowledgeAlert={acknowledgeAlert}
            expanded={effectiveOpenZone === node.zone}
            inflightId={inflightId}
            key={node.zone}
            node={node}
            onToggle={() =>
              setOpenZone(prev => {
                const current = prev === undefined ? firstActiveZone : prev
                return current === node.zone ? null : node.zone
              })
            }
            resolveAlert={resolveAlert}
          />
        ))}
      </div>
    </div>
  )
}

function ZoneBranch({
  node,
  acknowledgeAlert,
  resolveAlert,
  inflightId,
  expanded,
  onToggle,
}: {
  node: ZoneNode
  acknowledgeAlert: ReturnType<typeof trpc.alerts.acknowledge.useMutation>
  resolveAlert: ReturnType<typeof trpc.alerts.resolve.useMutation>
  inflightId: string | null
  expanded: boolean
  onToggle: () => void
}) {
  const metricEntries = Array.from(node.metrics.entries()).toSorted(([a], [b]) =>
    a.localeCompare(b),
  )
  const [openMetric, setOpenMetric] = useState<string | null>(metricEntries[0]?.[0] ?? null)

  return (
    <div>
      <button
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors"
        onClick={onToggle}
        type="button"
      >
        <span
          className={`text-muted-foreground transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        >
          ▸
        </span>
        <span className="font-medium">{formatZoneName(node.zone)}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums ${
            node.activeCount > 0 ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground'
          }`}
        >
          {node.activeCount} active
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          {metricEntries.length === 0 ? (
            <div className="ml-6 border-l border-border/50">
              <div className="ml-5 border-l border-border/30">
                <p className={`flex items-center px-3 text-xs text-muted-foreground ${ROW_HEIGHT}`}>
                  no active alerts
                </p>
                {Array.from({ length: ALERTS_PER_METRIC - 1 }, (_, i) => (
                  <div className={ROW_HEIGHT} key={`empty-${i}`} />
                ))}
              </div>
            </div>
          ) : (
            metricEntries.map(([metricType, metricAlerts]) => (
              <MetricBranch
                acknowledgeAlert={acknowledgeAlert}
                alerts={metricAlerts}
                expanded={openMetric === metricType}
                inflightId={inflightId}
                key={metricType}
                metricType={metricType}
                onToggle={() => setOpenMetric(prev => (prev === metricType ? null : metricType))}
                resolveAlert={resolveAlert}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function MetricBranch({
  metricType,
  alerts,
  acknowledgeAlert,
  resolveAlert,
  inflightId,
  expanded,
  onToggle,
}: {
  metricType: string
  alerts: Alert[]
  acknowledgeAlert: ReturnType<typeof trpc.alerts.acknowledge.useMutation>
  resolveAlert: ReturnType<typeof trpc.alerts.resolve.useMutation>
  inflightId: string | null
  expanded: boolean
  onToggle: () => void
}) {
  const [page, setPage] = useState(0)
  const totalPages = Math.ceil(alerts.length / ALERTS_PER_METRIC)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageAlerts = alerts.slice(safePage * ALERTS_PER_METRIC, (safePage + 1) * ALERTS_PER_METRIC)
  const emptySlots = ALERTS_PER_METRIC - pageAlerts.length

  return (
    <div className="ml-6 border-l border-border/50">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/30 transition-colors"
        onClick={onToggle}
        type="button"
      >
        <span
          className={`text-muted-foreground transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        >
          ▸
        </span>
        <span className="font-medium">{metricType.replaceAll('_', ' ')}</span>
        <span className="text-muted-foreground tabular-nums">({alerts.length})</span>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="ml-5 border-l border-border/30">
            {pageAlerts.map(alert => (
              <div
                className={`flex items-center justify-between gap-2 px-3 ${ROW_HEIGHT}`}
                key={alert.id}
              >
                <div className="min-w-0 space-y-0.5">
                  <span className="flex items-center gap-1.5 text-sm">
                    <Link
                      className="underline-offset-4 hover:underline"
                      href={`/alerts/${alert.id}`}
                    >
                      <span className="font-mono tabular-nums">{alert.triggeredValue}</span>
                    </Link>
                    <SeverityBadge severity={alert.severity} />
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {alert.createdAt.toLocaleString()}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    disabled={inflightId === alert.id || alert.status !== 'active'}
                    onClick={() => acknowledgeAlert.mutate({ id: alert.id })}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {inflightId === alert.id && acknowledgeAlert.isPending ? <Spinner /> : 'ack'}
                  </Button>
                  <Button
                    disabled={inflightId === alert.id || alert.status === 'resolved'}
                    onClick={() => resolveAlert.mutate({ id: alert.id })}
                    size="sm"
                    type="button"
                  >
                    {inflightId === alert.id && resolveAlert.isPending ? <Spinner /> : 'resolve'}
                  </Button>
                </div>
              </div>
            ))}
            {emptySlots > 0
              ? Array.from({ length: emptySlots }, (_, i) => (
                  <div className={ROW_HEIGHT} key={`empty-${i}`} />
                ))
              : null}
          </div>
          <div className="ml-5">
            <ListPagination
              onPageChange={setPage}
              page={safePage}
              pageSize={ALERTS_PER_METRIC}
              totalItems={alerts.length}
              totalPages={totalPages}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
