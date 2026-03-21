'use client'

import { Fragment, useCallback, useState } from 'react'
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

type ExampleResponseBase = { 200: string; 400: string; 500: string }

type PublicEndpointDef = {
  method: 'GET'
  path: string
  description: string
  cache: string
  auth: false
  params: EndpointParam[]
  responseFields: SchemaField[]
  examples: ExampleResponseBase
}

type AuthenticatedEndpointDef = {
  method: 'GET'
  path: string
  description: string
  cache: string
  auth: true
  params: EndpointParam[]
  responseFields: SchemaField[]
  examples: ExampleResponseBase & { 401: string }
}

type EndpointDef = PublicEndpointDef | AuthenticatedEndpointDef

const ENDPOINTS: EndpointDef[] = [
  {
    method: 'GET',
    path: '/api/v1/zones/aqi',
    description: 'aggregated AQI per monitoring region. no token required.',
    auth: false,
    cache: 'public, max-age=30, stale-while-revalidate=30',
    params: [],
    responseFields: [
      { name: 'zone', type: 'string', description: 'monitoring region id' },
      { name: 'aqi', type: 'number', description: 'computed AQI value' },
      { name: 'label', type: 'string', description: '"good", "moderate", "unhealthy", ...' },
      { name: 'temperature', type: 'number?', description: 'celsius (5m avg)' },
      { name: 'humidity', type: 'number?', description: 'percentage (5m avg)' },
    ],
    examples: {
      200: '[\n  {\n    "zone": "downtown_core",\n    "aqi": 88,\n    "label": "moderate",\n    "temperature": 22.3,\n    "humidity": 61.0\n  }\n]',
      400: '{\n  "error": "invalid request"\n}',
      500: '{\n  "error": "internal server error",\n  "message": "unexpected failure processing request"\n}',
    },
  },
  {
    method: 'GET',
    path: '/api/v1/zones/list',
    description: 'catalog of monitoring regions available to public api clients.',
    auth: false,
    cache: 'public, max-age=3600, stale-while-revalidate=86400',
    params: [],
    responseFields: [
      { name: 'zone', type: 'string', description: 'monitoring region id' },
      { name: 'zoneName', type: 'string', description: 'human readable region name' },
    ],
    examples: {
      200: '[\n  {\n    "zone": "downtown_core",\n    "zoneName": "Downtown Core"\n  },\n  {\n    "zone": "west_harbour",\n    "zoneName": "West Harbour"\n  }\n]',
      400: '{\n  "error": "invalid request"\n}',
      500: '{\n  "error": "internal server error",\n  "message": "unexpected failure processing request"\n}',
    },
  },
  {
    method: 'GET',
    path: '/api/v1/zones/{zoneId}/current',
    auth: true,
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
    examples: {
      200: '{\n  "zone": "downtown_core",\n  "zoneName": "Downtown Core",\n  "aqi": 88,\n  "aqiLabel": "moderate",\n  "temperature": 22.3,\n  "humidity": 61.0,\n  "noiseLevel": 48.7,\n  "lastUpdated": "2026-03-20T14:30:00Z",\n  "freshnessSeconds": 180\n}',
      400: '{\n  "error": "not found",\n  "message": "zone not found"\n}',
      401: '{\n  "error": "unauthorized",\n  "message": "valid bearer token required"\n}',
      500: '{\n  "error": "internal server error",\n  "message": "unexpected failure processing request"\n}',
    },
  },
  {
    method: 'GET',
    path: '/api/v1/zones/{zoneId}/history',
    auth: true,
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
        description: 'lookback window (1-720)',
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
    examples: {
      200: '[\n  {\n    "zone": "downtown_core",\n    "zoneName": "Downtown Core",\n    "metricType": "temperature",\n    "aggregationType": "5m_avg",\n    "time": "2026-03-20T14:00:00Z",\n    "value": 22.3,\n    "sampleCount": 12\n  }\n]',
      400: '{\n  "error": "bad request",\n  "message": "invalid metric type"\n}',
      401: '{\n  "error": "unauthorized",\n  "message": "valid bearer token required"\n}',
      500: '{\n  "error": "internal server error",\n  "message": "unexpected failure processing request"\n}',
    },
  },
  {
    method: 'GET',
    path: '/api/v1/rankings',
    auth: true,
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
        description: 'lookback window (1-720)',
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
    examples: {
      200: '[\n  {\n    "zone": "downtown_core",\n    "zoneName": "Downtown Core",\n    "metricType": "air_quality",\n    "stat": "current",\n    "value": 88,\n    "aggregationType": "5m_avg",\n    "windowHours": 24,\n    "lastUpdated": "2026-03-20T14:30:00Z"\n  }\n]',
      400: '{\n  "error": "bad request",\n  "message": "invalid metric type"\n}',
      401: '{\n  "error": "unauthorized",\n  "message": "valid bearer token required"\n}',
      500: '{\n  "error": "internal server error",\n  "message": "unexpected failure processing request"\n}',
    },
  },
  {
    method: 'GET',
    path: '/api/v1/metrics',
    auth: true,
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
    examples: {
      200: '[\n  {\n    "metricType": "temperature",\n    "label": "Temperature",\n    "unit": "c",\n    "description": "ambient temperature in celsius",\n    "supportedAggregations": ["5m_avg"],\n    "updateCadenceSeconds": 300\n  }\n]',
      400: '{\n  "error": "invalid request"\n}',
      401: '{\n  "error": "unauthorized",\n  "message": "valid bearer token required"\n}',
      500: '{\n  "error": "internal server error",\n  "message": "unexpected failure processing request"\n}',
    },
  },
  {
    method: 'GET',
    path: '/api/v1/status',
    auth: true,
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
    examples: {
      200: '{\n  "generatedAt": "2026-03-20T14:30:00Z",\n  "aggregationType": "5m_avg",\n  "zonesTotal": 10,\n  "zonesReporting": 8,\n  "zonesAwaitingTelemetry": ["zone_a", "zone_b"],\n  "latestAggregateAt": "2026-03-20T14:25:00Z",\n  "oldestAggregateAt": "2026-03-19T14:25:00Z"\n}',
      400: '{\n  "error": "invalid request"\n}',
      401: '{\n  "error": "unauthorized",\n  "message": "valid bearer token required"\n}',
      500: '{\n  "error": "internal server error",\n  "message": "unexpected failure processing request"\n}',
    },
  },
]

type ResponseState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; code: number; bytes: number; body: string }
  | { status: 'error'; code: number; body: string }

export function ApiExplorer() {
  const [token, setToken] = useState('')

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="api-token">
          bearer token
        </label>
        <input
          className="mt-1.5 h-8 w-full rounded border border-border bg-background px-2 font-mono text-xs outline-none focus:border-foreground/30"
          id="api-token"
          onChange={e => setToken(e.target.value)}
          placeholder="sk-scemas-..."
          type="text"
          value={token}
        />
        <p className="mt-1 text-[11px] text-muted-foreground/50">
          generate a token from the dashboard under api tokens. `/api/v1/zones/aqi` and
          `/api/v1/openapi` are public, everything else here expects `authorization: bearer
          sk-scemas-...`.
        </p>
      </div>
      {ENDPOINTS.map(endpoint => (
        <EndpointSection endpoint={endpoint} key={endpoint.path} token={token} />
      ))}
    </div>
  )
}

function EndpointSection({ endpoint, token }: { endpoint: EndpointDef; token: string }) {
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
      const headers: Record<string, string> = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      const res = await fetch(fullUrl, { headers })
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
  }, [fullUrl, token])

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
        {endpoint.auth && !token ? (
          <span
            className="shrink-0 rounded-md bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400"
            title="enter a bearer token above to try this endpoint"
          >
            not authenticated
          </span>
        ) : (
          <button
            className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-50 active:scale-[0.96]"
            disabled={!canSend}
            onClick={sendRequest}
            type="button"
          >
            {response.status === 'loading' ? 'sending...' : 'try it'}
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{endpoint.description}</p>
      <p className="text-[11px] text-muted-foreground/50">
        cache: <code className="text-[0.65rem]">{endpoint.cache}</code>
      </p>

      {/* params */}
      {endpoint.params.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">parameters</h4>
          <div className="grid grid-cols-[10rem_1fr] items-center gap-x-2 gap-y-2">
            {endpoint.params.map(param => (
              <Fragment key={param.name}>
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
              </Fragment>
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
      <ResponsePanel endpoint={endpoint} response={response} />
    </div>
  )
}

const PUBLIC_STATUS_TABS = [200, 400, 500] as const
const AUTHENTICATED_STATUS_TABS = [200, 400, 401, 500] as const

function ResponsePanel({ endpoint, response }: { endpoint: EndpointDef; response: ResponseState }) {
  const [exampleTab, setExampleTab] = useState<200 | 400 | 401 | 500>(200)
  const hasLive = response.status === 'success' || response.status === 'error'
  const statusTabs = endpoint.auth ? AUTHENTICATED_STATUS_TABS : PUBLIC_STATUS_TABS

  const exampleBody = endpoint.auth
    ? endpoint.examples[exampleTab]
    : endpoint.examples[exampleTab === 401 ? 200 : exampleTab]

  const lineCount = endpoint.examples[200].split('\n').length
  const panelHeight = `${Math.max(lineCount + 2, 6) * 1.25}rem`

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {/* example responses */}
      <div className="overflow-hidden rounded-md border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
          <h4 className="text-[11px] font-medium text-muted-foreground">response</h4>
          <div className="flex items-center gap-1">
            {statusTabs.map(code => {
              const isActive = exampleTab === code
              const codeColor =
                code < 300
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : code < 500
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
              return (
                <button
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                    isActive
                      ? `bg-muted ${codeColor}`
                      : 'text-muted-foreground/50 hover:text-muted-foreground'
                  }`}
                  key={code}
                  onClick={() => setExampleTab(code)}
                  type="button"
                >
                  {code}
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ height: panelHeight }}>
          <pre className="h-full overflow-auto p-3 font-mono text-xs leading-relaxed text-foreground/80">
            {exampleBody}
          </pre>
        </div>
      </div>

      {/* live response */}
      <div className="overflow-hidden rounded-md border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
          <h4 className="text-[11px] font-medium text-muted-foreground">live</h4>
          {hasLive ? (
            <div className="flex items-center gap-2 text-[11px]">
              {response.status === 'success' ? (
                <span className="text-muted-foreground">
                  {response.bytes >= 1024
                    ? `${(response.bytes / 1024).toFixed(1)}kb`
                    : `${response.bytes}b`}
                </span>
              ) : null}
              <span className={response.status === 'success' ? 'text-emerald-600' : 'text-red-600'}>
                {(response as { code: number }).code}
              </span>
            </div>
          ) : null}
        </div>
        <div className="relative" style={{ height: panelHeight }}>
          {response.status === 'idle' ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-xs text-muted-foreground/40">click "try it" to send a request</p>
            </div>
          ) : response.status === 'loading' ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-xs text-muted-foreground">loading...</span>
            </div>
          ) : (
            <>
              <div className="absolute right-2 top-2 z-10">
                <CopyButton value={response.body} />
              </div>
              <pre className="h-full overflow-auto p-3 pr-14 font-mono text-xs leading-relaxed text-foreground/80">
                {response.body}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
