'use client'

import type { ZoneAQI } from '@scemas/types'
import { Bar, BarChart, Cell, XAxis, YAxis } from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

const chartConfig = {
  aqi: { label: 'AQI', color: '#a692c3' },
} satisfies ChartConfig

function aqiColor(aqi: number): string {
  if (aqi <= 50) return 'oklch(0.837 0.128 66.29)'
  if (aqi <= 100) return 'oklch(0.705 0.213 47.604)'
  if (aqi <= 150) return 'oklch(0.646 0.222 41.116)'
  if (aqi <= 200) return '#ea9a97'
  if (aqi <= 300) return 'oklch(0.553 0.195 38.402)'
  return 'oklch(0.47 0.157 37.304)'
}

const zoneNameOverrides: Record<string, string> = {
  mcmaster: 'McMaster',
}

function formatZoneName(zone: string): string {
  if (zoneNameOverrides[zone]) {
    return zoneNameOverrides[zone]
  }
  return zone.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function ZoneAqiBarChart({ zones }: { zones: ZoneAQI[] }) {
  if (zones.length === 0) return null

  const data = zones.map(z => ({
    zone: formatZoneName(z.zone),
    aqi: z.aqi,
  }))

  return (
    <ChartContainer className="h-48 w-full" config={chartConfig}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <XAxis allowDecimals={false} domain={[0, 'auto']} tick={{ fontSize: 11 }} type="number" />
        <YAxis dataKey="zone" tick={{ fontSize: 11 }} type="category" width={100} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="aqi" radius={[0, 4, 4, 0]}>
          {data.map(entry => (
            <Cell fill={aqiColor(entry.aqi)} key={entry.zone} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
