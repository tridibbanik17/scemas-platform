import { z } from 'zod'
import { callRustEndpoint, extractRustErrorMessage } from '../rust-client'

const SuccessResponseSchema = z.object({ success: z.literal(true) })

export type AlertActionResult = { success: true } | { success: false; error: string }

export async function acknowledgeAlert(
  alertId: string,
  userId: string,
): Promise<AlertActionResult> {
  const { data, status } = await callRustEndpoint(
    `/internal/alerting/alerts/${alertId}/acknowledge`,
    { method: 'POST', body: JSON.stringify({ userId }) },
  )

  if (status >= 400) {
    return {
      success: false,
      error: extractRustErrorMessage(data) ?? 'alert acknowledgement failed',
    }
  }

  const parsed = SuccessResponseSchema.safeParse(data)
  if (!parsed.success) {
    return {
      success: false,
      error: 'rust alerting manager returned an invalid acknowledge response',
    }
  }

  return { success: true }
}

export async function resolveAlert(alertId: string, userId: string): Promise<AlertActionResult> {
  const { data, status } = await callRustEndpoint(`/internal/alerting/alerts/${alertId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })

  if (status >= 400) {
    return { success: false, error: extractRustErrorMessage(data) ?? 'alert resolution failed' }
  }

  const parsed = SuccessResponseSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'rust alerting manager returned an invalid resolve response' }
  }

  return { success: true }
}
