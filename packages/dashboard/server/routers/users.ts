// ManageSecurityPermissions + ModifyAccountDetails boundaries (admin-only)

import { accounts, auditLogs } from '@scemas/db/schema'
import { CreateAccountSchema, RoleSchema, UpdateAccountDetailsSchema } from '@scemas/types'
import { TRPCError } from '@trpc/server'
import { hash } from 'argon2'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import { callRustEndpoint, extractRustErrorMessage } from '../rust-client'
import { router, adminProcedure } from '../trpc'

export const usersRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.query.accounts.findMany({
      columns: { id: true, email: true, username: true, role: true, createdAt: true },
      orderBy: [desc(accounts.createdAt)],
    })
  }),

  get: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const account = await ctx.db.query.accounts.findFirst({
        where: eq(accounts.id, input.userId),
        columns: { id: true, email: true, username: true, role: true, createdAt: true },
      })

      if (!account) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'account not found' })
      }

      return account
    }),

  create: adminProcedure.input(CreateAccountSchema).mutation(async ({ input, ctx }) => {
    const { data, status } = await callRustEndpoint('/internal/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        username: input.username,
        password: input.password,
      }),
    })

    if (status >= 400) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: extractRustErrorMessage(data) ?? 'failed to create account',
      })
    }

    // rust signup creates accounts with 'operator' role by default.
    // if admin selected a different role, update it.
    if (input.role !== 'operator') {
      const created = await ctx.db.query.accounts.findFirst({
        where: eq(accounts.email, input.email),
        columns: { id: true },
      })

      if (created) {
        await ctx.db
          .update(accounts)
          .set({ role: input.role, updatedAt: new Date() })
          .where(eq(accounts.id, created.id))
      }
    }

    await ctx.db
      .insert(auditLogs)
      .values({
        userId: ctx.user.id,
        action: 'user.created',
        details: { email: input.email, username: input.username, role: input.role },
      })

    return { success: true }
  }),

  updateRole: adminProcedure
    .input(z.object({ userId: z.string().uuid(), role: RoleSchema }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db
        .update(accounts)
        .set({ role: input.role, updatedAt: new Date() })
        .where(eq(accounts.id, input.userId))

      await ctx.db
        .insert(auditLogs)
        .values({ userId: ctx.user.id, action: 'user.role_updated', details: input })

      return { success: true }
    }),

  updateDetails: adminProcedure
    .input(UpdateAccountDetailsSchema)
    .mutation(async ({ input, ctx }) => {
      // check for email/username conflicts
      const emailConflict = await ctx.db.query.accounts.findFirst({
        where: eq(accounts.email, input.email),
        columns: { id: true },
      })
      if (emailConflict && emailConflict.id !== input.userId) {
        throw new TRPCError({ code: 'CONFLICT', message: 'email is already taken' })
      }

      const usernameConflict = await ctx.db.query.accounts.findFirst({
        where: eq(accounts.username, input.username),
        columns: { id: true },
      })
      if (usernameConflict && usernameConflict.id !== input.userId) {
        throw new TRPCError({ code: 'CONFLICT', message: 'username is already taken' })
      }

      await ctx.db
        .update(accounts)
        .set({ email: input.email, username: input.username, updatedAt: new Date() })
        .where(eq(accounts.id, input.userId))

      await ctx.db
        .insert(auditLogs)
        .values({
          userId: ctx.user.id,
          action: 'user.details_updated',
          details: { targetUserId: input.userId, email: input.email, username: input.username },
        })

      return { success: true }
    }),

  resetPassword: adminProcedure
    .input(z.object({ userId: z.string().uuid(), newPassword: z.string().min(8) }))
    .mutation(async ({ input, ctx }) => {
      const passwordHash = await hash(input.newPassword)

      await ctx.db
        .update(accounts)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(accounts.id, input.userId))

      await ctx.db
        .insert(auditLogs)
        .values({
          userId: ctx.user.id,
          action: 'user.password_reset',
          details: { targetUserId: input.userId },
        })

      return { success: true }
    }),

  delete: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'cannot delete your own account' })
      }

      const target = await ctx.db.query.accounts.findFirst({
        where: eq(accounts.id, input.userId),
        columns: { id: true, email: true, username: true },
      })

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'account not found' })
      }

      await ctx.db.delete(accounts).where(eq(accounts.id, input.userId))

      await ctx.db
        .insert(auditLogs)
        .values({
          userId: ctx.user.id,
          action: 'user.deleted',
          details: { deletedUserId: target.id, email: target.email, username: target.username },
        })

      return { success: true }
    }),
})
