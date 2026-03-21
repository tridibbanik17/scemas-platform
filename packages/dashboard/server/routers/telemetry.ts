// TelemetryManager tRPC router
// ingest: proxies to rust internal API (pipe-and-filter pattern)
// reads: direct drizzle queries (no pattern needed for reads)

import { analytics, sensorReadings } from '@scemas/db/schema'
import { SensorReadingSchema } from '@scemas/types'
import { and, asc, desc, eq, gte, inArray, or } from 'drizzle-orm'
import { z } from 'zod'
import { expandZoneIds, expandZoneSensorIds } from '@/lib/zones'
import { createDataDistributionManager } from '../data-distribution-manager'
import { buildDeviceAuthToken } from '../env'
import { callRustEndpoint } from '../rust-client'
import { router, protectedProcedure } from '../trpc'

export const telemetryRouter = router({
  // IngestSensorStreams boundary: proxies to rust for pipe-and-filter demonstration
  ingest: protectedProcedure.input(SensorReadingSchema).mutation(async ({ input }) => {
    const { data, status } = await callRustEndpoint('/internal/telemetry/ingest', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: {
        'x-scemas-device-id': input.sensorId,
        'x-scemas-device-token': buildDeviceAuthToken(),
      },
    })

    if (status >= 400) {
      throw new Error(getTelemetryErrorMessage(data))
    }

    return data
  }),

  // get recent readings for a zone (operator view: full data)
  getByZone: protectedProcedure
    .input(
      z.object({
        zone: z.string(),
        metricType: z.string().optional(),
        limit: z.number().default(100),
      }),
    )
    .query(async ({ input, ctx }) => {
      const zoneIds = expandZoneIds(input.zone)
      const sensorIds = expandZoneSensorIds(input.zone)
      const zoneCondition =
        sensorIds.length > 0
          ? or(inArray(sensorReadings.zone, zoneIds), inArray(sensorReadings.sensorId, sensorIds))
          : inArray(sensorReadings.zone, zoneIds)

      return ctx.db.query.sensorReadings.findMany({
        where: input.metricType
          ? and(zoneCondition, eq(sensorReadings.metricType, input.metricType))
          : zoneCondition,
        orderBy: [desc(sensorReadings.time)],
        limit: input.limit,
      })
    }),

  // get latest reading per sensor (for dashboard map)
  getLatest: protectedProcedure.query(async ({ ctx }) => {
    const manager = createDataDistributionManager(ctx.db)
    return manager.getLatestSensorReadings(200)
  }),

  // time series from analytics table (5m_avg buckets, pivoted by metric type)
  getTimeSeries: protectedProcedure
    .input(z.object({ zone: z.string(), hours: z.number().min(1).max(720).default(6) }))
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db.query.analytics.findMany({
        where: and(
          inArray(analytics.zone, expandZoneIds(input.zone)),
          eq(analytics.aggregationType, '5m_avg'),
          gte(analytics.time, new Date(Date.now() - input.hours * 60 * 60 * 1000)),
        ),
        orderBy: [asc(analytics.time)],
      })

      const points = new Map<
        string,
        {
          time: string
          temperature: number | null
          humidity: number | null
          airQuality: number | null
          noiseLevel: number | null
        }
      >()

      for (const row of rows) {
        const pointTime = row.time.toISOString()
        const point = points.get(pointTime) ?? {
          time: pointTime,
          temperature: null,
          humidity: null,
          airQuality: null,
          noiseLevel: null,
        }

        if (row.metricType === 'temperature') point.temperature = row.aggregatedValue
        if (row.metricType === 'humidity') point.humidity = row.aggregatedValue
        if (row.metricType === 'air_quality') point.airQuality = row.aggregatedValue
        if (row.metricType === 'noise_level') point.noiseLevel = row.aggregatedValue

        points.set(pointTime, point)
      }

      return Array.from(points.values())
    }),
})

function getTelemetryErrorMessage(payload: unknown): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error
  }

  return 'telemetry ingestion failed'
}
