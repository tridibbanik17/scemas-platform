import { auditLogs } from '@scemas/db/schema'
import { desc } from 'drizzle-orm'
import { z } from 'zod'
import { adminProcedure, router } from '../trpc'

export const auditRouter = router({
  list: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.auditLogs.findMany({
        orderBy: [desc(auditLogs.createdAt)],
        limit: input?.limit ?? 50,
      })
    }),
})
