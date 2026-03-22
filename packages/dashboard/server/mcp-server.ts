import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { alerts } from '@scemas/db/schema'
import {
  ZoneAQISchema,
  PublicZoneSummarySchema,
  PublicZoneHistoryPointSchema,
  PublicZoneHistoryQuerySchema,
  PublicFeedStatusSchema,
  MetricTypeSchema,
} from '@scemas/types'
import { desc, eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { normalizeZoneId } from '@/lib/zones'
import { getDb, getManager } from './cached'
import { acknowledgeAlert } from './handlers/alerts'
import { hasScope } from './api-tokens'

export type McpUserContext = { accountId: string; scopes: string[] }

// zod v4 schemas are runtime-compatible with the MCP SDK, but TS can't unify
// z4.$ZodType across package boundaries (our zod vs the SDK's bundled copy)
function schema<T extends Record<string, unknown>>(s: T): T & ZodRawShapeCompat {
  return s as T & ZodRawShapeCompat
}

export function createMcpServer(ctx?: McpUserContext) {
  const server = new McpServer({ name: 'scemas', version: '0.1.0' })

  server.registerTool(
    'get_zone_aqi',
    { description: 'get aggregated AQI for all hamilton monitoring zones' },
    async () => {
      const manager = getManager()
      const data = await manager.getPublicZoneAqi()
      const zones = z.array(ZoneAQISchema).parse(data)
      return { content: [{ type: 'text', text: JSON.stringify(zones, null, 2) }] }
    },
  )

  server.registerTool(
    'get_zone_current',
    {
      description: 'get current environmental snapshot for a specific monitoring zone',
      inputSchema: schema({
        zoneId: z.string().describe('zone id (e.g. downtown_core, westdale_ainslie_wood)'),
      }),
    },
    async ({ zoneId }) => {
      const manager = getManager()
      const data = await manager.getPublicZoneCurrent(zoneId)
      if (!data) {
        return { content: [{ type: 'text', text: `zone "${zoneId}" not found` }], isError: true }
      }
      const zone = PublicZoneSummarySchema.parse(data)
      return { content: [{ type: 'text', text: JSON.stringify(zone, null, 2) }] }
    },
  )

  server.registerTool(
    'get_zone_history',
    {
      description: 'get time-series history for a metric in a monitoring zone',
      inputSchema: schema({
        zoneId: z.string().describe('zone id'),
        metricType: MetricTypeSchema.describe(
          'metric: temperature, humidity, air_quality, noise_level',
        ),
        windowHours: z.number().min(1).max(720).default(24).describe('lookback window in hours'),
      }),
    },
    async ({ zoneId, metricType, windowHours }) => {
      const manager = getManager()
      const parsed = PublicZoneHistoryQuerySchema.parse({
        zoneId,
        metricType,
        windowHours,
        bucket: '5m_avg',
      })
      const data = await manager.getPublicZoneHistory(parsed)
      const points = z.array(PublicZoneHistoryPointSchema).parse(data)
      return { content: [{ type: 'text', text: JSON.stringify(points, null, 2) }] }
    },
  )

  server.registerTool(
    'list_alerts',
    {
      description: 'list environmental alerts, optionally filtered by status',
      inputSchema: schema({
        status: z
          .enum(['triggered', 'active', 'acknowledged', 'resolved'])
          .optional()
          .describe('filter by alert status'),
        limit: z.number().min(1).max(200).default(50).optional().describe('max results'),
      }),
    },
    async ({ status, limit }) => {
      const db = getDb()
      const conditions = []
      if (status) conditions.push(eq(alerts.status, status))

      const rows = await db.query.alerts.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: [desc(alerts.createdAt)],
        limit: limit ?? 50,
      })

      const result = rows.map(alert => ({
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
      }))

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'acknowledge_alert',
    {
      description: 'acknowledge an environmental alert. requires write:operator scope.',
      inputSchema: schema({
        alertId: z.uuid().describe('alert UUID to acknowledge'),
      }),
    },
    async ({ alertId }) => {
      if (!ctx) {
        return { content: [{ type: 'text', text: 'authentication required' }], isError: true }
      }
      if (!hasScope(ctx.scopes, 'write:operator')) {
        return { content: [{ type: 'text', text: 'insufficient scope: write:operator required' }], isError: true }
      }
      const result = await acknowledgeAlert(alertId, ctx.accountId)
      if (!result.success) {
        return { content: [{ type: 'text', text: result.error }], isError: true }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'get_feed_status',
    { description: 'get feed health status: how many zones are reporting and data freshness' },
    async () => {
      const manager = getManager()
      const data = await manager.getPublicFeedStatus()
      const status = PublicFeedStatusSchema.parse(data)
      return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] }
    },
  )

  return server
}
