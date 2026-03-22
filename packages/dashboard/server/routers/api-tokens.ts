import { apiTokens, accounts, auditLogs } from '@scemas/db/schema'
import { CreateApiTokenSchema } from '@scemas/types'
import { TRPCError } from '@trpc/server'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { countActiveTokens } from '../api-tokens'
import { callRustEndpoint, extractRustErrorMessage } from '../rust-client'
import { router, protectedProcedure, adminProcedure } from '../trpc'

const MAX_ACTIVE_TOKENS_PER_USER = 5

export const apiTokensRouter = router({
  create: protectedProcedure.input(CreateApiTokenSchema).mutation(async ({ input, ctx }) => {
    const activeCount = await countActiveTokens(ctx.db, ctx.user.id)
    if (activeCount >= MAX_ACTIVE_TOKENS_PER_USER) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `maximum ${MAX_ACTIVE_TOKENS_PER_USER} active tokens per account`,
      })
    }

    const { data, status } = await callRustEndpoint('/internal/tokens', {
      method: 'POST',
      body: JSON.stringify({ accountId: ctx.user.id, label: input.label, scopes: input.scopes }),
    })

    if (status >= 400) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: extractRustErrorMessage(data) ?? 'failed to generate token',
      })
    }

    const result = data as {
      id: string
      token: string
      prefix: string
      label: string
      expiresAt: string
    }

    return {
      id: result.id,
      token: result.token,
      prefix: result.prefix,
      label: result.label,
      expiresAt: result.expiresAt,
    }
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const isAdmin = ctx.user.role === 'admin'

    const rows = await ctx.db
      .select({
        id: apiTokens.id,
        prefix: apiTokens.prefix,
        label: apiTokens.label,
        accountId: apiTokens.accountId,
        accountUsername: accounts.username,
        scopes: apiTokens.scopes,
        expiresAt: apiTokens.expiresAt,
        revokedAt: apiTokens.revokedAt,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .innerJoin(accounts, eq(apiTokens.accountId, accounts.id))
      .where(isAdmin ? undefined : eq(apiTokens.accountId, ctx.user.id))
      .orderBy(desc(apiTokens.createdAt))

    return rows.map(row => ({
      id: row.id,
      prefix: row.prefix,
      label: row.label,
      accountId: row.accountId,
      accountUsername: isAdmin ? row.accountUsername : undefined,
      scopes: row.scopes,
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
  }),

  revoke: protectedProcedure
    .input(z.object({ tokenId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const token = await ctx.db.query.apiTokens.findFirst({
        where: eq(apiTokens.id, input.tokenId),
        columns: { id: true, accountId: true, prefix: true },
      })

      if (!token) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'token not found' })
      }

      if (ctx.user.role !== 'admin' && token.accountId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: "cannot revoke another user's token" })
      }

      await ctx.db.delete(apiTokens).where(eq(apiTokens.id, input.tokenId))

      await ctx.db
        .insert(auditLogs)
        .values({
          userId: ctx.user.id,
          action: 'api_token.revoked',
          details: { tokenId: token.id, prefix: token.prefix, accountId: token.accountId },
        })

      return { success: true }
    }),
})
