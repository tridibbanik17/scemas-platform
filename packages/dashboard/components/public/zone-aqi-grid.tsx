'use client'

import { PublicZoneSummarySchema, type PublicZoneSummary } from '@scemas/types'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ListPagination } from '@/components/list-pagination'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { ZoneAqiBarChart } from './zone-aqi-bar-chart'

const ZONES_PER_PAGE = 4

export function ZoneAqiGrid() {
  const regionAqi = useQuery({
    queryKey: ['public-zone-summary'],
    queryFn: fetchZoneSummary,
    refetchInterval: 10_000,
  })
  const regions = regionAqi.data ?? []
  const [page, setPage] = useState(0)

  if (regionAqi.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          loading monitoring region data
        </span>
      </div>
    )
  }

  if (regionAqi.isError) {
    return (
      <div className="rounded-xl bg-card p-6 text-sm text-muted-foreground">
        unable to load public monitoring region air quality data right now
      </div>
    )
  }

  if (!regions.length) {
    return (
      <div className="rounded-xl bg-card p-6 text-sm text-muted-foreground">
        no aggregated telemetry is available yet. run the seed flow and wait for the analytics
        windows to fill.
      </div>
    )
  }

  const totalPages = Math.ceil(regions.length / ZONES_PER_PAGE)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageRegions = regions.slice(safePage * ZONES_PER_PAGE, (safePage + 1) * ZONES_PER_PAGE)
  const emptySlots = ZONES_PER_PAGE - pageRegions.length

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/30 bg-card/60 p-4">
        <p className="text-xs text-muted-foreground/60">monitoring regions</p>
        <p className="mt-2 font-mono text-2xl tabular-nums text-foreground/80">{regions.length}</p>
        <p className="mt-1 text-xs text-muted-foreground/60 text-pretty">
          public rollup across named hamilton monitoring regions
        </p>
      </div>

      <div>
        <div className="flex flex-wrap gap-4">
          {pageRegions.map(region => (
            <article
              className="min-w-56 flex-1 rounded-xl border border-border/50 bg-card py-3"
              key={region.zone}
            >
              <div className="grid grid-cols-[4.5rem_1fr]">
                <Row label="region" value={region.zoneName} />
                <Row label="aqi" value={`${region.aqi}`} color={aqiColor(region.aqi)} />
                <Row label="status" value={region.aqiLabel} />
                <Row label="temp" value={formatNullableMetric(region.temperature, '')} mono />
                <Row label="humidity" value={formatNullableMetric(region.humidity, '')} mono />
                <Row label="noise" value={formatNullableMetric(region.noiseLevel, '')} mono />
                {region.freshnessSeconds !== null ? (
                  <Row label="updated" value={formatFreshness(region.freshnessSeconds)} mono />
                ) : null}
              </div>
            </article>
          ))}
          {emptySlots > 0
            ? Array.from({ length: emptySlots }, (_, i) => (
                <div className="min-h-48 min-w-56 flex-1 rounded-xl" key={`empty-${i}`} />
              ))
            : null}
        </div>
        <ListPagination
          onPageChange={setPage}
          page={safePage}
          pageSize={ZONES_PER_PAGE}
          totalItems={regions.length}
          totalPages={totalPages}
        />
      </div>

      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <ZoneAqiBarChart zones={regions} />
      </div>
    </div>
  )
}

async function fetchZoneSummary(): Promise<PublicZoneSummary[]> {
  const response = await fetch('/api/v1/zones/summary')
  if (!response.ok) {
    throw new Error('public API request failed')
  }

  const payload = await response.json()
  return PublicZoneSummarySchema.array().parse(payload)
}

function formatNullableMetric(value: number | null, label: string): string {
  if (label === '') {
    return value === null ? '--' : `${value}`
  }
  if (value === null) {
    return `${label}: --`
  }
  return `${label}: ${value}`
}

function formatFreshness(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function Row({
  label,
  value,
  mono = false,
  color,
}: {
  label: string
  value: string
  mono?: boolean
  color?: string
}) {
  return (
    <>
      <span className="px-3 py-1 text-[10px] text-muted-foreground/50">{label}</span>
      <span
        className={cn('px-3 py-1 text-xs text-foreground/80', mono && 'font-mono tabular-nums')}
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </>
  )
}

function aqiColor(aqi: number): string {
  if (aqi <= 50) return 'oklch(0.837 0.128 66.29)'
  if (aqi <= 100) return 'oklch(0.705 0.213 47.604)'
  if (aqi <= 150) return 'oklch(0.646 0.222 41.116)'
  if (aqi <= 200) return '#ea9a97'
  if (aqi <= 300) return 'oklch(0.553 0.195 38.402)'
  return 'oklch(0.47 0.157 37.304)'
}
