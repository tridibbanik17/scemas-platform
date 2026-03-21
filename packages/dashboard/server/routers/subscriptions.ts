// ManageAlertSubscriptions boundary (innovative feature)
// operators subscribe to specific metrics/zones/severity levels

import { alertSubscriptions } from '@scemas/db/schema'
import { UpdateAlertSubscriptionSchema } from '@scemas/types'
import { eq } from 'drizzle-orm'
import { normalizeZoneIds } from '@/lib/zones'
import { router, protectedProcedure } from '../trpc'

export const subscriptionsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const subscription = await ctx.db.query.alertSubscriptions.findFirst({
      where: eq(alertSubscriptions.userId, ctx.user.id),
    })

    return subscription
      ? { ...subscription, zones: normalizeZoneIds(subscription.zones ?? []) }
      : null
  }),

  update: protectedProcedure
    .input(UpdateAlertSubscriptionSchema)
    .mutation(async ({ input, ctx }) => {
      const normalizedZones = input.zones ? normalizeZoneIds(input.zones) : undefined
      const existing = await ctx.db.query.alertSubscriptions.findFirst({
        where: eq(alertSubscriptions.userId, ctx.user.id),
      })

      if (existing) {
        await ctx.db
          .update(alertSubscriptions)
          .set({
            metricTypes: input.metricTypes,
            zones: normalizedZones,
            minSeverity: input.minSeverity,
            webhookUrl: input.webhookUrl,
            updatedAt: new Date(),
          })
          .where(eq(alertSubscriptions.userId, ctx.user.id))
      } else {
        await ctx.db
          .insert(alertSubscriptions)
          .values({
            userId: ctx.user.id,
            metricTypes: input.metricTypes ?? [],
            zones: normalizedZones ?? [],
            minSeverity: input.minSeverity ?? 1,
            webhookUrl: input.webhookUrl ?? null,
          })
      }

      return { success: true }
    }),
})
