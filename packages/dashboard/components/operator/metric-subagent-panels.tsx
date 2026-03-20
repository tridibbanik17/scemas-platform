import type { MetricType } from '@scemas/types'
import Link from 'next/link'
import type { LatestSensorReading } from '@/server/data-distribution-manager'

type MetricPanelData = {
  metricType: MetricType
  title: string
  unit: string
  averageValue: string
  latestTime: string
  zones: Array<{ zone: string; averageValue: string; latestValue: string; sensorCount: number }>
}

const metricConfig: Record<MetricType, { title: string; unit: string }> = {
  temperature: { title: 'temperature subagent', unit: 'c' },
  humidity: { title: 'humidity subagent', unit: '%' },
  air_quality: { title: 'air quality subagent', unit: 'ug/m3' },
  noise_level: { title: 'noise subagent', unit: 'db' },
}

const metricOrder: MetricType[] = ['temperature', 'humidity', 'air_quality', 'noise_level']

export function buildMetricSubagentPanels(readings: LatestSensorReading[]): MetricPanelData[] {
  return metricOrder.map(metricType => {
    const metricReadings = readings.filter(reading => reading.metricType === metricType)
    const zones = new Map<string, LatestSensorReading[]>()

    for (const reading of metricReadings) {
      const zoneReadings = zones.get(reading.zone) ?? []
      zoneReadings.push(reading)
      zones.set(reading.zone, zoneReadings)
    }

    const latestTimestamp = metricReadings[0]?.time

    return {
      metricType,
      title: metricConfig[metricType].title,
      unit: metricConfig[metricType].unit,
      averageValue: formatAverage(metricReadings),
      latestTime: latestTimestamp ? latestTimestamp.toLocaleString() : '--',
      zones: Array.from(zones.entries())
        .map(([zone, zoneReadings]) => ({
          zone,
          averageValue: formatAverage(zoneReadings),
          latestValue: formatValue(zoneReadings[0]?.value),
          sensorCount: zoneReadings.length,
        }))
        .toSorted((left, right) => left.zone.localeCompare(right.zone)),
    }
  })
}

export function MetricSubagentPanels({
  panels,
  showZoneLinks = true,
}: {
  panels: MetricPanelData[]
  showZoneLinks?: boolean
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {panels.map(panel => (
        <article className="rounded-lg border border-border bg-card p-4" key={panel.metricType}>
          <div className="mb-4 space-y-1">
            <p className="text-xs uppercase text-muted-foreground">{panel.title}</p>
            <p className="font-mono text-3xl tabular-nums">
              {panel.averageValue}{' '}
              <span className="text-sm text-muted-foreground">{panel.unit}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              latest reading window: {panel.latestTime}
            </p>
          </div>

          <div className="space-y-2">
            {panel.zones.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                no telemetry has been recorded for this subagent yet
              </p>
            ) : (
              panel.zones.map(zone => (
                <div
                  className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
                  key={`${panel.metricType}-${zone.zone}`}
                >
                  <div className="space-y-1">
                    {showZoneLinks ? (
                      <Link
                        className="font-medium underline-offset-4 hover:underline"
                        href={`/metrics/${zone.zone}`}
                      >
                        {zone.zone.replaceAll('_', ' ')}
                      </Link>
                    ) : (
                      <p className="font-medium">{zone.zone.replaceAll('_', ' ')}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {zone.sensorCount} active sensors
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono tabular-nums">
                      {zone.averageValue} {panel.unit}
                    </p>
                    <p className="text-xs text-muted-foreground">latest {zone.latestValue}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

function formatAverage(readings: LatestSensorReading[]): string {
  if (readings.length === 0) {
    return '--'
  }

  const total = readings.reduce((sum, reading) => sum + reading.value, 0)
  return formatValue(total / readings.length)
}

function formatValue(value: number | undefined): string {
  if (value === undefined) {
    return '--'
  }

  return `${Math.round(value * 10) / 10}`
}
