import { useMemo, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { makeChartTimeFormatter } from '@/lib/chart-utils'
import { useSettings } from '@/lib/settings'
import { useHealth, useTauriQuery } from '@/lib/tauri'

interface PlatformStatusRow {
  id: number
  subsystem: string
  status: string
  uptime: number | null
  latencyMs: number | null
  errorRate: number | null
  time: string
}

export function HealthPage() {
  const health = useHealth()
  const statuses = useTauriQuery<PlatformStatusRow[]>('health_status', { limit: 50 })
  const pageSize = useSettings(s => s.pageSize)
  const [statusPage, setStatusPage] = useState(0)

  const statusRows = statuses.data ?? []
  const statusSlice = useMemo(() => {
    const start = statusPage * pageSize
    return { items: statusRows.slice(start, start + pageSize), total: statusRows.length, start }
  }, [statusRows, statusPage, pageSize])

  const received = health.data?.counters?.totalReceived ?? 0
  const accepted = health.data?.counters?.totalAccepted ?? 0
  const rejected = health.data?.counters?.totalRejected ?? 0
  const receivedPct = received > 0 ? 100 : 0
  const acceptedPct = received > 0 ? (accepted / received) * 100 : 0
  const rejectedPct = received > 0 ? (rejected / received) * 100 : 0

  const fmt = useMemo(() => makeChartTimeFormatter(24), [])
  const chartData = [...statusRows]
    .reverse()
    .map(row => ({ time: row.time, latencyMs: row.latencyMs ?? 0 }))

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-balance">platform health</h1>
        <p className="text-sm text-muted-foreground">
          ingestion pipeline throughput, downstream failure tracking, and platform status over time
        </p>
      </div>

      {health.data?.counters ? (
        <div className="grid gap-4 md:grid-cols-3">
          <CounterCard label="received" value={received} />
          <CounterCard label="accepted" value={accepted} />
          <CounterCard label="rejected" value={rejected} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">loading counters...</p>
      )}

      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="text-sm font-medium">ingestion funnel</h2>
        <div className="space-y-2">
          <FunnelBar label="received" value={received} pct={receivedPct} color="bg-blue-500" />
          <FunnelBar label="accepted" value={accepted} pct={acceptedPct} color="bg-green-500" />
          <FunnelBar label="rejected" value={rejected} pct={rejectedPct} color="bg-red-500" />
        </div>
      </div>

      {health.data?.lifecycle && (
        <div className="rounded-lg border p-4 space-y-2">
          <h2 className="text-sm font-medium">lifecycle</h2>
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
            <div>
              <p className="text-muted-foreground">phase</p>
              <p className="font-medium">{health.data.lifecycle.phase}</p>
            </div>
            <div>
              <p className="text-muted-foreground">drain stage</p>
              <p className="font-medium">{health.data.lifecycle.drainStage}</p>
            </div>
            <div>
              <p className="text-muted-foreground">inflight</p>
              <p className="font-medium tabular-nums">{health.data.lifecycle.inflight}</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="text-sm font-medium">latency over time</h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">no platform status has been recorded yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={224}>
            <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tickFormatter={fmt} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip labelFormatter={fmt} contentStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="latencyMs"
                stroke="#ea9a97"
                fill="#ea9a97"
                fillOpacity={0.15}
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <h2 className="text-sm font-medium">downstream failures</h2>
        <p className="text-sm text-muted-foreground">
          failure tracking will surface here once ingestion_failures are exposed via IPC
        </p>
      </div>

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">platform status history</h2>
        </div>
        {statuses.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">loading...</p>
        ) : statuses.isError ? (
          <p className="p-4 text-sm text-destructive">{String(statuses.error)}</p>
        ) : statusRows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">no status records yet</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">subsystem</th>
                  <th className="px-4 py-2 font-medium">status</th>
                  <th className="px-4 py-2 font-medium">latency</th>
                  <th className="px-4 py-2 font-medium">error rate</th>
                  <th className="px-4 py-2 font-medium">time</th>
                </tr>
              </thead>
              <tbody>
                {statusSlice.items.map(s => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{s.subsystem}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status === 'healthy'
                            ? 'bg-green-500/15 text-green-700'
                            : s.status === 'degraded'
                              ? 'bg-yellow-500/15 text-yellow-700'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {s.latencyMs != null ? `${s.latencyMs.toFixed(1)}ms` : '\u2014'}
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {s.errorRate != null ? `${(s.errorRate * 100).toFixed(1)}%` : '\u2014'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(s.time).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t px-4 py-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                {statusSlice.start + 1}–{statusSlice.start + statusSlice.items.length} of{' '}
                {statusSlice.total}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={statusPage === 0}
                  onClick={() => setStatusPage(p => p - 1)}
                  className="h-7 rounded-md border border-input px-2 text-xs font-medium disabled:opacity-30 hover:bg-accent"
                >
                  previous
                </button>
                <button
                  disabled={statusSlice.start + pageSize >= statusSlice.total}
                  onClick={() => setStatusPage(p => p + 1)}
                  className="h-7 rounded-md border border-input px-2 text-xs font-medium disabled:opacity-30 hover:bg-accent"
                >
                  next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CounterCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  )
}

function FunnelBar({
  label,
  value,
  pct,
  color,
}: {
  label: string
  value: number
  pct: number
  color: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 rounded-full bg-muted h-4 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <span className="w-20 text-right font-mono text-xs tabular-nums">
        {value.toLocaleString()} ({pct.toFixed(1)}%)
      </span>
    </div>
  )
}
