// AlertingManager read operations (HandleActiveAlerts boundary)
// writes (acknowledge, resolve) also here since they're simple state transitions

import { alerts } from '@scemas/db/schema'
import { AlertStatusSchema } from '@scemas/types'
import { TRPCError } from '@trpc/server'
import { eq, desc, and } from 'drizzle-orm'
import { z } from 'zod'
import { callRustEndpoint, extractRustErrorMessage } from '../rust-client'
import { router, protectedProcedure } from '../trpc'

const SuccessResponseSchema = z.object({ success: z.literal(true) })

export const alertsRouter = router({
  // list alerts with optional status filter
  list: protectedProcedure
    .input(
      z.object({
        status: AlertStatusSchema.optional(),
        zone: z.string().optional(),
        limit: z.number().default(50),
      }),
    )
    .query(async ({ input, ctx }) => {
      const conditions = []
      if (input.status) conditions.push(eq(alerts.status, input.status))
      if (input.zone) conditions.push(eq(alerts.zone, input.zone))

      return ctx.db.query.alerts.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: [desc(alerts.createdAt)],
        limit: input.limit,
      })
    }),

  // get single alert by id
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.query.alerts.findFirst({ where: eq(alerts.id, input.id) })
    }),

  // alert frequency: count by hour grouped by severity (for charts)
  frequency: protectedProcedure
    .input(z.object({ hours: z.number().min(1).max(168).default(24) }))
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
