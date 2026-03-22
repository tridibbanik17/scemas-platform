// ManageAlertSubscriptions boundary (innovative feature)
// operators subscribe to specific metrics/zones/severity levels

import { UpdateAlertSubscriptionSchema } from '@scemas/types'
import { getSubscription, upsertSubscription } from '../handlers/subscriptions'
import { router, protectedProcedure } from '../trpc'

export const subscriptionsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return getSubscription(ctx.db, ctx.user.id)
  }),

  update: protectedProcedure
    .input(UpdateAlertSubscriptionSchema)
    .mutation(async ({ input, ctx }) => {
      return upsertSubscription(ctx.db, ctx.user.id, input)
    }),
})
