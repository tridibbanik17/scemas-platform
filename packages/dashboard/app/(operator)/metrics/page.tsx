import { MetricSubagentPanels, buildMetricSubagentPanels } from '@/components/operator/metric-subagent-panels'
import { getManager } from '@/server/cached'

// VisualizeCityMetrics boundary (DataDistributionManager)
export default async function MetricsPage() {
  const manager = getManager()
  const panels = buildMetricSubagentPanels(await manager.getLatestSensorReadings(200))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-balance">city metrics</h1>
      <p className="text-sm text-muted-foreground text-pretty">
        four distinct sensor subagents summarize the latest telemetry by metric family, with zone drill-downs for operators
      </p>
      <MetricSubagentPanels panels={panels} />
    </div>
  )
}
