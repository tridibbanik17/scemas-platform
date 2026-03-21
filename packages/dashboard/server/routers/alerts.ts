// AlertingManager read operations (HandleActiveAlerts boundary)
// writes (acknowledge, resolve) also here since they're simple state transitions

import { alerts, alertSubscriptions } from '@scemas/db/schema'
import { AlertStatusSchema } from '@scemas/types'
import { TRPCError } from '@trpc/server'
import { eq, desc, and, ne, inArray, gte, or } from 'drizzle-orm'
import { z } from 'zod'
import { expandZoneIdSet, expandZoneSensorIdSet, normalizeZoneId } from '@/lib/zones'
import { callRustEndpoint, extractRustErrorMessage } from '../rust-client'
import { router, protectedProcedure } from '../trpc'

const SuccessResponseSchema = z.object({ success: z.literal(true) })

export const alertsRouter = router({
  // list alerts filtered by the operator's subscription preferences
  list: protectedProcedure
    .input(
      z.object({
        status: AlertStatusSchema.optional(),
        zone: z.string().optional(),
        limit: z.number().default(50),
      }),
    )
    .query(async ({ input, ctx }) => {
      const conditions = [ne(alerts.status, 'resolved')]
      if (input.status) conditions.push(eq(alerts.status, input.status))
      if (input.zone) conditions.push(buildAlertZoneCondition([input.zone]))

      const subscription = await ctx.db.query.alertSubscriptions.findFirst({
        where: eq(alertSubscriptions.userId, ctx.user.id),
      })

      if (subscription) {
        if (subscription.metricTypes && subscription.metricTypes.length > 0) {
          conditions.push(inArray(alerts.metricType, subscription.metricTypes))
        }
        if (subscription.zones && subscription.zones.length > 0) {
          conditions.push(buildAlertZoneCondition(subscription.zones))
        }
        if (subscription.minSeverity && subscription.minSeverity > 1) {
          conditions.push(gte(alerts.severity, subscription.minSeverity))
        }
      }

      const alertRows = await ctx.db.query.alerts.findMany({
        where: and(...conditions),
        orderBy: [desc(alerts.createdAt)],
        limit: input.limit,
      })

      return alertRows.map(alert => ({
        ...alert,
        zone: normalizeZoneId(alert.zone, alert.sensorId),
      }))
    }),

  // list all alerts including resolved (for history view)
  history: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const alertRows = await ctx.db.query.alerts.findMany({
        orderBy: [desc(alerts.createdAt)],
        limit: input.limit,
      })

      return alertRows.map(alert => ({
        ...alert,
        zone: normalizeZoneId(alert.zone, alert.sensorId),
      }))
    }),

  // get single alert by id
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const alert = await ctx.db.query.alerts.findFirst({ where: eq(alerts.id, input.id) })
      return alert ? { ...alert, zone: normalizeZoneId(alert.zone, alert.sensorId) } : null
    }),

  // alert frequency: count by hour grouped by severity (for charts)
  frequency: protectedProcedure
    .input(z.object({ hours: z.number().min(1).max(720).default(24) }))
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db.$client`
        SELECT
          date_trunc('hour', created_at) as hour,
          COUNT(*) FILTER (WHERE severity = 1) as low,
          COUNT(*) FILTER (WHERE severity = 2) as warning,
          COUNT(*) FILTER (WHERE severity = 3) as critical
        FROM alerts
        WHERE created_at > NOW() - make_interval(hours => ${input.hours})
        GROUP BY hour
        ORDER BY hour ASC
      `
      return rows.map(row => ({
        hour: row.hour instanceof Date ? row.hour.toISOString() : String(row.hour),
        low: Number(row.low ?? 0),
        warning: Number(row.warning ?? 0),
        critical: Number(row.critical ?? 0),
      }))
    }),

  // acknowledge an alert (lifecycle: active → acknowledged)
  acknowledge: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { data, status } = await callRustEndpoint(
        `/internal/alerting/alerts/${input.id}/acknowledge`,
        { method: 'POST', body: JSON.stringify({ userId: ctx.user.id }) },
      )

      if (status >= 400) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: extractRustErrorMessage(data) ?? 'alert acknowledgement failed',
        })
      }

      const parsed = SuccessResponseSchema.safeParse(data)
      if (!parsed.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'rust alerting manager returned an invalid acknowledge response',
        })
      }

      return parsed.data
    }),

  // resolve an alert (lifecycle: acknowledged → resolved)
  resolve: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { data, status } = await callRustEndpoint(
        `/internal/alerting/alerts/${input.id}/resolve`,
        { method: 'POST', body: JSON.stringify({ userId: ctx.user.id }) },
      )

      if (status >= 400) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: extractRustErrorMessage(data) ?? 'alert resolution failed',
        })
      }

      const parsed = SuccessResponseSchema.safeParse(data)
      if (!parsed.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'rust alerting manager returned an invalid resolve response',
        })
      }

      return parsed.data
    }),
})

function buildAlertZoneCondition(zonesToMatch: string[]) {
  const expandedZones = expandZoneIdSet(zonesToMatch)
  const sensorIds = expandZoneSensorIdSet(zonesToMatch)
  const zoneCondition = inArray(alerts.zone, expandedZones)

  if (sensorIds.length === 0) {
    return zoneCondition
  }

  return or(zoneCondition, inArray(alerts.sensorId, sensorIds)) ?? zoneCondition
}
