// MonitorSCEMASPlatformStatus boundary

import { router, adminProcedure } from '../trpc'
import { platformStatus } from '@scemas/db/schema'
import { desc } from 'drizzle-orm'

import { getInternalRustUrl } from '../env'

const RUST_URL = getInternalRustUrl()

export const healthRouter = router({
  // platform status from database
  status: adminProcedure
    .query(async ({ ctx }) => {
      return ctx.db.query.platformStatus.findMany({
        orderBy: [desc(platformStatus.time)],
        limit: 10,
      })
    }),

  // platform status time series (more rows for charting)
  statusTimeSeries: adminProcedure
    .query(async ({ ctx }) => {
      return ctx.db.query.platformStatus.findMany({
        orderBy: [desc(platformStatus.time)],
        limit: 50,
      })
    }),

  // ingestion health from rust engine
  ingestion: adminProcedure
    .query(async () => {
      try {
        const res = await fetch(`${RUST_URL}/internal/health`)
        if (!res.ok) return { status: 'error', message: 'rust engine unreachable' }
        return { status: 'ok', ...(await res.json()) }
      } catch {
        return { status: 'error', message: 'rust engine not running' }
      }
    }),
})
