import { MetricSubagentPanels, buildMetricSubagentPanels } from '@/components/operator/metric-subagent-panels'
import { notFound } from 'next/navigation'

import { getManager } from '@/server/cached'
import { ZoneTimeSeriesPanel } from './zone-time-series'

// zone drill-down: all 4 sensor subagent metrics for a specific zone
export default async function ZoneMetricsPage({
  params,
}: {
  params: Promise<{ zone: string }>
}) {
  const { zone } = await params
  const manager = getManager()
  const readings = await manager.getRecentZoneReadings(zone, 120)

  if (readings.length === 0) {
    notFound()
  }

  const panels = buildMetricSubagentPanels(readings)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-balance">{zone.replaceAll('_', ' ')} metrics</h1>
      <p className="text-sm text-muted-foreground text-pretty">
        zone drill-down for the four sensor subagents. this is the operator view, so raw zone-level telemetry remains visible.
      </p>
      <ZoneTimeSeriesPanel zone={zone} />
      <MetricSubagentPanels panels={panels} showZoneLinks={false} />
    </div>
  )
}
