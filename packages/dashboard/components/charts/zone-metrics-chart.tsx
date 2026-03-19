'use client'

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'

type TimeSeriesPoint = {
  time: string
  temperature: number | null
  humidity: number | null
  airQuality: number | null
  noiseLevel: number | null
}

const chartConfig = {
  temperature: { label: 'temperature (c)', color: '#ea9a97' },
  humidity: { label: 'humidity (%)', color: 'oklch(0.705 0.213 47.604)' },
  airQuality: { label: 'air quality (ug/m3)', color: '#a692c3' },
  noiseLevel: { label: 'noise (db)', color: 'oklch(0.553 0.195 38.402)' },
} satisfies ChartConfig

function formatTime(isoString: string) {
  const date = new Date(isoString)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function ZoneMetricsChart({ data }: { data: TimeSeriesPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        no analytics data available for this zone yet
      </p>
    )
  }

  return (
    <ChartContainer className="h-72 w-full" config={chartConfig}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={40} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={formatTime} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          connectNulls
          dataKey="temperature"
          dot={false}
          stroke="var(--color-temperature)"
          strokeWidth={1.5}
          type="monotone"
        />
        <Line
          connectNulls
          dataKey="humidity"
          dot={false}
          stroke="var(--color-humidity)"
          strokeWidth={1.5}
          type="monotone"
        />
        <Line
          connectNulls
          dataKey="airQuality"
          dot={false}
          stroke="var(--color-airQuality)"
          strokeWidth={1.5}
          type="monotone"
        />
        <Line
          connectNulls
          dataKey="noiseLevel"
          dot={false}
          stroke="var(--color-noiseLevel)"
          strokeWidth={1.5}
          type="monotone"
        />
      </LineChart>
    </ChartContainer>
  )
}
