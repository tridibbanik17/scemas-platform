import { auditLogs } from '@scemas/db/schema'
import { count, desc, lt } from 'drizzle-orm'
import { z } from 'zod'
import { adminProcedure, router } from '../trpc'

export const auditRouter = router({
  list: adminProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(200).default(100),
          cursor: z.number().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 100
      const cursor = input?.cursor

      const rows = await ctx.db.query.auditLogs.findMany({
        where: cursor ? lt(auditLogs.id, cursor) : undefined,
        orderBy: [desc(auditLogs.id)],
        limit: limit + 1,
      })

      const hasMore = rows.length > limit
      const items = hasMore ? rows.slice(0, limit) : rows
      const nextCursor = hasMore ? items[items.length - 1].id : undefined

      return { items, nextCursor }
    }),

  count: adminProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db.select({ count: count() }).from(auditLogs)
    return row.count
  }),

  frequency: adminProcedure
    .input(z.object({ hours: z.number().min(1).max(168).default(24) }).optional())
    .query(async ({ ctx, input }) => {
      const hours = input?.hours ?? 24
      const rows = await ctx.db.$client`
        SELECT
          date_trunc('hour', created_at) as hour,
          COUNT(*) FILTER (WHERE action LIKE '%success%' OR action LIKE '%created%' OR action LIKE '%updated%' OR action LIKE '%acknowledged%' OR action LIKE '%resolved%') as success,
          COUNT(*) FILTER (WHERE action LIKE '%failed%' OR action LIKE '%denied%') as errors,
          COUNT(*) as total
        FROM audit_logs
        WHERE created_at > NOW() - make_interval(hours => ${hours})
        GROUP BY hour
        ORDER BY hour ASC
      `
      return rows.map(row => ({
        hour: row.hour instanceof Date ? row.hour.toISOString() : String(row.hour),
        success: Number(row.success ?? 0),
        errors: Number(row.errors ?? 0),
        total: Number(row.total ?? 0),
      }))
    }),
})
