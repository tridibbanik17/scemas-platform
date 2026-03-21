// ProvidePublicAPI boundary (DataDistributionManager)
// PAC ABSTRACTION: this router returns FILTERED data for the PublicUserAgent
// public users + third-party devs see the same view: aggregated monitoring-region data only
// raw sensor_ids, device details, operator metadata are stripped

import {
  PublicRankingsQuerySchema,
  PublicZoneCurrentQuerySchema,
  PublicZoneHistoryQuerySchema,
} from '@scemas/types'
import { createDataDistributionManager } from '../data-distribution-manager'
import { router, publicProcedure } from '../trpc'

export const publicRouter = router({
  // aggregated AQI data per monitoring region (the public/third-party view)
  // ABSTRACTION: strips sensor_id, raw values, device metadata
  // only returns region-level aggregated information
  getZoneAQI: publicProcedure.query(async ({ ctx }) => {
    const manager = createDataDistributionManager(ctx.db)
    return manager.getPublicZoneAqi()
  }),

  getZoneList: publicProcedure.query(async ({ ctx }) => {
    const manager = createDataDistributionManager(ctx.db)
    return manager.getPublicZoneList()
  }),

  getZoneSummary: publicProcedure.query(async ({ ctx }) => {
    const manager = createDataDistributionManager(ctx.db)
    return manager.getPublicZoneSummary()
  }),

  getZoneCurrent: publicProcedure
    .input(PublicZoneCurrentQuerySchema)
    .query(async ({ input, ctx }) => {
      const manager = createDataDistributionManager(ctx.db)
      return manager.getPublicZoneCurrent(input.zoneId)
    }),

  getZoneHistory: publicProcedure
    .input(PublicZoneHistoryQuerySchema)
    .query(async ({ input, ctx }) => {
      const manager = createDataDistributionManager(ctx.db)
      return manager.getPublicZoneHistory(input)
    }),

  getRankings: publicProcedure.input(PublicRankingsQuerySchema).query(async ({ input, ctx }) => {
    const manager = createDataDistributionManager(ctx.db)
    return manager.getPublicRankings(input)
  }),

  getMetrics: publicProcedure.query(async ({ ctx }) => {
    const manager = createDataDistributionManager(ctx.db)
    return manager.getPublicMetricCatalog()
  }),

  getStatus: publicProcedure.query(async ({ ctx }) => {
    const manager = createDataDistributionManager(ctx.db)
    return manager.getPublicFeedStatus()
  }),
})
