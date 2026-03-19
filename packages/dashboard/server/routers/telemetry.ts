// TelemetryManager tRPC router
// ingest: proxies to rust internal API (pipe-and-filter pattern)
// reads: direct drizzle queries (no pattern needed for reads)

import { router, protectedProcedure } from '../trpc'
import { SensorReadingSchema } from '@scemas/types'
import { sensorReadings } from '@scemas/db/schema'
import { desc, eq, and, sql } from 'drizzle-orm'
import { z } from 'zod'

import { buildDeviceAuthToken, getInternalRustUrl } from '../env'
import { createDataDistributionManager } from '../data-distribution-manager'

const RUST_URL = getInternalRustUrl()

export const telemetryRouter = router({
  // IngestSensorStreams boundary: proxies to rust for pipe-and-filter demonstration
  ingest: protectedProcedure
    .input(SensorReadingSchema)
    .mutation(async ({ input }) => {
      const res = await fetch(`${RUST_URL}/internal/telemetry/ingest`, {
        method: 'POST',
        body: JSON.stringify(input),
        headers: {
          'Content-Type': 'application/json',
          'x-scemas-device-id': input.sensorId,
          'x-scemas-device-token': buildDeviceAuthToken(),
        },
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'telemetry ingestion failed')
      }
      return res.json()
    }),

  // get recent readings for a zone (operator view: full data)
  getByZone: protectedProcedure
    .input(z.object({
      zone: z.string(),
      metricType: z.string().optional(),
      limit: z.number().default(100),
    }))
    .query(async ({ input, ctx }) => {
      return ctx.db.query.sensorReadings.findMany({
        where: input.metricType
          ? and(eq(sensorReadings.zone, input.zone), eq(sensorReadings.metricType, input.metricType))
          : eq(sensorReadings.zone, input.zone),
        orderBy: [desc(sensorReadings.time)],
        limit: input.limit,
      })
    }),

  // get latest reading per sensor (for dashboard map)
  getLatest: protectedProcedure
    .query(async ({ ctx }) => {
      const manager = createDataDistributionManager(ctx.db)
      return manager.getLatestSensorReadings(100)
    }),

  // time series from analytics table (5m_avg buckets, pivoted by metric type)
  getTimeSeries: protectedProcedure
    .input(z.object({
      zone: z.string(),
      hours: z.number().min(1).max(168).default(6),
    }))
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db.$client`
        SELECT
          time,
          MAX(CASE WHEN metric_type = 'temperature' THEN aggregated_value END) as temperature,
          MAX(CASE WHEN metric_type = 'humidity' THEN aggregated_value END) as humidity,
          MAX(CASE WHEN metric_type = 'air_quality' THEN aggregated_value END) as "airQuality",
          MAX(CASE WHEN metric_type = 'noise_level' THEN aggregated_value END) as "noiseLevel"
        FROM analytics
        WHERE zone = ${input.zone}
          AND aggregation_type = '5m_avg'
          AND time > NOW() - make_interval(hours => ${input.hours})
        GROUP BY time
        ORDER BY time ASC
      `
      return rows.map(row => ({
        time: row.time instanceof Date ? row.time.toISOString() : String(row.time),
        temperature: row.temperature != null ? Number(row.temperature) : null,
        humidity: row.humidity != null ? Number(row.humidity) : null,
        airQuality: row.airQuality != null ? Number(row.airQuality) : null,
        noiseLevel: row.noiseLevel != null ? Number(row.noiseLevel) : null,
      }))
    }),
})
