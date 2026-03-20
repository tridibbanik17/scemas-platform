// AccessManager controller (repository pattern)
// handles: SignupForAccount, LoginToSCEMAS boundaries
// passive data store: deterministic queries against postgres via drizzle

import { accounts } from '@scemas/db/schema'
import { AuthSessionSchema, LoginSchema, SignupSchema } from '@scemas/types'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  serializeClearedSessionCookie,
  serializeSessionCookie,
  sessionLandingPath,
} from '@/lib/session'
import { callRustEndpoint, extractRustErrorMessage } from '../rust-client'
import { router, publicProcedure, protectedProcedure } from '../trpc'

export const authRouter = router({
  signup: publicProcedure.input(SignupSchema).mutation(async ({ input, ctx }) => {
    const session = await authenticateWithRust('/internal/auth/signup', input)
    ctx.resHeaders.append('set-cookie', serializeSessionCookie(session.token, session.expiresAt))

    return { success: true, redirectTo: sessionLandingPath(session.user.role), user: session.user }
  }),

  login: publicProcedure.input(LoginSchema).mutation(async ({ input, ctx }) => {
    const session = await authenticateWithRust('/internal/auth/login', input)
    ctx.resHeaders.append('set-cookie', serializeSessionCookie(session.token, session.expiresAt))

    return { success: true, redirectTo: sessionLandingPath(session.user.role), user: session.user }
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.accounts.findFirst({
      where: eq(accounts.id, ctx.user.id),
      columns: { id: true, email: true, username: true, role: true },
    })
    return user
  }),

  updateDisplayName: protectedProcedure
    .input(z.object({ username: z.string().min(1).max(50) }))
    .mutation(async ({ input, ctx }) => {
      const conflict = await ctx.db.query.accounts.findFirst({
        where: eq(accounts.username, input.username),
        columns: { id: true },
      })
      if (conflict && conflict.id !== ctx.user.id) {
        throw new TRPCError({ code: 'CONFLICT', message: 'username is already taken' })
      }

      await ctx.db
        .update(accounts)
        .set({ username: input.username, updatedAt: new Date() })
        .where(eq(accounts.id, ctx.user.id))

      return { success: true }
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    ctx.resHeaders.append('set-cookie', serializeClearedSessionCookie())
    return { success: true }
  }),
})

async function authenticateWithRust(path: string, payload: unknown) {
  const { data, status } = await callRustEndpoint(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  if (data === null) {
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'backend is restarting, try again in a moment',
    })
  }

  if (status >= 400) {
    throw new TRPCError({
      code: status === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
      message: extractRustErrorMessage(data) ?? 'authentication request failed',
    })
  }

  const parsed = AuthSessionSchema.safeParse(data)
  if (!parsed.success) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'rust access manager returned an invalid response',
    })
  }

  return parsed.data
}
