'use client'

import { useState } from 'react'
import { IngestionFunnelChart } from '@/components/charts/ingestion-funnel-chart'
import { PlatformHealthChart } from '@/components/charts/platform-health-chart'
import { ListPagination } from '@/components/list-pagination'
import { usePageSize } from '@/lib/settings'
import { cn } from '@/lib/utils'

export function IngestionFunnelWrapper({
  stats,
}: {
  stats: { totalReceived: number; totalAccepted: number; totalRejected: number }
}) {
  return (
    <IngestionFunnelChart
      stats={{
        received: stats.totalReceived,
        accepted: stats.totalAccepted,
        rejected: stats.totalRejected,
      }}
    />
  )
}

export function PlatformHealthWrapper({
  data,
}: {
  data: Array<{ time: string; latencyMs: number; errorRate: number }>
}) {
  const reversed = [...data].toReversed()
  return <PlatformHealthChart data={reversed} hours={24} />
}

type StatusRow = {
  id: number
  subsystem: string
  status: string
  latencyMs: number
  errorRate: number
  time: string
}

const statusBadge: Record<string, string> = {
  ok: 'bg-green-500/15 text-green-700',
  degraded: 'bg-amber-500/15 text-amber-700',
  down: 'bg-red-500/15 text-red-700',
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function StatusHistoryTable({ rows }: { rows: StatusRow[] }) {
  const pageSize = usePageSize()
  const [page, setPage] = useState(0)

  const totalPages = Math.ceil(rows.length / pageSize)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageRows = rows.slice(safePage * pageSize, (safePage + 1) * pageSize)

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground text-pretty">no status entries recorded yet</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3 text-sm font-medium text-balance">
        platform status history
      </div>
      <div className="grid grid-cols-[1fr_6rem_6rem_6rem_5rem] gap-x-4 border-b border-border px-4 py-2 text-[11px] font-medium text-muted-foreground">
        <span>subsystem</span>
        <span>status</span>
        <span>latency</span>
        <span>error rate</span>
        <span className="text-right">time</span>
      </div>
      <div style={{ minHeight: `${pageSize * 2.5}rem` }}>
        {pageRows.map(row => (
          <div
            key={row.id}
            className="grid grid-cols-[1fr_6rem_6rem_6rem_5rem] items-center gap-x-4 border-b border-border/40 px-4 py-2.5 text-sm"
          >
            <span className="font-medium">{row.subsystem}</span>
            <span>
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                  statusBadge[row.status] ?? 'bg-muted text-muted-foreground',
                )}
              >
                {row.status}
              </span>
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {row.latencyMs.toFixed(1)}ms
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {(row.errorRate * 100).toFixed(1)}%
            </span>
            <span className="text-right font-mono tabular-nums text-muted-foreground">
              {formatTime(row.time)}
            </span>
          </div>
        ))}
      </div>
      <ListPagination
        onPageChange={setPage}
        page={safePage}
        pageSize={pageSize}
        totalItems={rows.length}
        totalPages={totalPages}
      />
    </div>
  )
}
