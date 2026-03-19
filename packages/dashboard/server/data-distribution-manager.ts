import type { Database } from '@scemas/db'
import type { MetricType, ZoneAQI } from '@scemas/types'

const pm25Breakpoints = [
  { concentrationLow: 0.0, concentrationHigh: 12.0, aqiLow: 0, aqiHigh: 50 },
  { concentrationLow: 12.1, concentrationHigh: 35.4, aqiLow: 51, aqiHigh: 100 },
  { concentrationLow: 35.5, concentrationHigh: 55.4, aqiLow: 101, aqiHigh: 150 },
  { concentrationLow: 55.5, concentrationHigh: 150.4, aqiLow: 151, aqiHigh: 200 },
  { concentrationLow: 150.5, concentrationHigh: 250.4, aqiLow: 201, aqiHigh: 300 },
  { concentrationLow: 250.5, concentrationHigh: 500.4, aqiLow: 301, aqiHigh: 500 },
]

export type LatestSensorReading = {
  sensorId: string
  metricType: MetricType
  value: number
  zone: string
  time: Date
}

type AnalyticsAggregateRow = {
  zone: string
  metricType: MetricType
  aggregatedValue: number
  aggregationType: string
  time: Date
}

export class DataDistributionManager {
  constructor(private readonly db: Database) {}

  async getLatestSensorReadings(limit = 100): Promise<LatestSensorReading[]> {
    const safeLimit = Math.max(1, Math.min(limit, 500))

    const rows = await this.db.$client`
      select sensor_id as "sensorId", metric_type as "metricType", value, zone, time
      from (
        select distinct on (sensor_id)
          sensor_id, metric_type, value, zone, time
        from sensor_readings
        order by sensor_id, time desc
      ) latest_readings
      order by time desc
      limit ${safeLimit}
    `
    return rows.map(coerceReadingRow)
  }

  async getRecentZoneReadings(zone: string, limit = 120): Promise<LatestSensorReading[]> {
    const safeLimit = Math.max(1, Math.min(limit, 500))

    const rows = await this.db.$client`
      select sensor_id as "sensorId", metric_type as "metricType", value, zone, time
      from sensor_readings
      where zone = ${zone}
      order by time desc
      limit ${safeLimit}
    `
    return rows.map(coerceReadingRow)
  }

  async getPublicZoneAqi(): Promise<ZoneAQI[]> {
    const deviceRows = await this.db.$client<{ zone: string }[]>`
      select distinct zone
      from devices
      order by zone asc
    `
    const rows = await this.db.$client<AnalyticsAggregateRow[]>`
      select distinct on (zone, metric_type)
        zone,
        metric_type as "metricType",
        aggregated_value as "aggregatedValue",
        aggregation_type as "aggregationType",
        time
      from analytics
      where aggregation_type = '5m_avg'
      order by zone, metric_type, time desc
    `

    const zones = new Map<string, ZoneAQI>(
      deviceRows.map(row => [
        row.zone,
        {
          zone: row.zone,
          aqi: 0,
          label: 'awaiting telemetry',
        } satisfies ZoneAQI,
      ]),
    )

    for (const row of rows) {
      if (!zones.has(row.zone)) {
        zones.set(row.zone, {
          zone: row.zone,
          aqi: 0,
          label: 'good',
        })
      }

      const zone = zones.get(row.zone)
      if (!zone) {
        continue
      }

      if (row.metricType === 'air_quality') {
        zone.aqi = pm25ToAqi(row.aggregatedValue)
        zone.label = aqiLabel(zone.aqi)
      }

      if (row.metricType === 'temperature') {
        zone.temperature = roundToSingleDecimal(row.aggregatedValue)
      }

      if (row.metricType === 'humidity') {
        zone.humidity = roundToSingleDecimal(row.aggregatedValue)
      }
    }

    return Array.from(zones.values()).sort((left, right) =>
      left.zone.localeCompare(right.zone),
    )
  }
}

export function createDataDistributionManager(db: Database): DataDistributionManager {
  return new DataDistributionManager(db)
}

function coerceReadingRow(row: Record<string, unknown>): LatestSensorReading {
  return {
    sensorId: String(row.sensorId),
    metricType: String(row.metricType) as MetricType,
    value: Number(row.value),
    zone: String(row.zone),
    time: row.time instanceof Date ? row.time : new Date(String(row.time)),
  }
}

function pm25ToAqi(concentration: number): number {
  const truncatedConcentration = Math.floor(concentration * 10) / 10
  const breakpoint =
    pm25Breakpoints.find(candidate =>
      truncatedConcentration >= candidate.concentrationLow &&
      truncatedConcentration <= candidate.concentrationHigh,
    ) ?? pm25Breakpoints.at(-1)

  if (!breakpoint) {
    return 0
  }

  const aqi =
    ((breakpoint.aqiHigh - breakpoint.aqiLow) /
      (breakpoint.concentrationHigh - breakpoint.concentrationLow)) *
      (truncatedConcentration - breakpoint.concentrationLow) +
    breakpoint.aqiLow

  return Math.round(Math.max(0, Math.min(aqi, 500)))
}

function aqiLabel(aqi: number): string {
  if (aqi <= 50) return 'good'
  if (aqi <= 100) return 'moderate'
  if (aqi <= 150) return 'unhealthy for sensitive groups'
  if (aqi <= 200) return 'unhealthy'
  if (aqi <= 300) return 'very unhealthy'
  return 'hazardous'
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10
}
