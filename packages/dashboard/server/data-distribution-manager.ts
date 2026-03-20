import type { Database } from '@scemas/db'
import type {
  MetricType,
  PublicAggregationType,
  PublicFeedStatus,
  PublicMetricDescriptor,
  PublicRankingRow,
  PublicRankingsQuery,
  PublicRankingStat,
  PublicZoneHistoryPoint,
  PublicZoneHistoryQuery,
  PublicZoneSummary,
  ZoneAQI,
} from '@scemas/types'
import { analytics, sensorReadings } from '@scemas/db/schema'
import { MetricTypeSchema } from '@scemas/types'
import { and, asc, desc, eq, gte, inArray, or } from 'drizzle-orm'
import {
  expandZoneIds,
  expandZoneSensorIds,
  formatZoneName,
  isKnownZoneId,
  normalizeZoneId,
} from '@/lib/zones'

const defaultPublicAggregationType: PublicAggregationType = '5m_avg'
const publicAggregationCadenceSeconds = 300

const pm25Breakpoints = [
  { concentrationLow: 0.0, concentrationHigh: 12.0, aqiLow: 0, aqiHigh: 50 },
  { concentrationLow: 12.1, concentrationHigh: 35.4, aqiLow: 51, aqiHigh: 100 },
  { concentrationLow: 35.5, concentrationHigh: 55.4, aqiLow: 101, aqiHigh: 150 },
  { concentrationLow: 55.5, concentrationHigh: 150.4, aqiLow: 151, aqiHigh: 200 },
  { concentrationLow: 150.5, concentrationHigh: 250.4, aqiLow: 201, aqiHigh: 300 },
  { concentrationLow: 250.5, concentrationHigh: 500.4, aqiLow: 301, aqiHigh: 500 },
]

const publicMetricCatalog = [
  {
    metricType: 'temperature',
    label: 'temperature',
    unit: 'c',
    description: 'five minute average ambient temperature by monitoring zone.',
    supportedAggregations: [defaultPublicAggregationType],
    updateCadenceSeconds: publicAggregationCadenceSeconds,
  },
  {
    metricType: 'humidity',
    label: 'humidity',
    unit: '%',
    description: 'five minute average relative humidity by monitoring zone.',
    supportedAggregations: [defaultPublicAggregationType],
    updateCadenceSeconds: publicAggregationCadenceSeconds,
  },
  {
    metricType: 'air_quality',
    label: 'pm2.5 air quality',
    unit: 'ug/m3',
    description: 'five minute average particulate concentration used to compute zone AQI.',
    supportedAggregations: [defaultPublicAggregationType],
    updateCadenceSeconds: publicAggregationCadenceSeconds,
  },
  {
    metricType: 'noise_level',
    label: 'noise level',
    unit: 'db',
    description: 'five minute average environmental noise level by monitoring zone.',
    supportedAggregations: [defaultPublicAggregationType],
    updateCadenceSeconds: publicAggregationCadenceSeconds,
  },
] satisfies PublicMetricDescriptor[]

export type LatestSensorReading = {
  sensorId: string
  metricType: MetricType
  value: number
  zone: string
  time: Date
}

type AnalyticsAggregateRow = {
  zone: string
  metricType: string
  aggregatedValue: number
  aggregationType: string
  time: Date
  sampleCount: number | null
}

type PublicZoneSummaryDraft = {
  zone: string
  zoneName: string
  aqi: number
  aqiLabel: string
  temperature: number | null
  humidity: number | null
  noiseLevel: number | null
  lastUpdatedAt: Date | null
}

type RankingAccumulator = {
  sum: number
  count: number
  currentValue: number | null
  maxValue: number | null
  lastUpdatedAt: Date | null
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
    const zoneIds = expandZoneIds(zone)
    const sensorIds = expandZoneSensorIds(zone)
    const zoneCondition =
      sensorIds.length > 0
        ? or(inArray(sensorReadings.zone, zoneIds), inArray(sensorReadings.sensorId, sensorIds))
        : inArray(sensorReadings.zone, zoneIds)

    const rows = await this.db.query.sensorReadings.findMany({
      where: zoneCondition,
      orderBy: [desc(sensorReadings.time)],
      limit: safeLimit,
    })

    return rows.map(row => {
      const metricType = parseMetricType(row.metricType)
      if (!metricType) {
        throw new Error(`unknown metric type in sensor_readings: ${row.metricType}`)
      }

      return {
        sensorId: row.sensorId,
        metricType,
        value: row.value,
        zone: normalizeZoneId(row.zone, row.sensorId),
        time: row.time,
      }
    })
  }

  async getPublicZoneSummary(): Promise<PublicZoneSummary[]> {
    const now = new Date()
    const zoneIds = await this.getPublicDeviceZoneIds()
    const rows = await this.getLatestPublicAggregateRows(defaultPublicAggregationType)

    const zones = new Map<string, PublicZoneSummaryDraft>(
      zoneIds.map(zoneId => [zoneId, createPublicZoneSummaryDraft(zoneId)]),
    )

    for (const row of rows) {
      const zoneId = normalizeZoneId(row.zone)
      if (!zones.has(zoneId) || !isKnownZoneId(zoneId)) {
        continue
      }

      const metricType = parseMetricType(row.metricType)
      if (!metricType) {
        continue
      }

      const zone = zones.get(zoneId)
      if (!zone) {
        continue
      }

      applyAggregateToZoneSummary(zone, metricType, row.aggregatedValue, row.time)
    }

    return Array.from(zones.values())
      .map(zone => finalizePublicZoneSummary(zone, now))
      .toSorted((left, right) => left.zone.localeCompare(right.zone))
  }

  async getPublicZoneCurrent(zoneId: string): Promise<PublicZoneSummary | null> {
    const normalizedZoneId = normalizeZoneId(zoneId)
    if (!isKnownZoneId(normalizedZoneId)) {
      return null
    }

    const zones = await this.getPublicZoneSummary()
    return zones.find(zone => zone.zone === normalizedZoneId) ?? null
  }

  async getPublicZoneHistory(query: PublicZoneHistoryQuery): Promise<PublicZoneHistoryPoint[]> {
    const normalizedZoneId = normalizeZoneId(query.zoneId)
    if (!isKnownZoneId(normalizedZoneId)) {
      return []
    }

    const rows = await this.db.query.analytics.findMany({
      where: and(
        inArray(analytics.zone, expandZoneIds(normalizedZoneId)),
        eq(analytics.metricType, query.metricType),
        eq(analytics.aggregationType, query.bucket),
        gte(analytics.time, new Date(Date.now() - query.windowHours * 60 * 60 * 1000)),
      ),
      orderBy: [asc(analytics.time)],
    })

    const points = new Map<string, PublicZoneHistoryPoint>()
    const zoneName = formatZoneName(normalizedZoneId, 'title')

    for (const row of rows) {
      const pointTime = row.time.toISOString()
      points.set(pointTime, {
        zone: normalizedZoneId,
        zoneName,
        metricType: query.metricType,
        aggregationType: query.bucket,
        time: pointTime,
        value: row.aggregatedValue,
        sampleCount: row.sampleCount ?? null,
      })
    }

    return Array.from(points.values())
  }

  async getPublicRankings(query: PublicRankingsQuery): Promise<PublicRankingRow[]> {
    const knownZones = new Set(await this.getPublicDeviceZoneIds())
    const rows = await this.db.query.analytics.findMany({
      where: and(
        eq(analytics.metricType, query.metricType),
        eq(analytics.aggregationType, query.bucket),
        gte(analytics.time, new Date(Date.now() - query.periodHours * 60 * 60 * 1000)),
      ),
      orderBy: [asc(analytics.time)],
    })

    const rankings = new Map<string, RankingAccumulator>()

    for (const row of rows) {
      const zoneId = normalizeZoneId(row.zone)
      if (!knownZones.has(zoneId) || !isKnownZoneId(zoneId)) {
        continue
      }

      const accumulator = rankings.get(zoneId) ?? {
        sum: 0,
        count: 0,
        currentValue: null,
        maxValue: null,
        lastUpdatedAt: null,
      }

      accumulator.sum += row.aggregatedValue
      accumulator.count += 1
      accumulator.maxValue =
        accumulator.maxValue === null
          ? row.aggregatedValue
          : Math.max(accumulator.maxValue, row.aggregatedValue)

      if (!accumulator.lastUpdatedAt || row.time >= accumulator.lastUpdatedAt) {
        accumulator.currentValue = row.aggregatedValue
        accumulator.lastUpdatedAt = row.time
      }

      rankings.set(zoneId, accumulator)
    }

    const rankingRows: PublicRankingRow[] = []

    for (const [zoneId, accumulator] of rankings) {
      const value = selectRankingValue(accumulator, query.stat)
      if (value === null) {
        continue
      }

      rankingRows.push({
        zone: zoneId,
        zoneName: formatZoneName(zoneId, 'title'),
        metricType: query.metricType,
        stat: query.stat,
        value: roundToSingleDecimal(value),
        aggregationType: query.bucket,
        windowHours: query.periodHours,
        lastUpdated: accumulator.lastUpdatedAt?.toISOString() ?? null,
      })
    }

    return rankingRows
      .toSorted((left, right) => {
        const valueDelta = right.value - left.value
        return valueDelta === 0 ? left.zone.localeCompare(right.zone) : valueDelta
      })
      .slice(0, query.limit)
  }

  getPublicMetricCatalog(): PublicMetricDescriptor[] {
    return publicMetricCatalog
  }

  async getPublicFeedStatus(): Promise<PublicFeedStatus> {
    const generatedAt = new Date()
    const zoneIds = await this.getPublicDeviceZoneIds()
    const rawRows = await this.db.$client<{ zone: string; time: unknown }[]>`
      select distinct on (zone) zone, time
      from analytics
      where aggregation_type = ${defaultPublicAggregationType}
      order by zone, time desc
    `
    const rows = rawRows.map(row => ({ zone: row.zone, time: coerceDateTime(row.time) }))

    const latestByZone = new Map<string, Date>()

    for (const row of rows) {
      const zoneId = normalizeZoneId(row.zone)
      if (!zoneIds.includes(zoneId) || !isKnownZoneId(zoneId)) {
        continue
      }

      const latest = latestByZone.get(zoneId)
      if (!latest || row.time > latest) {
        latestByZone.set(zoneId, row.time)
      }
    }

    const aggregateTimes = Array.from(latestByZone.values()).toSorted(
      (left, right) => left.getTime() - right.getTime(),
    )

    return {
      generatedAt: generatedAt.toISOString(),
      aggregationType: defaultPublicAggregationType,
      zonesTotal: zoneIds.length,
      zonesReporting: latestByZone.size,
      zonesAwaitingTelemetry: zoneIds.filter(zoneId => !latestByZone.has(zoneId)),
      latestAggregateAt: aggregateTimes.at(-1)?.toISOString() ?? null,
      oldestAggregateAt: aggregateTimes.at(0)?.toISOString() ?? null,
    }
  }

  async getPublicZoneAqi(): Promise<ZoneAQI[]> {
    const zones = await this.getPublicZoneSummary()

    return zones.map(zone => ({
      zone: zone.zone,
      aqi: zone.aqi,
      label: zone.aqiLabel,
      ...(zone.temperature === null ? {} : { temperature: zone.temperature }),
      ...(zone.humidity === null ? {} : { humidity: zone.humidity }),
    }))
  }

  private async getPublicDeviceZoneIds(): Promise<string[]> {
    const rows = await this.db.$client<{ zone: string }[]>`
      select distinct zone
      from devices
      order by zone asc
    `

    const zoneIds = new Set<string>()
    for (const row of rows) {
      const zoneId = normalizeZoneId(row.zone)
      if (isKnownZoneId(zoneId)) {
        zoneIds.add(zoneId)
      }
    }

    return Array.from(zoneIds).toSorted((left, right) => left.localeCompare(right))
  }

  private async getLatestPublicAggregateRows(
    aggregationType: PublicAggregationType,
  ): Promise<AnalyticsAggregateRow[]> {
    const rows = await this.db.$client<
      Array<{
        zone: string
        metricType: string
        aggregatedValue: unknown
        aggregationType: string
        time: unknown
        sampleCount: unknown
      }>
    >`
      select distinct on (zone, metric_type)
        zone,
        metric_type as "metricType",
        aggregated_value as "aggregatedValue",
        aggregation_type as "aggregationType",
        time,
        sample_count as "sampleCount"
      from analytics
      where aggregation_type = ${aggregationType}
      order by zone, metric_type, time desc
    `

    return rows.map(coerceAnalyticsAggregateRow)
  }
}

export function createDataDistributionManager(db: Database): DataDistributionManager {
  return new DataDistributionManager(db)
}

function coerceReadingRow(row: Record<string, unknown>): LatestSensorReading {
  const metricType = parseMetricType(String(row.metricType))
  if (!metricType) {
    throw new Error(`unknown metric type in latest sensor reading row: ${String(row.metricType)}`)
  }

  return {
    sensorId: String(row.sensorId),
    metricType,
    value: Number(row.value),
    zone: normalizeZoneId(String(row.zone), String(row.sensorId)),
    time: row.time instanceof Date ? row.time : new Date(String(row.time)),
  }
}

function coerceAnalyticsAggregateRow(row: {
  zone: string
  metricType: string
  aggregatedValue: unknown
  aggregationType: string
  time: unknown
  sampleCount: unknown
}): AnalyticsAggregateRow {
  return {
    zone: row.zone,
    metricType: row.metricType,
    aggregatedValue: Number(row.aggregatedValue),
    aggregationType: row.aggregationType,
    time: coerceDateTime(row.time),
    sampleCount: coerceOptionalInteger(row.sampleCount),
  }
}

function coerceDateTime(value: unknown): Date {
  if (value instanceof Date) {
    return value
  }

  const parsedValue = new Date(String(value))
  if (Number.isNaN(parsedValue.getTime())) {
    throw new Error(`invalid datetime value: ${String(value)}`)
  }

  return parsedValue
}

function coerceOptionalInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }

  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? Math.trunc(parsedValue) : null
}

function parseMetricType(value: string): MetricType | null {
  const parsedValue = MetricTypeSchema.safeParse(value)
  return parsedValue.success ? parsedValue.data : null
}

function createPublicZoneSummaryDraft(zoneId: string): PublicZoneSummaryDraft {
  return {
    zone: zoneId,
    zoneName: formatZoneName(zoneId, 'title'),
    aqi: 0,
    aqiLabel: 'awaiting telemetry',
    temperature: null,
    humidity: null,
    noiseLevel: null,
    lastUpdatedAt: null,
  }
}

function applyAggregateToZoneSummary(
  zone: PublicZoneSummaryDraft,
  metricType: MetricType,
  aggregatedValue: number,
  time: Date,
): void {
  if (!zone.lastUpdatedAt || time > zone.lastUpdatedAt) {
    zone.lastUpdatedAt = time
  }

  if (metricType === 'air_quality') {
    zone.aqi = pm25ToAqi(aggregatedValue)
    zone.aqiLabel = aqiLabel(zone.aqi)
  }

  if (metricType === 'temperature') {
    zone.temperature = roundToSingleDecimal(aggregatedValue)
  }

  if (metricType === 'humidity') {
    zone.humidity = roundToSingleDecimal(aggregatedValue)
  }

  if (metricType === 'noise_level') {
    zone.noiseLevel = roundToSingleDecimal(aggregatedValue)
  }
}

function finalizePublicZoneSummary(zone: PublicZoneSummaryDraft, now: Date): PublicZoneSummary {
  return {
    zone: zone.zone,
    zoneName: zone.zoneName,
    aqi: zone.aqi,
    aqiLabel: zone.aqiLabel,
    temperature: zone.temperature,
    humidity: zone.humidity,
    noiseLevel: zone.noiseLevel,
    lastUpdated: zone.lastUpdatedAt?.toISOString() ?? null,
    freshnessSeconds: zone.lastUpdatedAt ? toFreshnessSeconds(now, zone.lastUpdatedAt) : null,
  }
}

function toFreshnessSeconds(now: Date, lastUpdatedAt: Date): number {
  return Math.max(0, Math.floor((now.getTime() - lastUpdatedAt.getTime()) / 1000))
}

function selectRankingValue(
  accumulator: RankingAccumulator,
  stat: PublicRankingStat,
): number | null {
  if (stat === 'current') {
    return accumulator.currentValue
  }

  if (stat === 'max') {
    return accumulator.maxValue
  }

  if (accumulator.count === 0) {
    return null
  }

  return accumulator.sum / accumulator.count
}

function pm25ToAqi(concentration: number): number {
  const truncatedConcentration = Math.floor(concentration * 10) / 10
  const breakpoint =
    pm25Breakpoints.find(
      candidate =>
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
