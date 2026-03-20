// CityOperatorAgent main dashboard view
// shows: metric KPIs, zone metrics chart, sensor feed, alert frequency, active alerts
// this is the primary Presentation component for the operator agent

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Suspense } from 'react'
import { alerts } from '@scemas/db/schema'
import { desc, eq } from 'drizzle-orm'

import { ZoneMap, type SensorPin } from '@/components/map/zone-map'
import { SeverityBadge } from '@/components/ui/severity-badge'
import { Spinner } from '@/components/ui/spinner'
import { getDb, getManager } from '@/server/cached'
import { DashboardChartsPanel, AlertFrequencyPanel } from './dashboard-charts'

type SensorPosition = {
  sensor_id: string
  device_type: string
  zone: string
  lat: number
  lng: number
}

function loadSensorPositions(): SensorPosition[] {
  const filePath = join(process.cwd(), '../../data/hamilton-sensors.json')
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

export default function OperatorDashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-balance">operator dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Suspense fallback={<MetricCardsSkeleton />}>
          <MetricCards />
        </Suspense>
      </div>

      <Suspense fallback={<ChartSkeleton label="loading zone metrics" />}>
        <DashboardChartsPanelWrapper />
      </Suspense>

      <Suspense fallback={<MapSkeleton />}>
        <ZoneMapWrapper />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<SensorCoverageSkeleton />}>
          <SensorCoveragePanel />
        </Suspense>
        <Suspense fallback={<AlertsSkeleton />}>
          <ActiveAlertsPanel />
        </Suspense>
      </div>

      <AlertFrequencyPanel />
    </div>
  )
}

async function DashboardChartsPanelWrapper() {
  const manager = getManager()
  const readings = await manager.getLatestSensorReadings(100)
  const zones = Array.from(new Set(readings.map(r => r.zone))).sort()
  if (zones.length === 0) return null
  return <DashboardChartsPanel availableZones={zones} />
}

async function ZoneMapWrapper() {
  const manager = getManager()
  const db = getDb()

  const positions = loadSensorPositions()
  const latestReadings = await manager.getLatestSensorReadings(100)
  const activeAlerts = await db.query.alerts.findMany({
    where: eq(alerts.status, 'active'),
  })

  const alertCountsByZone: Record<string, number> = {}
  for (const alert of activeAlerts) {
    alertCountsByZone[alert.zone] = (alertCountsByZone[alert.zone] ?? 0) + 1
  }

  const readingsMap = new Map(latestReadings.map(r => [r.sensorId, r]))
  const sensors: SensorPin[] = positions.map(pos => {
    const reading = readingsMap.get(pos.sensor_id)
    return {
      sensorId: pos.sensor_id,
      zone: pos.zone,
      lat: pos.lat,
      lng: pos.lng,
      metricType: pos.device_type,
      value: reading?.value ?? 0,
    }
  })

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">sensor map</h2>
      <ZoneMap sensors={sensors} alertCounts={alertCountsByZone} />
    </div>
  )
}

async function SensorCoveragePanel() {
  const manager = getManager()
  const latestReadings = await manager.getLatestSensorReadings(100)
  const coveredZones = new Set(latestReadings.map(reading => reading.zone)).size

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">live sensor feed</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{latestReadings.length}</span> streams across{' '}
        <span className="font-mono tabular-nums">{coveredZones}</span> zones
      </p>
      <div className="mt-4 max-h-80 space-y-1.5 overflow-y-auto text-sm text-muted-foreground">
        {latestReadings.slice(0, 12).map(reading => (
          <p className="flex items-baseline justify-between gap-2" key={`${reading.sensorId}-${reading.time.toISOString()}`}>
            <span className="truncate">{reading.sensorId}</span>
            <span className="shrink-0 font-mono tabular-nums">
              {reading.metricType.replaceAll('_', ' ')} <span className="text-foreground">{reading.value}</span>
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}

async function MetricCards() {
  const manager = getManager()
  const latestReadings = await manager.getLatestSensorReadings(100)
  const metricSummary = summarizeLatestMetrics(latestReadings)

  return (
    <>
      {metricSummary.map(metric => (
        <div key={metric.key} className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{metric.label}</p>
          <p className="font-mono text-2xl tabular-nums">{metric.value}</p>
        </div>
      ))}
    </>
  )
}

async function ActiveAlertsPanel() {
  const db = getDb()
  const activeAlerts = await db.query.alerts.findMany({
    where: eq(alerts.status, 'active'),
    orderBy: [desc(alerts.createdAt)],
    limit: 8,
  })

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">active alerts</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{activeAlerts.length}</span> unresolved
      </p>
      {activeAlerts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">no active alerts right now</p>
      ) : (
        <div className="mt-4 max-h-80 space-y-1.5 overflow-y-auto text-sm">
          {activeAlerts.map(alert => (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2" key={alert.id}>
              <span className="flex items-center gap-2">
                <SeverityBadge severity={alert.severity} />
                <span className="truncate font-medium">{alert.zone}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {alert.metricType.replaceAll('_', ' ')} at{' '}
                <span className="font-mono tabular-nums">{alert.triggeredValue}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MapSkeleton() {
  return (
    <div className="flex items-center justify-center rounded-lg border border-border bg-card p-4" style={{ height: 400 }}>
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        loading sensor map
      </span>
    </div>
  )
}

function SensorCoverageSkeleton() {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-lg border border-border bg-card p-4">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        loading sensor feed
      </span>
    </div>
  )
}

function MetricCardsSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-lg border border-border bg-card" />
      ))}
    </>
  )
}

function AlertsSkeleton() {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-lg border border-border bg-card p-4">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        loading alerts
      </span>
    </div>
  )
}

function ChartSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-80 items-center justify-center rounded-lg border border-border bg-card p-4">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {label}
      </span>
    </div>
  )
}

function summarizeLatestMetrics(
  latestReadings: Awaited<ReturnType<ReturnType<typeof getManager>['getLatestSensorReadings']>>,
) {
  const metrics = new Map<string, { total: number; count: number }>()

  for (const reading of latestReadings) {
    const aggregate = metrics.get(reading.metricType) ?? { total: 0, count: 0 }
    aggregate.total += reading.value
    aggregate.count += 1
    metrics.set(reading.metricType, aggregate)
  }

  return [
    formatMetricSummary('temperature', 'temperature', metrics.get('temperature')),
    formatMetricSummary('humidity', 'humidity', metrics.get('humidity')),
    formatMetricSummary('air_quality', 'air quality', metrics.get('air_quality')),
    formatMetricSummary('noise_level', 'noise level', metrics.get('noise_level')),
  ]
}

function formatMetricSummary(
  metricKey: string,
  label: string,
  summary: { total: number; count: number } | undefined,
) {
  if (!summary || summary.count === 0) {
    return { key: metricKey, label, value: '--' }
  }

  const average = Math.round((summary.total / summary.count) * 10) / 10
  return { key: metricKey, label, value: `${average}` }
}
