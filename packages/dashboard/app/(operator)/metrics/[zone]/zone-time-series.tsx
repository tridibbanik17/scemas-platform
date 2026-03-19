'use client'

import { ZoneMetricsChart } from '@/components/charts/zone-metrics-chart'
import { trpc } from '@/lib/trpc'

export function ZoneTimeSeriesPanel({ zone }: { zone: string }) {
  const query = trpc.telemetry.getTimeSeries.useQuery(
    { zone, hours: 6 },
    { refetchInterval: 30_000 },
  )

  if (query.isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">loading time series...</p>
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-card p-4">
        <p className="text-sm text-destructive">{query.error.message}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">time series (last 6h)</h2>
      <div className="mt-4">
        <ZoneMetricsChart data={query.data ?? []} />
      </div>
    </div>
  )
}
