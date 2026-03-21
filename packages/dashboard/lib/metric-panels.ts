import type { MetricType } from '@scemas/types'
import type { LatestSensorReading } from '@/server/data-distribution-manager'

export type MetricPanelData = {
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
          sensorCount: new Set(zoneReadings.map(r => r.sensorId)).size,
        }))
        .toSorted((left, right) => left.zone.localeCompare(right.zone)),
    }
  })
}

function formatAverage(readings: LatestSensorReading[]): string {
  if (readings.length === 0) return '--'
  const total = readings.reduce((sum, reading) => sum + reading.value, 0)
  return formatValue(total / readings.length)
}

function formatValue(value: number | undefined): string {
  if (value === undefined) return '--'
  return `${Math.round(value * 10) / 10}`
}
