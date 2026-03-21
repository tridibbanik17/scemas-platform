'use client'

import { keepPreviousData } from '@tanstack/react-query'
import { useState } from 'react'
import { AlertFrequencyChart } from '@/components/charts/alert-frequency-chart'
import { ZoneMetricsChart } from '@/components/charts/zone-metrics-chart'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'
import { formatZoneName } from '@/lib/zones'

const METRIC_PERIODS = [
  { label: '3h', hours: 3 },
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
] as const

const ALERT_PERIODS = [
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
] as const

export function DashboardChartsPanel({ availableZones }: { availableZones: string[] }) {
  const [selectedZone, setSelectedZone] = useState(availableZones[0] ?? '')
  const [hours, setHours] = useState(6)
  const timeSeriesQuery = trpc.telemetry.getTimeSeries.useQuery(
    { zone: selectedZone, hours },
    {
      enabled: selectedZone.length > 0,
      refetchInterval: 30_000,
      placeholderData: keepPreviousData,
    },
  )

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium">region metrics</h2>
        <div className="flex items-center gap-2">
          {timeSeriesQuery.isFetching ? <Spinner /> : null}
          <PeriodSelector periods={METRIC_PERIODS} value={hours} onChange={setHours} />
          <select
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
            onChange={e => setSelectedZone(e.target.value)}
            value={selectedZone}
          >
            {availableZones.map(zone => (
              <option key={zone} value={zone}>
                {formatZoneName(zone)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4">
        {timeSeriesQuery.isError ? (
          <p className="h-72 text-sm text-destructive">{timeSeriesQuery.error.message}</p>
        ) : (
          <ZoneMetricsChart data={timeSeriesQuery.data ?? []} />
        )}
      </div>
    </div>
  )
}

export function AlertFrequencyPanel() {
  const [hours, setHours] = useState(24)
  const frequencyQuery = trpc.alerts.frequency.useQuery({ hours }, { refetchInterval: 30_000 })

  if (frequencyQuery.isLoading) return null

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">alert frequency</h2>
        <PeriodSelector periods={ALERT_PERIODS} value={hours} onChange={setHours} />
      </div>
      <div className="mt-4">
        {frequencyQuery.isError ? (
          <p className="text-sm text-destructive">{frequencyQuery.error.message}</p>
        ) : (
          <AlertFrequencyChart data={frequencyQuery.data ?? []} />
        )}
      </div>
    </div>
  )
}

function PeriodSelector({
  periods,
  value,
  onChange,
}: {
  periods: ReadonlyArray<{ label: string; hours: number }>
  value: number
  onChange: (hours: number) => void
}) {
  return (
    <div className="flex gap-0.5">
      {periods.map(p => (
        <button
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
            value === p.hours
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground/50 hover:text-muted-foreground'
          }`}
          key={p.hours}
          onClick={() => onChange(p.hours)}
          type="button"
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
