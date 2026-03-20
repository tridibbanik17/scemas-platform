// DefineThresholdRules boundary (AlertingManager, admin-only)

import { thresholdRules } from '@scemas/db/schema'
import { CreateThresholdRuleSchema, ThresholdRuleSchema, type ThresholdRule } from '@scemas/types'
import { TRPCError } from '@trpc/server'
import { desc } from 'drizzle-orm'
import { z } from 'zod'
import { callRustEndpoint, extractRustErrorMessage } from '../rust-client'
import { router, adminProcedure } from '../trpc'

const SuccessResponseSchema = z.object({ success: z.literal(true) })

const LegacyRustThresholdRuleSchema = z
  .object({
    id: z.string().uuid(),
    metric_type: z.enum(['temperature', 'humidity', 'air_quality', 'noise_level']),
    threshold_value: z.number(),
    comparison: z.enum(['gt', 'lt', 'gte', 'lte']),
    zone: z.string().nullable(),
    rule_status: z.enum(['active', 'inactive']),
  })
  .transform(rule => ({
    id: rule.id,
    metricType: rule.metric_type,
    thresholdValue: rule.threshold_value,
    comparison: rule.comparison,
    zone: rule.zone,
    ruleStatus: rule.rule_status,
  }))

const RustThresholdRuleSchema = z.union([ThresholdRuleSchema, LegacyRustThresholdRuleSchema])

function normalizeThresholdRule(rule: {
  id: string
  metricType: string
  thresholdValue: number
  comparison: string
  zone: string | null
  ruleStatus: string
}): ThresholdRule {
  return ThresholdRuleSchema.parse(rule)
}

export const rulesRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const rules = await ctx.db.query.thresholdRules.findMany({
      orderBy: [desc(thresholdRules.createdAt)],
    })

    return rules.map(rule => normalizeThresholdRule(rule))
  }),

  create: adminProcedure.input(CreateThresholdRuleSchema).mutation(async ({ input, ctx }) => {
    const { data, status } = await callRustEndpoint('/internal/alerting/rules', {
      method: 'POST',
      body: JSON.stringify({ ...input, createdBy: ctx.user.id }),
    })

    if (status >= 400) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: extractRustErrorMessage(data) ?? 'rule creation failed',
      })
    }

    const parsed = RustThresholdRuleSchema.safeParse(data)
    if (!parsed.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'rust alerting manager returned an invalid rule payload',
      })
    }

    return parsed.data
  }),

  update: adminProcedure
    .input(z.object({ id: z.string().uuid(), ruleStatus: z.enum(['active', 'inactive']) }))
    .mutation(async ({ input, ctx }) => {
      const { data, status } = await callRustEndpoint(
        `/internal/alerting/rules/${input.id}/status`,
        {
          method: 'POST',
          body: JSON.stringify({ ruleStatus: input.ruleStatus, updatedBy: ctx.user.id }),
        },
      )

      if (status >= 400) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: extractRustErrorMessage(data) ?? 'rule update failed',
        })
      }

      const parsed = SuccessResponseSchema.safeParse(data)
      if (!parsed.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'rust alerting manager returned an invalid update response',
        })
      }

      return parsed.data
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { data, status } = await callRustEndpoint(
        `/internal/alerting/rules/${input.id}/delete`,
        { method: 'POST', body: JSON.stringify({ deletedBy: ctx.user.id }) },
      )

      if (status >= 400) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: extractRustErrorMessage(data) ?? 'rule deletion failed',
        })
      }

      const parsed = SuccessResponseSchema.safeParse(data)
      if (!parsed.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'rust alerting manager returned an invalid delete response',
        })
      }

      return parsed.data
    }),
})
