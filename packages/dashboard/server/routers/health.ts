// MonitorSCEMASPlatformStatus boundary

import { platformStatus } from '@scemas/db/schema'
import { desc } from 'drizzle-orm'
import { callRustEndpoint } from '../rust-client'
import { router, adminProcedure } from '../trpc'

export const healthRouter = router({
  // platform status from database
  status: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.query.platformStatus.findMany({ orderBy: [desc(platformStatus.time)], limit: 10 })
  }),

  // platform status time series (more rows for charting)
  statusTimeSeries: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.query.platformStatus.findMany({ orderBy: [desc(platformStatus.time)], limit: 50 })
  }),

  // ingestion health from rust engine
  ingestion: adminProcedure.query(async () => {
    try {
      const { data, status } = await callRustEndpoint('/internal/health', { method: 'GET' })

      if (status >= 400) {
        return { status: 'error', message: 'rust engine unreachable' }
      }

      return { status: 'ok', ...(isRecord(data) ? data : {}) }
    } catch {
      return { status: 'error', message: 'rust engine not running' }
    }
  }),
})

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
}
