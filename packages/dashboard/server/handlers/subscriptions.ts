import type { Database } from '@scemas/db'
import type { UpdateAlertSubscription } from '@scemas/types'
import { alertSubscriptions } from '@scemas/db/schema'
import { eq } from 'drizzle-orm'
import { normalizeZoneIds } from '@/lib/zones'

export async function getSubscription(db: Database, userId: string) {
  const subscription = await db.query.alertSubscriptions.findFirst({
    where: eq(alertSubscriptions.userId, userId),
  })

  return subscription
    ? { ...subscription, zones: normalizeZoneIds(subscription.zones ?? []) }
    : null
}

export async function upsertSubscription(
  db: Database,
  userId: string,
  input: UpdateAlertSubscription,
): Promise<{ success: boolean }> {
  const normalizedZones = input.zones ? normalizeZoneIds(input.zones) : undefined
  const existing = await db.query.alertSubscriptions.findFirst({
    where: eq(alertSubscriptions.userId, userId),
  })

  if (existing) {
    await db
      .update(alertSubscriptions)
      .set({
        metricTypes: input.metricTypes,
        zones: normalizedZones,
        minSeverity: input.minSeverity,
        webhookUrl: input.webhookUrl,
        updatedAt: new Date(),
      })
      .where(eq(alertSubscriptions.userId, userId))
  } else {
    await db
      .insert(alertSubscriptions)
      .values({
        userId,
        metricTypes: input.metricTypes ?? [],
        zones: normalizedZones ?? [],
        minSeverity: input.minSeverity ?? 1,
        webhookUrl: input.webhookUrl ?? null,
      })
  }

  return { success: true }
}
