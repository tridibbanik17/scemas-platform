'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'

type AlertFrequencyPoint = { hour: string; low: number; warning: number; critical: number }

const chartConfig = {
  low: { label: 'low', color: 'oklch(0.837 0.128 66.29)' },
  warning: { label: 'warning', color: 'oklch(0.646 0.222 41.116)' },
  critical: { label: 'critical', color: 'oklch(0.47 0.157 37.304)' },
} satisfies ChartConfig

function formatHour(isoString: string) {
  const date = new Date(isoString)
  return `${String(date.getHours()).padStart(2, '0')}:00`
}

export function AlertFrequencyChart({ data }: { data: AlertFrequencyPoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">no alerts recorded in this time window</p>
  }

  return (
    <ChartContainer className="h-56 w-full" config={chartConfig}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="hour" tickFormatter={formatHour} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={formatHour} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="low" fill="var(--color-low)" stackId="stack" />
        <Bar dataKey="warning" fill="var(--color-warning)" stackId="stack" />
        <Bar dataKey="critical" fill="var(--color-critical)" stackId="stack" />
      </BarChart>
    </ChartContainer>
  )
}
