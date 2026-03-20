'use client'

import { ZoneAQISchema, type ZoneAQI } from '@scemas/types'
import { useQuery } from '@tanstack/react-query'
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
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          loading zone data
        </span>
      </div>
    )
  }

  if (zoneAqi.isError) {
    return (
      <div className="rounded-xl bg-card p-6 text-sm text-muted-foreground">
        unable to load public air quality data right now
      </div>
    )
  }

  if (!zones.length) {
    return (
      <div className="rounded-xl bg-card p-6 text-sm text-muted-foreground">
        no aggregated telemetry is available yet. run the seed flow and wait for the analytics
        windows to fill.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {zones.map(zone => (
          <article
            className="flex min-h-[180px] flex-col justify-between rounded-xl border border-border/50 bg-card p-6"
            key={zone.zone}
          >
            <p className="text-sm text-muted-foreground text-pretty">{formatZoneName(zone.zone)}</p>
            <div className="py-3 text-center">
              <p
                className="font-mono text-6xl font-bold tabular-nums"
                style={{ color: aqiColor(zone.aqi) }}
              >
                {zone.aqi}
              </p>
              <p className="mt-1 text-xs uppercase text-muted-foreground">{zone.label}</p>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="font-mono tabular-nums">
                {formatMetric(zone.temperature, 'temp')}
              </span>
              <span className="font-mono tabular-nums">
                {formatMetric(zone.humidity, 'humidity')}
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-6">
        <ZoneAqiBarChart zones={zones} />
      </div>

      <p className="text-center text-xs text-muted-foreground/40">
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

const zoneNameOverrides: Record<string, string> = { mcmaster: 'McMaster' }

function formatZoneName(zone: string): string {
  if (zoneNameOverrides[zone]) {
    return zoneNameOverrides[zone]
  }
  return zone.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function aqiColor(aqi: number): string {
  if (aqi <= 50) return 'oklch(0.837 0.128 66.29)'
  if (aqi <= 100) return 'oklch(0.705 0.213 47.604)'
  if (aqi <= 150) return 'oklch(0.646 0.222 41.116)'
  if (aqi <= 200) return '#ea9a97'
  if (aqi <= 300) return 'oklch(0.553 0.195 38.402)'
  return 'oklch(0.47 0.157 37.304)'
}
