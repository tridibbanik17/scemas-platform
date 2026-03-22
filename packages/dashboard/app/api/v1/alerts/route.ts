import { alerts } from '@scemas/db/schema'
import { desc, eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { normalizeZoneId } from '@/lib/zones'
import { getDb } from '@/server/cached'
import {
  withScopedAuth,
  createPublicApiResponse,
  getRequestSearchParams,
  parsePublicApiInput,
} from '@/server/public-api'

const AlertsQuerySchema = z.object({
  status: z.enum(['triggered', 'active', 'acknowledged', 'resolved']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function GET(request: Request): Promise<Response> {
  return withScopedAuth(request, 'read', async () => {
    const params = getRequestSearchParams(request)
    const parsed = parsePublicApiInput(AlertsQuerySchema, params)
    if (!parsed.success) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }

    const db = getDb()
    const conditions = []
    if (parsed.data.status) {
      conditions.push(eq(alerts.status, parsed.data.status))
    }

    const rows = await db.query.alerts.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(alerts.createdAt)],
      limit: parsed.data.limit,
    })

    return createPublicApiResponse(
      rows.map(alert => ({
        id: alert.id,
        ruleId: alert.ruleId,
        sensorId: alert.sensorId,
        severity: alert.severity,
        status: alert.status,
        triggeredValue: alert.triggeredValue,
        zone: normalizeZoneId(alert.zone, alert.sensorId),
        metricType: alert.metricType,
        createdAt: alert.createdAt.toISOString(),
        acknowledgedBy: alert.acknowledgedBy,
        acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
      })),
      'live',
    )
  })
}
