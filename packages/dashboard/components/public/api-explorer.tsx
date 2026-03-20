'use client'

import { useCallback, useState } from 'react'
import { CopyButton } from '@/components/copy-button'

type EndpointParam = {
  name: string
  in: 'path' | 'query'
  type: string
  required: boolean
  default?: string
  description: string
}

type SchemaField = { name: string; type: string; description: string }

type EndpointDef = {
  method: 'GET'
  path: string
  description: string
  cache: string
  params: EndpointParam[]
  responseFields: SchemaField[]
}

const ENDPOINTS: EndpointDef[] = [
  {
    method: 'GET',
    path: '/api/v1/zones/summary',
    description: 'full snapshot per monitoring region, including noise level and data freshness.',
    cache: 'public, max-age=30, stale-while-revalidate=30',
    params: [],
    responseFields: [
      { name: 'zone', type: 'string', description: 'monitoring region id' },
      { name: 'zoneName', type: 'string', description: 'human readable region name' },
      { name: 'aqi', type: 'number', description: 'computed AQI value' },
      { name: 'aqiLabel', type: 'string', description: '"good", "moderate", "unhealthy", ...' },
      { name: 'temperature', type: 'number | null', description: 'celsius (5m avg)' },
      { name: 'humidity', type: 'number | null', description: 'percentage (5m avg)' },
      { name: 'noiseLevel', type: 'number | null', description: 'decibels (5m avg)' },
      {
        name: 'lastUpdated',
        type: 'string | null',
        description: 'ISO 8601 timestamp of latest aggregate',
      },
      {
        name: 'freshnessSeconds',
        type: 'number | null',
        description: 'seconds since last aggregate',
      },
    ],
  },
  {
    method: 'GET',
    path: '/api/v1/zones/aqi',
    description: 'slim AQI-only view per monitoring region. lighter payload for embedded displays.',
    cache: 'public, max-age=30, stale-while-revalidate=30',
    params: [],
    responseFields: [
      { name: 'zone', type: 'string', description: 'monitoring region id' },
      { name: 'aqi', type: 'number', description: 'computed AQI value' },
      { name: 'label', type: 'string', description: '"good", "moderate", "unhealthy", ...' },
      { name: 'temperature', type: 'number?', description: 'celsius (5m avg)' },
      { name: 'humidity', type: 'number?', description: 'percentage (5m avg)' },
    ],
  },
  {
    method: 'GET',
    path: '/api/v1/zones/{zoneId}/current',
    description: 'current snapshot for a single monitoring region.',
    cache: 'public, max-age=30, stale-while-revalidate=30',
    params: [
      {
        name: 'zoneId',
        in: 'path',
        type: 'string',
        required: true,
        description: 'monitoring region id (e.g. "downtown_core")',
      },
    ],
    responseFields: [
      { name: 'zone', type: 'string', description: 'monitoring region id' },
      { name: 'zoneName', type: 'string', description: 'human readable region name' },
      { name: 'aqi', type: 'number', description: 'computed AQI value' },
      { name: 'aqiLabel', type: 'string', description: 'AQI category label' },
      { name: 'temperature', type: 'number | null', description: 'celsius (5m avg)' },
      { name: 'humidity', type: 'number | null', description: 'percentage (5m avg)' },
      { name: 'noiseLevel', type: 'number | null', description: 'decibels (5m avg)' },
      { name: 'lastUpdated', type: 'string | null', description: 'ISO 8601 timestamp' },
      {
        name: 'freshnessSeconds',
        type: 'number | null',
        description: 'seconds since last aggregate',
      },
    ],
  },
  {
    method: 'GET',
    path: '/api/v1/zones/{zoneId}/history',
    description: 'time-series history for a single metric in a monitoring region.',
    cache: 'public, max-age=60, stale-while-revalidate=300',
    params: [
      {
        name: 'zoneId',
        in: 'path',
        type: 'string',
        required: true,
        description: 'monitoring region id',
      },
      {
        name: 'metricType',
        in: 'query',
        type: 'string',
        required: true,
        description: '"temperature" | "humidity" | "air_quality" | "noise_level"',
      },
      {
        name: 'bucket',
        in: 'query',
        type: 'string',
        required: false,
        default: '5m_avg',
        description: 'aggregation bucket',
      },
      {
        name: 'windowHours',
        in: 'query',
        type: 'number',
        required: false,
        default: '24',
        description: 'lookback window (1-168)',
      },
    ],
    responseFields: [
      { name: 'zone', type: 'string', description: 'monitoring region id' },
      { name: 'zoneName', type: 'string', description: 'human readable region name' },
      { name: 'metricType', type: 'string', description: 'metric type' },
      { name: 'aggregationType', type: 'string', description: 'bucket type' },
      { name: 'time', type: 'string', description: 'ISO 8601 timestamp' },
      { name: 'value', type: 'number', description: 'aggregated metric value' },
      { name: 'sampleCount', type: 'number | null', description: 'readings in this bucket' },
    ],
  },
  {
    method: 'GET',
    path: '/api/v1/rankings',
    description: 'ranked zones by a chosen metric and statistic.',
    cache: 'public, max-age=60, stale-while-revalidate=300',
    params: [
      {
        name: 'metricType',
        in: 'query',
        type: 'string',
        required: true,
        description: '"temperature" | "humidity" | "air_quality" | "noise_level"',
      },
      {
        name: 'stat',
        in: 'query',
        type: 'string',
        required: false,
        default: 'current',
        description: '"current" | "avg" | "max"',
      },
      {
        name: 'bucket',
        in: 'query',
        type: 'string',
        required: false,
        default: '5m_avg',
        description: 'aggregation bucket',
      },
      {
        name: 'periodHours',
        in: 'query',
        type: 'number',
        required: false,
        default: '24',
        description: 'lookback window (1-168)',
      },
      {
        name: 'limit',
        in: 'query',
        type: 'number',
        required: false,
        default: '10',
        description: 'max results (1-50)',
      },
    ],
    responseFields: [
      { name: 'zone', type: 'string', description: 'monitoring region id' },
      { name: 'zoneName', type: 'string', description: 'human readable region name' },
      { name: 'metricType', type: 'string', description: 'metric type' },
      { name: 'stat', type: 'string', description: 'statistic type' },
      { name: 'value', type: 'number', description: 'computed value' },
      { name: 'aggregationType', type: 'string', description: 'bucket type' },
      { name: 'windowHours', type: 'number', description: 'lookback window used' },
      { name: 'lastUpdated', type: 'string | null', description: 'ISO 8601 timestamp' },
    ],
  },
  {
    method: 'GET',
    path: '/api/v1/metrics',
    description: 'catalog of available metric types, units, and update cadence.',
    cache: 'public, max-age=3600, stale-while-revalidate=86400',
    params: [],
    responseFields: [
      { name: 'metricType', type: 'string', description: 'metric identifier' },
      { name: 'label', type: 'string', description: 'human readable label' },
      { name: 'unit', type: 'string', description: 'measurement unit (c, %, ug/m3, db)' },
      { name: 'description', type: 'string', description: 'what this metric measures' },
      { name: 'supportedAggregations', type: 'string[]', description: 'available bucket types' },
      { name: 'updateCadenceSeconds', type: 'number', description: 'expected update interval' },
    ],
  },
  {
    method: 'GET',
    path: '/api/v1/status',
    description: 'feed health: how many zones are reporting and data freshness.',
    cache: 'public, max-age=30, stale-while-revalidate=30',
    params: [],
    responseFields: [
      { name: 'generatedAt', type: 'string', description: 'ISO 8601 generation timestamp' },
      { name: 'aggregationType', type: 'string', description: 'bucket type in use' },
      { name: 'zonesTotal', type: 'number', description: 'total registered zones' },
      { name: 'zonesReporting', type: 'number', description: 'zones with recent data' },
      {
        name: 'zonesAwaitingTelemetry',
        type: 'string[]',
        description: 'zone ids without data yet',
      },
      {
        name: 'latestAggregateAt',
        type: 'string | null',
        description: 'newest aggregate timestamp',
      },
      {
        name: 'oldestAggregateAt',
        type: 'string | null',
        description: 'oldest aggregate timestamp',
      },
    ],
  },
]

type ResponseState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; code: number; bytes: number; body: string }
  | { status: 'error'; code: number; body: string }

export function ApiExplorer() {
  return (
    <div className="space-y-6">
      {ENDPOINTS.map(endpoint => (
        <EndpointSection endpoint={endpoint} key={endpoint.path} />
      ))}
    </div>
  )
}

function EndpointSection({ endpoint }: { endpoint: EndpointDef }) {
  const [response, setResponse] = useState<ResponseState>({ status: 'idle' })
  const [paramValues, setParamValues] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {}
    for (const param of endpoint.params) {
      defaults[param.name] = param.default ?? ''
    }
    return defaults
  })

  const resolvedPath = endpoint.path.replace(/\{(\w+)\}/g, (_, name: string) => {
    return encodeURIComponent(paramValues[name] ?? '')
  })

  const queryParams = endpoint.params
    .filter(p => p.in === 'query' && paramValues[p.name])
    .map(p => `${p.name}=${encodeURIComponent(paramValues[p.name])}`)
    .join('&')

  const fullUrl = queryParams ? `${resolvedPath}?${queryParams}` : resolvedPath

  const sendRequest = useCallback(async () => {
    setResponse({ status: 'loading' })
    try {
      const res = await fetch(fullUrl)
      const text = await res.text()
      const bytes = new Blob([text]).size

      let formatted: string
      try {
        formatted = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        formatted = text
      }

      if (res.ok) {
        setResponse({ status: 'success', code: res.status, bytes, body: formatted })
      } else {
        setResponse({ status: 'error', code: res.status, body: formatted })
      }
    } catch (err) {
      setResponse({
        status: 'error',
        code: 0,
        body: err instanceof Error ? err.message : 'network error',
      })
    }
  }, [fullUrl])

  const canSend =
    response.status !== 'loading' &&
    endpoint.params.filter(p => p.required).every(p => paramValues[p.name]?.trim())

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-sm">
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {endpoint.method}
          </span>
          <span className="break-all">{endpoint.path}</span>
        </div>
        <button
          className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-50"
          disabled={!canSend}
          onClick={sendRequest}
          type="button"
        >
          {response.status === 'loading' ? 'sending...' : 'try it'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">{endpoint.description}</p>
      <p className="text-[11px] text-muted-foreground/50">
        cache: <code className="text-[0.65rem]">{endpoint.cache}</code>
      </p>

      {/* params */}
      {endpoint.params.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">parameters</h4>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {endpoint.params.map(param => (
              <div className="grid grid-cols-[auto_1fr] items-center gap-2" key={param.name}>
                <label
                  className="flex items-center gap-1.5 whitespace-nowrap text-xs"
                  htmlFor={`${endpoint.path}-${param.name}`}
                >
                  <code className="font-mono text-[11px]">{param.name}</code>
                  {param.required && <span className="text-red-500/70">*</span>}
                  <span className="text-muted-foreground/50">({param.in})</span>
                </label>
                <input
                  className="h-7 w-full rounded border border-border bg-muted/30 px-2 font-mono text-xs outline-none focus:border-foreground/30"
                  id={`${endpoint.path}-${param.name}`}
                  onChange={e =>
                    setParamValues(prev => ({ ...prev, [param.name]: e.target.value }))
                  }
                  placeholder={param.default ?? param.description}
                  type="text"
                  value={paramValues[param.name]}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* schema */}
      <div className="overflow-hidden rounded-md border border-border">
        <div className="border-b border-border bg-muted/30 px-3 py-1.5">
          <h4 className="text-[11px] font-medium text-muted-foreground">response schema</h4>
        </div>
        <div className="divide-y divide-border">
          {endpoint.responseFields.map(field => (
            <div
              className="grid grid-cols-[1fr_0.7fr_2fr] gap-2 px-3 py-1.5 text-xs"
              key={field.name}
            >
              <span className="font-mono text-[11px]">{field.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{field.type}</span>
              <span className="text-[11px] text-muted-foreground">{field.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* response */}
      {response.status !== 'idle' && (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
            <h4 className="text-[11px] font-medium text-muted-foreground">response</h4>
            {response.status === 'loading' ? (
              <span className="text-[11px] text-muted-foreground">loading...</span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                <span
                  className={
                    response.status === 'success'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }
                >
                  {response.code}
                </span>
                {response.status === 'success' && (
                  <>
                    {' '}
                    &middot;{' '}
                    {response.bytes >= 1024
                      ? `${(response.bytes / 1024).toFixed(1)}kb`
                      : `${response.bytes}b`}
                  </>
                )}
              </span>
            )}
          </div>
          {response.status !== 'loading' && (
            <div className="relative">
              <div className="absolute right-2 top-2">
                <CopyButton value={response.body} />
              </div>
              <pre className="max-h-72 overflow-auto p-3 pr-14 font-mono text-xs leading-relaxed">
                {response.body}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
