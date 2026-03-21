'use client'

import { keepPreviousData } from '@tanstack/react-query'
import { useState } from 'react'
import { ZoneMetricsChart } from '@/components/charts/zone-metrics-chart'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

const PERIODS = [
  { label: '3h', hours: 3 },
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
] as const

export function ZoneTimeSeriesPanel({ zone }: { zone: string }) {
  const [hours, setHours] = useState(6)
  const query = trpc.telemetry.getTimeSeries.useQuery(
    { zone, hours },
    { refetchInterval: 30_000, placeholderData: keepPreviousData },
  )

  const activeLabel = PERIODS.find(p => p.hours === hours)?.label ?? `${hours}h`

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">time series</h2>
        <div className="flex items-center gap-2">
          {query.isFetching ? <Spinner /> : null}
          <div className="flex gap-0.5">
            {PERIODS.map(p => (
              <button
                className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                  hours === p.hours
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground/50 hover:text-muted-foreground'
                }`}
                key={p.hours}
                onClick={() => setHours(p.hours)}
                type="button"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 h-72">
        {query.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : query.isError ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-destructive">{query.error.message}</p>
          </div>
        ) : (
          <ZoneMetricsChart data={query.data ?? []} />
        )}
      </div>
    </div>
  )
}
