import { createPublicApiResponse } from '@/server/public-api'

const nullable = (schema: Record<string, unknown>) => ({ oneOf: [schema, { type: 'null' }] })

const zoneSummaryProperties = {
  zone: { type: 'string', description: 'monitoring region id' },
  zoneName: { type: 'string', description: 'human readable region name' },
  aqi: { type: 'number', description: 'computed AQI value' },
  aqiLabel: { type: 'string', description: 'AQI category label' },
  temperature: nullable({ type: 'number', description: 'celsius (5m avg)' }),
  humidity: nullable({ type: 'number', description: 'percentage (5m avg)' }),
  noiseLevel: nullable({ type: 'number', description: 'decibels (5m avg)' }),
  lastUpdated: nullable({
    type: 'string',
    format: 'date-time',
    description: 'ISO 8601 timestamp of latest aggregate',
  }),
  freshnessSeconds: nullable({
    type: 'integer',
    minimum: 0,
    description: 'seconds since last aggregate',
  }),
}

const metricTypeEnum = {
  type: 'string',
  enum: ['temperature', 'humidity', 'air_quality', 'noise_level'],
}
const aggregationTypeEnum = { type: 'string', enum: ['5m_avg'] }

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'SCEMAS Public API',
    version: '1.0.0',
    description:
      'read-only endpoints for hamilton environmental monitoring data. authenticate with a bearer token generated from the SCEMAS dashboard.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      apiToken: {
        type: 'http',
        scheme: 'bearer',
        description:
          'API token generated from the SCEMAS dashboard. tokens are prefixed with sk-scemas- and valid for 90 days.',
      },
    },
  },
  security: [{ apiToken: [] }],
  paths: {
    '/api/v1/zones/aqi': {
      get: {
        summary: 'zone AQI',
        description: 'aggregated AQI per monitoring region. no authentication required.',
        security: [],
        responses: {
          '200': {
            description: 'array of zone AQI entries',
            headers: {
              'Cache-Control': {
                schema: { type: 'string' },
                description: 'public, max-age=30, stale-while-revalidate=30',
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      zone: { type: 'string', description: 'monitoring region id' },
                      aqi: { type: 'number', description: 'computed AQI value' },
                      label: { type: 'string', description: 'AQI category label' },
                      temperature: { type: 'number', description: 'celsius (5m avg)' },
                      humidity: { type: 'number', description: 'percentage (5m avg)' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/zones/list': {
      get: {
        summary: 'zone list',
        description: 'list all monitoring regions available through the public API.',
        security: [],
        responses: {
          '200': {
            description: 'array of available zones',
            headers: {
              'Cache-Control': {
                schema: { type: 'string' },
                description: 'public, max-age=3600, stale-while-revalidate=86400',
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      zone: { type: 'string', description: 'monitoring region id' },
                      zoneName: { type: 'string', description: 'human readable region name' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/zones/{zoneId}/current': {
      get: {
        summary: 'single zone current',
        description: 'current snapshot for a single monitoring region.',
        parameters: [
          {
            name: 'zoneId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'monitoring region id',
          },
        ],
        responses: {
          '200': {
            description: 'zone summary',
            content: {
              'application/json': { schema: { type: 'object', properties: zoneSummaryProperties } },
            },
          },
          '404': {
            description: 'unknown zone',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { error: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
    '/api/v1/zones/{zoneId}/history': {
      get: {
        summary: 'zone metric history',
        description: 'time-series history for a single metric in a monitoring region.',
        parameters: [
          {
            name: 'zoneId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'monitoring region id',
          },
          {
            name: 'metricType',
            in: 'query',
            required: true,
            schema: metricTypeEnum,
            description: 'metric to query',
          },
          {
            name: 'bucket',
            in: 'query',
            required: false,
            schema: aggregationTypeEnum,
            description: 'aggregation bucket (default: 5m_avg)',
          },
          {
            name: 'windowHours',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 168, default: 24 },
            description: 'lookback window in hours',
          },
        ],
        responses: {
          '200': {
            description: 'array of time-series points',
            headers: {
              'Cache-Control': {
                schema: { type: 'string' },
                description: 'public, max-age=60, stale-while-revalidate=300',
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      zone: { type: 'string' },
                      zoneName: { type: 'string' },
                      metricType: metricTypeEnum,
                      aggregationType: aggregationTypeEnum,
                      time: { type: 'string', format: 'date-time' },
                      value: { type: 'number' },
                      sampleCount: nullable({ type: 'integer' }),
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/rankings': {
      get: {
        summary: 'zone rankings',
        description: 'ranked zones by a chosen metric and statistic.',
        parameters: [
          {
            name: 'metricType',
            in: 'query',
            required: true,
            schema: metricTypeEnum,
            description: 'metric to rank by',
          },
          {
            name: 'stat',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['current', 'avg', 'max'], default: 'current' },
            description: 'statistic type',
          },
          {
            name: 'bucket',
            in: 'query',
            required: false,
            schema: aggregationTypeEnum,
            description: 'aggregation bucket',
          },
          {
            name: 'periodHours',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 168, default: 24 },
            description: 'lookback window',
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            description: 'max results',
          },
        ],
        responses: {
          '200': {
            description: 'ranked zone list',
            headers: {
              'Cache-Control': {
                schema: { type: 'string' },
                description: 'public, max-age=60, stale-while-revalidate=300',
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      zone: { type: 'string' },
                      zoneName: { type: 'string' },
                      metricType: metricTypeEnum,
                      stat: { type: 'string' },
                      value: { type: 'number' },
                      aggregationType: aggregationTypeEnum,
                      windowHours: { type: 'integer' },
                      lastUpdated: nullable({ type: 'string', format: 'date-time' }),
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/metrics': {
      get: {
        summary: 'metric catalog',
        description: 'catalog of available metric types, units, and update cadence.',
        responses: {
          '200': {
            description: 'array of metric descriptors',
            headers: {
              'Cache-Control': {
                schema: { type: 'string' },
                description: 'public, max-age=3600, stale-while-revalidate=86400',
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      metricType: metricTypeEnum,
                      label: { type: 'string' },
                      unit: { type: 'string' },
                      description: { type: 'string' },
                      supportedAggregations: { type: 'array', items: aggregationTypeEnum },
                      updateCadenceSeconds: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/status': {
      get: {
        summary: 'feed status',
        description: 'feed health: how many zones are reporting and data freshness.',
        responses: {
          '200': {
            description: 'feed status object',
            headers: {
              'Cache-Control': {
                schema: { type: 'string' },
                description: 'public, max-age=30, stale-while-revalidate=30',
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    generatedAt: { type: 'string', format: 'date-time' },
                    aggregationType: aggregationTypeEnum,
                    zonesTotal: { type: 'integer', minimum: 0 },
                    zonesReporting: { type: 'integer', minimum: 0 },
                    zonesAwaitingTelemetry: { type: 'array', items: { type: 'string' } },
                    latestAggregateAt: nullable({ type: 'string', format: 'date-time' }),
                    oldestAggregateAt: nullable({ type: 'string', format: 'date-time' }),
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}

export async function GET(): Promise<Response> {
  return createPublicApiResponse(spec, 'metadata')
}
