'use client'

import { IngestionFunnelChart } from '@/components/charts/ingestion-funnel-chart'
import { PlatformHealthChart } from '@/components/charts/platform-health-chart'

export function IngestionFunnelWrapper({
  stats,
}: {
  stats: { total_received: number; total_accepted: number; total_rejected: number }
}) {
  return (
    <IngestionFunnelChart
      stats={{
        received: stats.total_received,
        accepted: stats.total_accepted,
        rejected: stats.total_rejected,
      }}
    />
  )
}

export function PlatformHealthWrapper({
  data,
}: {
  data: Array<{ time: string; latencyMs: number; errorRate: number }>
}) {
  const reversed = [...data].toReversed()
  return <PlatformHealthChart data={reversed} />
}
