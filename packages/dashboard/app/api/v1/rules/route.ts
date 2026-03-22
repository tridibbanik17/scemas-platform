import { thresholdRules } from '@scemas/db/schema'
import { ThresholdRuleSchema } from '@scemas/types'
import { desc } from 'drizzle-orm'
import { normalizeZoneId } from '@/lib/zones'
import { getDb } from '@/server/cached'
import { withScopedAuth, createPublicApiResponse } from '@/server/public-api'

export async function GET(request: Request): Promise<Response> {
  return withScopedAuth(request, 'read', async () => {
    const db = getDb()
    const rules = await db.query.thresholdRules.findMany({
      orderBy: [desc(thresholdRules.createdAt)],
    })

    return createPublicApiResponse(
      rules.map(rule =>
        ThresholdRuleSchema.parse({ ...rule, zone: rule.zone ? normalizeZoneId(rule.zone) : null }),
      ),
      'live',
    )
  })
}
