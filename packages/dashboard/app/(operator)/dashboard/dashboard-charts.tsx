'use client'

import { keepPreviousData } from '@tanstack/react-query'
import { useState } from 'react'
import { AlertFrequencyChart } from '@/components/charts/alert-frequency-chart'
import { ZoneMetricsChart } from '@/components/charts/zone-metrics-chart'
import { trpc } from '@/lib/trpc'

export function DashboardChartsPanel({ availableZones }: { availableZones: string[] }) {
  const [selectedZone, setSelectedZone] = useState(availableZones[0] ?? '')
  const timeSeriesQuery = trpc.telemetry.getTimeSeries.useQuery(
    { zone: selectedZone, hours: 6 },
    {
      enabled: selectedZone.length > 0,
      refetchInterval: 30_000,
      placeholderData: keepPreviousData,
    },
  )

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium">zone metrics (last 6h)</h2>
        <select
          className="h-7 rounded-md border border-input bg-background px-2 text-xs"
          onChange={e => setSelectedZone(e.target.value)}
          value={selectedZone}
        >
          {availableZones.map(zone => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </div>
      <div className="relative mt-4">
        {timeSeriesQuery.isFetching && (
          <div className="absolute right-0 top-0 text-xs text-muted-foreground">refreshing...</div>
        )}
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
  const frequencyQuery = trpc.alerts.frequency.useQuery({ hours: 24 }, { refetchInterval: 30_000 })

  if (frequencyQuery.isLoading) return null

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">alert frequency (last 24h)</h2>
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
