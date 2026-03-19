'use client'

import { useQuery } from '@tanstack/react-query'
import { ZoneAQISchema, type ZoneAQI } from '@scemas/types'

import { Spinner } from '@/components/ui/spinner'
import { ZoneAqiBarChart } from './zone-aqi-bar-chart'

export function ZoneAqiGrid() {
  const zoneAqi = useQuery({
    queryKey: ['public-zone-aqi'],
    queryFn: fetchZoneAqi,
    refetchInterval: 10_000,
  })
  const zones = zoneAqi.data ?? []

  if (zoneAqi.isLoading) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center">
        <span className="inline-flex items-center gap-2 text-sm opacity-60">
          <Spinner />
          loading zone data
        </span>
      </div>
    )
  }

  if (zoneAqi.isError) {
    return (
      <div className="rounded-xl border border-background/20 bg-background/10 p-6 text-sm opacity-80">
        unable to load public air quality data right now
      </div>
    )
  }

  if (!zones.length) {
    return (
        <div className="rounded-xl border border-background/20 bg-background/10 p-6 text-sm opacity-80">
          no aggregated telemetry is available yet. run the seed flow and wait for the analytics windows to fill.
        </div>
      )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {zones.map(zone => (
          <article
            className="rounded-xl border border-background/15 bg-background/10 p-8 text-center"
            key={zone.zone}
          >
            <p className="text-lg opacity-60">{zone.zone.replaceAll('_', ' ')}</p>
            <p className="font-mono text-6xl font-bold tabular-nums">{zone.aqi}</p>
            <p className="mt-2 text-sm uppercase opacity-60">
              {zone.label}
            </p>
            <div className="mt-6 flex items-center justify-center gap-6 text-sm opacity-70">
              <span>{formatMetric(zone.temperature, 'temp')}</span>
              <span>{formatMetric(zone.humidity, 'humidity')}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-background/15 bg-background/10 p-6">
        <ZoneAqiBarChart zones={zones} />
      </div>

      <p className="text-center text-xs opacity-40">
        public REST feed: <code>/api/v1/zones/aqi</code>, refreshes every 10 seconds
      </p>
    </div>
  )
}

async function fetchZoneAqi(): Promise<ZoneAQI[]> {
  const response = await fetch('/api/v1/zones/aqi')
  if (!response.ok) {
    throw new Error('public API request failed')
  }

  const payload = await response.json()
  return ZoneAQISchema.array().parse(payload)
}

function formatMetric(value: number | undefined, label: string): string {
  if (value === undefined) {
    return `${label}: --`
  }

  return `${label}: ${value}`
}
