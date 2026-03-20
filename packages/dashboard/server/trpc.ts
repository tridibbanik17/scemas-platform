// tRPC server instance + context
// this is the Control layer of PAC: coordinates between Presentation (react) and Abstraction (drizzle/rust)

import type { Database } from '@scemas/db'
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { resolveSessionUser, type SessionUser } from '@/lib/session'
import { getDb } from './cached'
import { getJwtSecret } from './env'

export type Context = { db: Database; user: SessionUser | null; resHeaders: Headers }

export type AuthenticatedContext = Context & { user: SessionUser }

export async function createContext(opts: FetchCreateContextFnOptions): Promise<Context> {
  const db = getDb()
  const user = await resolveSessionUser(opts.req.headers.get('cookie'), getJwtSecret())

  return { db, user, resHeaders: opts.resHeaders }
}

const t = initTRPC.context<Context>().create({ transformer: superjson })

export const router = t.router
export const publicProcedure = t.procedure
export const middleware = t.middleware
export const createCallerFactory = t.createCallerFactory

// auth middleware: rejects if no user, narrows type so ctx.user is guaranteed non-null
const enforceAuth = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'not authenticated' })
  }
  return next({ ctx: { db: ctx.db, user: ctx.user, resHeaders: ctx.resHeaders } })
})

export const protectedProcedure = t.procedure.use(enforceAuth)

// admin-only middleware (stacks on enforceAuth)
const enforceAdmin = middleware(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'admin access required' })
  }
  return next({ ctx: { db: ctx.db, user: ctx.user, resHeaders: ctx.resHeaders } })
})

export const adminProcedure = t.procedure.use(enforceAuth).use(enforceAdmin)
