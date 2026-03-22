#!/usr/bin/env bun

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ZoneAQISchema,
  PublicZoneSummarySchema,
  PublicZoneHistoryPointSchema,
  AlertSchema,
  PublicFeedStatusSchema,
  MetricTypeSchema,
} from '@scemas/types'
import { z } from 'zod'

const BASE_URL = process.env.SCEMAS_API_URL ?? 'http://localhost:3000'
const API_TOKEN = process.env.SCEMAS_API_TOKEN ?? ''

async function apiGet(path: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (API_TOKEN) {
    headers.Authorization = `Bearer ${API_TOKEN}`
  }

  const response = await fetch(`${BASE_URL}${path}`, { headers })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API ${response.status}: ${text}`)
  }
  return response.json()
}

async function apiPost(path: string): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (API_TOKEN) {
    headers.Authorization = `Bearer ${API_TOKEN}`
  }

  const response = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: '{}' })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API ${response.status}: ${text}`)
  }
  return response.json()
}

const server = new McpServer({ name: 'scemas', version: '0.1.0' })

server.tool(
  'get_zone_aqi',
  'get aggregated AQI for all hamilton monitoring zones',
  {},
  async () => {
    const data = await apiGet('/api/v1/zones/aqi')
    const zones = z.array(ZoneAQISchema).parse(data)
    return { content: [{ type: 'text', text: JSON.stringify(zones, null, 2) }] }
  },
)

server.tool(
  'get_zone_current',
  'get current environmental snapshot for a specific monitoring zone',
  { zoneId: z.string().describe('zone id (e.g. downtown_core, westdale_ainslie_wood)') },
  async ({ zoneId }) => {
    const data = await apiGet(`/api/v1/zones/${zoneId}/current`)
    const zone = PublicZoneSummarySchema.parse(data)
    return { content: [{ type: 'text', text: JSON.stringify(zone, null, 2) }] }
  },
)

server.tool(
  'get_zone_history',
  'get time-series history for a metric in a monitoring zone',
  {
    zoneId: z.string().describe('zone id'),
    metricType: MetricTypeSchema.describe(
      'metric: temperature, humidity, air_quality, noise_level',
    ),
    windowHours: z.number().min(1).max(720).default(24).describe('lookback window in hours'),
  },
  async ({ zoneId, metricType, windowHours }) => {
    const data = await apiGet(
      `/api/v1/zones/${zoneId}/history?metricType=${metricType}&windowHours=${windowHours}`,
    )
    const points = z.array(PublicZoneHistoryPointSchema).parse(data)
    return { content: [{ type: 'text', text: JSON.stringify(points, null, 2) }] }
  },
)

server.tool(
  'list_alerts',
  'list environmental alerts, optionally filtered by status',
  {
    status: z
      .enum(['triggered', 'active', 'acknowledged', 'resolved'])
      .optional()
      .describe('filter by alert status'),
    limit: z.number().min(1).max(200).default(50).optional().describe('max results'),
  },
  async ({ status, limit }) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (limit) params.set('limit', String(limit))
    const query = params.toString()
    const data = await apiGet(`/api/v1/alerts${query ? `?${query}` : ''}`)
    const alerts = z.array(AlertSchema).parse(data)
    return { content: [{ type: 'text', text: JSON.stringify(alerts, null, 2) }] }
  },
)

server.tool(
  'acknowledge_alert',
  'acknowledge an environmental alert (requires write:operator scope)',
  { alertId: z.string().uuid().describe('alert UUID to acknowledge') },
  async ({ alertId }) => {
    const data = await apiPost(`/api/v1/alerts/${alertId}/acknowledge`)
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  },
)

server.tool(
  'get_feed_status',
  'get feed health status: how many zones are reporting and data freshness',
  {},
  async () => {
    const data = await apiGet('/api/v1/status')
    const status = PublicFeedStatusSchema.parse(data)
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
