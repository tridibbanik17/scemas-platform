// AlertingManager read operations (HandleActiveAlerts boundary)
// writes (acknowledge, resolve) also here since they're simple state transitions

import { alerts, alertSubscriptions } from '@scemas/db/schema'
import { AlertStatusSchema } from '@scemas/types'
import { TRPCError } from '@trpc/server'
import { eq, desc, and, ne, inArray, gte, or, lt, count } from 'drizzle-orm'
import { z } from 'zod'
import { expandZoneIdSet, expandZoneSensorIdSet, normalizeZoneId } from '@/lib/zones'
import { acknowledgeAlert, resolveAlert } from '../handlers/alerts'
import { router, protectedProcedure } from '../trpc'

export const alertsRouter = router({
  // list alerts filtered by the operator's subscription preferences (cursor-based)
  list: protectedProcedure
    .input(
      z.object({
        status: AlertStatusSchema.optional(),
        zone: z.string().optional(),
        limit: z.number().min(1).max(200).default(100),
        cursor: z.string().datetime().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const conditions = [ne(alerts.status, 'resolved')]
      if (input.status) conditions.push(eq(alerts.status, input.status))
      if (input.zone) conditions.push(buildAlertZoneCondition([input.zone]))
      if (input.cursor) conditions.push(lt(alerts.createdAt, new Date(input.cursor)))

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

      const limit = input.limit
      const alertRows = await ctx.db.query.alerts.findMany({
        where: and(...conditions),
        orderBy: [desc(alerts.createdAt)],
        limit: limit + 1,
      })

      const hasMore = alertRows.length > limit
      const items = hasMore ? alertRows.slice(0, limit) : alertRows
      const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : undefined

      return {
        // oxlint-disable-next-line no-map-spread
        items: items.map(alert => ({
          ...alert,
          zone: normalizeZoneId(alert.zone, alert.sensorId),
        })),
        nextCursor,
      }
    }),

  count: protectedProcedure
    .input(z.object({ zone: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [ne(alerts.status, 'resolved')]

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

      if (input?.zone) conditions.push(buildAlertZoneCondition([input.zone]))

      const [row] = await ctx.db
        .select({ count: count() })
        .from(alerts)
        .where(and(...conditions))
      return row.count
    }),

  // list all alerts including resolved (for history view)
  history: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const alertRows = await ctx.db.query.alerts.findMany({
        orderBy: [desc(alerts.createdAt)],
        limit: input.limit,
      })

      // oxlint-disable-next-line no-map-spread
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
      const result = await acknowledgeAlert(input.id, ctx.user.id)
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error })
      }
      return { success: true as const }
    }),

  // resolve an alert (lifecycle: acknowledged → resolved)
  resolve: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const result = await resolveAlert(input.id, ctx.user.id)
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error })
      }
      return { success: true as const }
    }),

  // batch resolve (max 50 at a time)
  batchResolve: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }))
    .mutation(async ({ input, ctx }) => {
      const results = await Promise.all(input.ids.map(id => resolveAlert(id, ctx.user.id)))
      const failed = results.filter(r => !r.success).length
      return { resolved: results.length - failed, failed }
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
