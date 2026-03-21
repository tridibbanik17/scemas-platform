'use client'

import type { PublicZoneSummary } from '@scemas/types'
import { Bar, BarChart, Cell, XAxis, YAxis, Tooltip } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'

const chartConfig = { aqi: { label: 'AQI', color: '#a692c3' } } satisfies ChartConfig

type ChartEntry = {
  region: string
  aqi: number
  temperature: number | null
  humidity: number | null
  noiseLevel: number | null
  aqiLabel: string
}

function aqiColor(aqi: number): string {
  if (aqi <= 50) return 'oklch(0.837 0.128 66.29)'
  if (aqi <= 100) return 'oklch(0.705 0.213 47.604)'
  if (aqi <= 150) return 'oklch(0.646 0.222 41.116)'
  if (aqi <= 200) return '#ea9a97'
  if (aqi <= 300) return 'oklch(0.553 0.195 38.402)'
  return 'oklch(0.47 0.157 37.304)'
}

function formatMetric(value: number | null): string {
  return value === null ? '--' : `${value}`
}

export function ZoneAqiBarChart({ zones }: { zones: PublicZoneSummary[] }) {
  if (zones.length === 0) return null

  const data: ChartEntry[] = zones.map(zone => ({
    region: zone.zoneName,
    aqi: zone.aqi,
    temperature: zone.temperature,
    humidity: zone.humidity,
    noiseLevel: zone.noiseLevel,
    aqiLabel: zone.aqiLabel,
  }))

  return (
    <ChartContainer className="h-48 w-full" config={chartConfig}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <XAxis
          allowDecimals={false}
          domain={[0, 'auto']}
          tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
          type="number"
        />
        <YAxis
          dataKey="region"
          tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
          type="category"
          width={132}
        />
        <Tooltip content={<AqiTooltip />} cursor={{ fill: 'var(--color-muted)', opacity: 0.3 }} />
        <Bar dataKey="aqi" radius={[0, 3, 3, 0]}>
          {data.map(entry => (
            <Cell fill={aqiColor(entry.aqi)} key={entry.region} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

function AqiTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: ChartEntry }>
}) {
  if (!active || !payload?.length) return null

  const entry = payload[0].payload

  return (
    <div className="rounded-lg border border-border/50 bg-background px-2 py-1 shadow-xl">
      <span
        className="font-mono text-xs font-medium tabular-nums"
        style={{ color: aqiColor(entry.aqi) }}
      >
        {entry.aqi}
      </span>
    </div>
  )
}
