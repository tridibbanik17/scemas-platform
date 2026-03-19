// ManageAlertSubscriptions boundary (innovative feature)
// operators subscribe to specific metrics/zones/severity levels

import { router, protectedProcedure } from '../trpc'
import { alertSubscriptions } from '@scemas/db/schema'
import { eq } from 'drizzle-orm'
import { UpdateAlertSubscriptionSchema } from '@scemas/types'

export const subscriptionsRouter = router({
  get: protectedProcedure
    .query(async ({ ctx }) => {
      const subscription = await ctx.db.query.alertSubscriptions.findFirst({
        where: eq(alertSubscriptions.userId, ctx.user.id),
      })

      return subscription ?? null
    }),

  update: protectedProcedure
    .input(UpdateAlertSubscriptionSchema)
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.db.query.alertSubscriptions.findFirst({
        where: eq(alertSubscriptions.userId, ctx.user.id),
      })

      if (existing) {
        await ctx.db
          .update(alertSubscriptions)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(alertSubscriptions.userId, ctx.user.id))
      } else {
        await ctx.db.insert(alertSubscriptions).values({
          userId: ctx.user.id,
          metricTypes: input.metricTypes ?? [],
          zones: input.zones ?? [],
          minSeverity: input.minSeverity ?? 1,
        })
      }

      return { success: true }
    }),
})
