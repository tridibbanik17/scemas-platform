const LLMS_TXT = `# SCEMAS - Smart City Environmental Monitoring and Alerting System

> Hamilton, Ontario environmental monitoring platform

## API

Base URL: /api/v1
OpenAPI spec: /api/v1/openapi

Authentication: Bearer token (sk-scemas-...) in Authorization header.
Tokens carry scopes: read, write:operator, write:admin.
Generate tokens from the SCEMAS dashboard or CLI.

## Key endpoints

### Public (no auth)
- GET /api/v1/zones/aqi — aggregated AQI per zone
- GET /api/v1/zones/list — list monitoring regions

### Read (read scope)
- GET /api/v1/zones/{zoneId}/current — current zone snapshot
- GET /api/v1/zones/{zoneId}/history — time-series history
- GET /api/v1/rankings — zone rankings by metric
- GET /api/v1/metrics — metric catalog
- GET /api/v1/status — feed health
- GET /api/v1/alerts — list alerts
- GET /api/v1/rules — list threshold rules
- GET /api/v1/subscriptions — get alert subscription

### Write (write:operator scope)
- POST /api/v1/alerts/{alertId}/acknowledge — acknowledge alert
- POST /api/v1/alerts/{alertId}/resolve — resolve alert
- PUT /api/v1/subscriptions — update alert subscription

## Zones

Hamilton is divided into monitoring regions: downtown_core, westdale_ainslie_wood,
dundas_valley, east_hamilton_industrial, hamilton_harbour, stoney_creek_lakeshore,
hamilton_mountain_upper, ancaster_meadowlands, waterdown_north, flamborough_rural.

## Metrics

- temperature (celsius)
- humidity (percentage)
- air_quality (AQI index)
- noise_level (decibels)
`

export async function GET(): Promise<Response> {
  return new Response(LLMS_TXT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
