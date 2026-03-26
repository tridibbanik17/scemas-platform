import { Link } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { PeriodSelector } from '@/components/period-selector'
import { ZoneMap, type SensorPin } from '@/components/zone-map'
import { CHART_PERIODS, makeChartTimeFormatter } from '@/lib/chart-utils'
import { useTauriQuery } from '@/lib/tauri'
import { useAuthStore } from '@/store/auth'
import sensorCatalog from '../../../../data/hamilton-sensor-catalog.json'

interface SensorReading {
  id: number
  sensorId: string
  metricType: string
  value: number
  zone: string
  time: string
}

interface TimeSeriesPoint {
  time: string
  temperature: number | null
  humidity: number | null
  airQuality: number | null
  noiseLevel: number | null
}

interface AlertFrequencyPoint {
  hour: string
  low: number
  warning: number
  critical: number
}

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

const METRIC_TYPES = ['temperature', 'humidity', 'air_quality', 'noise_level'] as const

const METRIC_LABELS: Record<string, string> = {
  temperature: 'temperature',
  humidity: 'humidity',
  air_quality: 'air quality',
  noise_level: 'noise level',
}

const METRIC_UNITS: Record<string, string> = {
  temperature: '\u00b0C',
  humidity: '%',
  air_quality: 'AQI',
  noise_level: 'dB',
}

const SEVERITY_LABEL: Record<number, { label: string; cls: string }> = {
  1: { label: 'Low', cls: 'bg-green-500/15 text-green-700' },
  2: { label: 'Warning', cls: 'bg-amber-500/15 text-amber-700' },
  3: { label: 'Critical', cls: 'bg-red-500/15 text-red-700' },
}

interface MetricGroup {
  avg: number
  count: number
  latestTime: string
}

export function DashboardPage() {
  const user = useAuthStore(s => s.user)
  const [chartHours, setChartHours] = useState(6)
  const [chartZone, setChartZone] = useState('')
  const [freqHours, setFreqHours] = useState(24)

  const readings = useTauriQuery<SensorReading[]>('telemetry_get_latest', { limit: 200 })

  const availableZones = useMemo(() => {
    const zones = new Set((readings.data ?? []).map(r => r.zone))
    return Array.from(zones).sort()
  }, [readings.data])

  const effectiveZone = chartZone || availableZones[0] || ''

  const timeSeries = useTauriQuery<TimeSeriesPoint[]>(
    'telemetry_time_series',
    { zone: effectiveZone, hours: chartHours },
    { enabled: effectiveZone !== '', placeholderData: prev => prev },
  )

  const alerts = useTauriQuery<CursorPage>('alerts_list', { limit: 50 })

  const alertFreq = useTauriQuery<AlertFrequencyPoint[]>(
    'alerts_frequency',
    { hours: freqHours },
    { placeholderData: prev => prev },
  )

  const grouped = useMemo(() => {
    const map: Record<string, MetricGroup> = {}
    for (const r of readings.data ?? []) {
      const g = map[r.metricType]
      if (!g) {
        map[r.metricType] = { avg: r.value, count: 1, latestTime: r.time }
      } else {
        g.avg = (g.avg * g.count + r.value) / (g.count + 1)
        g.count++
        if (r.time > g.latestTime) g.latestTime = r.time
      }
    }
    return map
  }, [readings.data])

  const activeAlerts = useMemo(
    () => (alerts.data?.items ?? []).filter(a => a.status !== 'resolved').slice(0, 8),
    [alerts.data],
  )

  const alertCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of alerts.data?.items ?? []) {
      if (a.status !== 'resolved') counts[a.zone] = (counts[a.zone] ?? 0) + 1
    }
    return counts
  }, [alerts.data])

  const sensorPins = useMemo<SensorPin[]>(() => {
    const readingsByKey = new Map<string, SensorReading>()
    for (const r of readings.data ?? []) readingsByKey.set(`${r.sensorId}:${r.metricType}`, r)
    return sensorCatalog.map(s => {
      const reading = readingsByKey.get(`${s.sensor_id}:${s.device_type}`)
      return {
        sensorId: s.sensor_id,
        displayName: s.display_name,
        zone: s.zone,
        lat: s.lat,
        lng: s.lng,
        metricType: s.device_type,
        value: reading?.value ?? 0,
      }
    })
  }, [readings.data])

  const fmt = useMemo(() => makeChartTimeFormatter(chartHours), [chartHours])
  const chartData = timeSeries.data ?? []

  const freqFmt = useMemo(() => makeChartTimeFormatter(freqHours), [freqHours])
  const freqData = alertFreq.data ?? []

  const [feedPage, setFeedPage] = useState(0)
  const feedSize = 5
  const allReadings = readings.data ?? []
  const feedSlice = useMemo(() => {
    const start = feedPage * feedSize
    return {
      items: allReadings.slice(start, start + feedSize),
      total: Math.min(allReadings.length, 50),
      start,
    }
  }, [allReadings, feedPage])

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-balance">operator dashboard</h1>
        <span className="text-xs text-muted-foreground">{user?.email}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {METRIC_TYPES.map(m => {
          const g = grouped[m]
          return (
            <div key={m} className="rounded-lg border p-4 space-y-1">
              <p className="text-sm text-muted-foreground">{METRIC_LABELS[m]}</p>
              <p className="text-2xl font-semibold tabular-nums">
                {g ? g.avg.toFixed(2) : '\u2014'}{' '}
                <span className="text-sm font-normal text-muted-foreground">{METRIC_UNITS[m]}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {g ? `${g.count} sensors` : 'no data'}
              </p>
              <p className="text-xs text-muted-foreground">
                {g ? new Date(g.latestTime).toLocaleTimeString() : ''}
              </p>
            </div>
          )
        })}
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">region metrics</h2>
          <div className="flex items-center gap-2">
            <PeriodSelector periods={CHART_PERIODS} value={chartHours} onChange={setChartHours} />
            <select
              value={effectiveZone}
              onChange={e => setChartZone(e.target.value)}
              className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
            >
              {availableZones.map(z => (
                <option key={z} value={z}>
                  {z.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="relative h-72">
          {timeSeries.isFetching && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <span className="text-sm text-muted-foreground">loading...</span>
            </div>
          )}
          {chartData.length === 0 && !timeSeries.isFetching ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground text-pretty">
                no data for {effectiveZone ? effectiveZone.replaceAll('_', ' ') : 'selected zone'},
                {CHART_PERIODS.find(o => o.hours === chartHours)?.label ?? `${chartHours}h`}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="time" tickFormatter={fmt} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={fmt} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="temperature"
                  name="temperature (c)"
                  stroke="#ea9a97"
                  dot={false}
                  strokeWidth={1.5}
                />
                <Line
                  type="monotone"
                  dataKey="humidity"
                  name="humidity (%)"
                  stroke="#e8813a"
                  dot={false}
                  strokeWidth={1.5}
                />
                <Line
                  type="monotone"
                  dataKey="airQuality"
                  name="air quality (ug/m3)"
                  stroke="#a692c3"
                  dot={false}
                  strokeWidth={1.5}
                />
                <Line
                  type="monotone"
                  dataKey="noiseLevel"
                  name="noise (db)"
                  stroke="#a0430a"
                  dot={false}
                  strokeWidth={1.5}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">sensor map by monitoring region</h2>
        <ZoneMap sensors={sensorPins} alertCounts={alertCounts} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-medium">live sensor feed</h2>
            <p className="text-xs text-muted-foreground">
              {allReadings.length} streams across {availableZones.length} regions
            </p>
          </div>
          {readings.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">loading...</p>
          ) : (
            <>
              <div className="divide-y">
                {feedSlice.items.map(r => (
                  <div
                    key={`${r.sensorId}-${r.id}`}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{r.sensorId}</p>
                      <p className="text-xs text-muted-foreground">{r.zone.replaceAll('_', ' ')}</p>
                    </div>
                    <p className="font-mono text-sm tabular-nums text-muted-foreground">
                      {r.metricType.replaceAll('_', ' ')}{' '}
                      <span className="text-foreground">{r.value.toFixed(2)}</span>
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t px-4 py-2">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {feedSlice.start + 1}–{feedSlice.start + feedSlice.items.length} of{' '}
                  {feedSlice.total}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={feedPage === 0}
                    onClick={() => setFeedPage(p => p - 1)}
                    className="h-7 rounded-md border border-input px-2 text-xs font-medium disabled:opacity-30 hover:bg-accent"
                  >
                    previous
                  </button>
                  <button
                    disabled={feedSlice.start + feedSize >= feedSlice.total}
                    onClick={() => setFeedPage(p => p + 1)}
                    className="h-7 rounded-md border border-input px-2 text-xs font-medium disabled:opacity-30 hover:bg-accent"
                  >
                    next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-medium">active alerts</h2>
            <p className="text-xs text-muted-foreground">{activeAlerts.length} unresolved</p>
          </div>
          {alerts.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">loading...</p>
          ) : activeAlerts.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">no active alerts</p>
          ) : (
            <div className="divide-y">
              {activeAlerts.map(a => {
                const sev = SEVERITY_LABEL[a.severity] ?? SEVERITY_LABEL[1]
                return (
                  <Link
                    key={a.id}
                    to="/alerts/$alertId"
                    params={{ alertId: a.id }}
                    className="flex items-center justify-between px-4 py-2 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sev.cls}`}>
                        {sev.label}
                      </span>
                      <span className="text-sm font-medium">{a.zone.replaceAll('_', ' ')}</span>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {a.metricType.replaceAll('_', ' ')} at {a.triggeredValue.toFixed(2)}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">alert frequency</h2>
          <PeriodSelector periods={CHART_PERIODS} value={freqHours} onChange={setFreqHours} />
        </div>
        <div className="relative h-56">
          {alertFreq.isFetching && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <span className="text-sm text-muted-foreground">loading...</span>
            </div>
          )}
          {freqData.length === 0 && !alertFreq.isFetching ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">
                no alerts recorded in this time window
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={freqData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="hour" tickFormatter={freqFmt} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={freqFmt} />
                <Legend />
                <Bar dataKey="low" stackId="a" fill="#f5c77e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="warning" stackId="a" fill="#e8813a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="critical" stackId="a" fill="#a0430a" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
