'use client'

import type { PublicZoneSummary } from '@scemas/types'
import { Bar, BarChart, Cell, XAxis, YAxis } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'

const chartConfig = { aqi: { label: 'AQI', color: '#a692c3' } } satisfies ChartConfig

function aqiColor(aqi: number): string {
  if (aqi <= 50) return 'oklch(0.837 0.128 66.29)'
  if (aqi <= 100) return 'oklch(0.705 0.213 47.604)'
  if (aqi <= 150) return 'oklch(0.646 0.222 41.116)'
  if (aqi <= 200) return '#ea9a97'
  if (aqi <= 300) return 'oklch(0.553 0.195 38.402)'
  return 'oklch(0.47 0.157 37.304)'
}

export function ZoneAqiBarChart({ zones }: { zones: PublicZoneSummary[] }) {
  if (zones.length === 0) return null

  const data = zones.map(zone => ({ region: zone.zoneName, aqi: zone.aqi }))

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
        <Bar dataKey="aqi" radius={[0, 3, 3, 0]}>
          {data.map(entry => (
            <Cell fill={aqiColor(entry.aqi)} key={entry.region} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
