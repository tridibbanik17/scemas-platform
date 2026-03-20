'use client'

import { Bar, BarChart, Cell, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

type IngestionStats = { received: number; accepted: number; rejected: number }

const chartConfig = {
  received: { label: 'received', color: 'oklch(0.705 0.213 47.604)' },
  accepted: { label: 'accepted', color: 'oklch(0.837 0.128 66.29)' },
  rejected: { label: 'rejected', color: 'oklch(0.47 0.157 37.304)' },
} satisfies ChartConfig

const barColors = ['var(--color-received)', 'var(--color-accepted)', 'var(--color-rejected)']

export function IngestionFunnelChart({ stats }: { stats: IngestionStats }) {
  const data = [
    { name: 'received', value: stats.received },
    { name: 'accepted', value: stats.accepted },
    { name: 'rejected', value: stats.rejected },
  ]

  return (
    <ChartContainer className="h-40 w-full" config={chartConfig}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <XAxis allowDecimals={false} tick={{ fontSize: 11 }} type="number" />
        <YAxis dataKey="name" tick={{ fontSize: 11 }} type="category" width={64} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((_, index) => (
            <Cell fill={barColors[index]} key={barColors[index]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
