import type { OpenAPIObject } from 'openapi3-ts/oas31'
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import {
  ZoneAQISchema,
  PublicZoneSummarySchema,
  PublicZoneListItemSchema,
  PublicZoneHistoryPointSchema,
  PublicZoneHistoryQuerySchema,
  PublicRankingRowSchema,
  PublicRankingsQuerySchema,
  PublicMetricDescriptorSchema,
  PublicFeedStatusSchema,
  AlertSchema,
  ThresholdRuleSchema,
  AlertSubscriptionSchema,
  UpdateAlertSubscriptionSchema,
  MetricTypeSchema,
  PublicAggregationTypeSchema,
  TokenScopeSchema,
} from './index'

const registry = new OpenAPIRegistry()

const apiTokenScheme = registry.registerComponent('securitySchemes', 'apiToken', {
  type: 'http',
  scheme: 'bearer',
  description:
    'API token generated from the SCEMAS dashboard. tokens are prefixed with sk-scemas- and valid for 90 days.',
})

registry.register('TokenScope', TokenScopeSchema)
registry.register('ZoneAQI', ZoneAQISchema)
registry.register('PublicZoneSummary', PublicZoneSummarySchema)
registry.register('PublicZoneListItem', PublicZoneListItemSchema)
registry.register('PublicZoneHistoryPoint', PublicZoneHistoryPointSchema)
registry.register('PublicRankingRow', PublicRankingRowSchema)
registry.register('PublicMetricDescriptor', PublicMetricDescriptorSchema)
registry.register('PublicFeedStatus', PublicFeedStatusSchema)
registry.register('Alert', AlertSchema)
registry.register('ThresholdRule', ThresholdRuleSchema)
registry.register('AlertSubscription', AlertSubscriptionSchema)

// read-only public endpoints (no auth)

registry.registerPath({
  method: 'get',
  path: '/api/v1/zones/aqi',
  summary: 'zone AQI',
  description: 'aggregated AQI per monitoring region. no authentication required.',
  security: [],
  responses: {
    200: {
      description: 'array of zone AQI entries',
      content: { 'application/json': { schema: z.array(ZoneAQISchema) } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/zones/list',
  summary: 'zone list',
  description: 'list all monitoring regions available through the public API.',
  security: [],
  responses: {
    200: {
      description: 'array of available zones',
      content: { 'application/json': { schema: z.array(PublicZoneListItemSchema) } },
    },
  },
})

// read endpoints (token auth, read scope)

registry.registerPath({
  method: 'get',
  path: '/api/v1/zones/{zoneId}/current',
  summary: 'single zone current',
  description: 'current snapshot for a single monitoring region.',
  security: [{ [apiTokenScheme.name]: [] }],
  request: {
    params: z.object({ zoneId: z.string().openapi({ description: 'monitoring region id' }) }),
  },
  responses: {
    200: {
      description: 'zone summary',
      content: { 'application/json': { schema: PublicZoneSummarySchema } },
    },
    404: {
      description: 'unknown zone',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/zones/{zoneId}/history',
  summary: 'zone metric history',
  description: 'time-series history for a single metric in a monitoring region.',
  security: [{ [apiTokenScheme.name]: [] }],
  request: {
    params: z.object({ zoneId: z.string().openapi({ description: 'monitoring region id' }) }),
    query: PublicZoneHistoryQuerySchema.omit({ zoneId: true }),
  },
  responses: {
    200: {
      description: 'array of time-series points',
      content: { 'application/json': { schema: z.array(PublicZoneHistoryPointSchema) } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/rankings',
  summary: 'zone rankings',
  description: 'ranked zones by a chosen metric and statistic.',
  security: [{ [apiTokenScheme.name]: [] }],
  request: { query: PublicRankingsQuerySchema },
  responses: {
    200: {
      description: 'ranked zone list',
      content: { 'application/json': { schema: z.array(PublicRankingRowSchema) } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/metrics',
  summary: 'metric catalog',
  description: 'catalog of available metric types, units, and update cadence.',
  security: [{ [apiTokenScheme.name]: [] }],
  responses: {
    200: {
      description: 'array of metric descriptors',
      content: { 'application/json': { schema: z.array(PublicMetricDescriptorSchema) } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/status',
  summary: 'feed status',
  description: 'feed health: how many zones are reporting and data freshness.',
  security: [{ [apiTokenScheme.name]: [] }],
  responses: {
    200: {
      description: 'feed status object',
      content: { 'application/json': { schema: PublicFeedStatusSchema } },
    },
  },
})

// agent write endpoints

registry.registerPath({
  method: 'get',
  path: '/api/v1/alerts',
  summary: 'list alerts',
  description: 'list alerts, optionally filtered by status. requires read scope.',
  security: [{ [apiTokenScheme.name]: [] }],
  request: {
    query: z.object({
      status: z.enum(['triggered', 'active', 'acknowledged', 'resolved']).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
    }),
  },
  responses: {
    200: {
      description: 'array of alerts',
      content: { 'application/json': { schema: z.array(AlertSchema) } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/alerts/{alertId}/acknowledge',
  summary: 'acknowledge alert',
  description: 'transition alert to acknowledged state. requires write:operator scope.',
  security: [{ [apiTokenScheme.name]: [] }],
  request: {
    params: z.object({ alertId: z.string().uuid().openapi({ description: 'alert id' }) }),
  },
  responses: {
    200: {
      description: 'acknowledgement result',
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
    },
    403: {
      description: 'insufficient scope',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/alerts/{alertId}/resolve',
  summary: 'resolve alert',
  description: 'transition alert to resolved state. requires write:operator scope.',
  security: [{ [apiTokenScheme.name]: [] }],
  request: {
    params: z.object({ alertId: z.string().uuid().openapi({ description: 'alert id' }) }),
  },
  responses: {
    200: {
      description: 'resolution result',
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
    },
    403: {
      description: 'insufficient scope',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/subscriptions',
  summary: 'get alert subscription',
  description: "get the token owner's alert subscription preferences. requires read scope.",
  security: [{ [apiTokenScheme.name]: [] }],
  responses: {
    200: {
      description: 'subscription preferences or null',
      content: { 'application/json': { schema: AlertSubscriptionSchema.nullable() } },
    },
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/v1/subscriptions',
  summary: 'update alert subscription',
  description:
    "upsert the token owner's alert subscription preferences. requires write:operator scope.",
  security: [{ [apiTokenScheme.name]: [] }],
  request: { body: { content: { 'application/json': { schema: UpdateAlertSubscriptionSchema } } } },
  responses: {
    200: {
      description: 'upsert result',
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
    },
    403: {
      description: 'insufficient scope',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/rules',
  summary: 'list threshold rules',
  description: 'list all threshold rules. requires read scope.',
  security: [{ [apiTokenScheme.name]: [] }],
  responses: {
    200: {
      description: 'array of threshold rules',
      content: { 'application/json': { schema: z.array(ThresholdRuleSchema) } },
    },
  },
})

export function buildOpenApiSpec(): OpenAPIObject {
  const generator = new OpenApiGeneratorV31(registry.definitions)
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'SCEMAS Public API',
      version: '1.0.0',
      description:
        'endpoints for hamilton environmental monitoring data. authenticate with a bearer token (sk-scemas-...) generated from the SCEMAS dashboard. tokens carry scopes: read, write:operator, write:admin (each higher scope includes all lower ones).',
    },
    servers: [{ url: '/' }],
  })
}
