// CityOperatorAgent main dashboard view
// shows: metric KPIs, region metrics chart, sensor feed, alert frequency, active alerts
// this is the primary Presentation component for the operator agent

import { alerts, hazardReports } from '@scemas/db/schema'
import { count, desc, eq } from 'drizzle-orm'
import { Suspense } from 'react'
import { ZoneMap, type SensorPin } from '@/components/map/zone-map'
import { Spinner } from '@/components/ui/spinner'
import { sensorCatalog, type SensorCatalogEntry } from '@/lib/sensor-catalog'
import { formatZoneName, normalizeZoneId } from '@/lib/zones'
import { getDb, getManager } from '@/server/cached'
import { DashboardChartsPanel, AlertFrequencyPanel } from './dashboard-charts'
import { PaginatedSensorFeed, PaginatedAlertFeed } from './dashboard-lists'

const LATEST_SENSOR_LIMIT = Math.max(200, sensorCatalog.length)
const sensorCatalogById = new Map(sensorCatalog.map(sensor => [sensor.sensor_id, sensor]))

export default function OperatorDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-balance">operator dashboard</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          real-time telemetry, sensor coverage, and active alert monitoring across mapped hamilton
          monitoring regions
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Suspense fallback={<MetricCardsSkeleton />}>
          <MetricCards />
        </Suspense>
      </div>

      <Suspense fallback={<ChartSkeleton label="loading region metrics" />}>
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

      <Suspense fallback={null}>
        <HazardReportsSummary />
      </Suspense>

      <AlertFrequencyPanel />
    </div>
  )
}

async function DashboardChartsPanelWrapper() {
  const manager = getManager()
  const readings = await manager.getLatestSensorReadings(LATEST_SENSOR_LIMIT)
  const zones = Array.from(new Set(readings.map(r => r.zone))).toSorted()
  if (zones.length === 0) return null
  return <DashboardChartsPanel availableZones={zones} />
}

async function ZoneMapWrapper() {
  const manager = getManager()
  const db = getDb()

  const positions: SensorCatalogEntry[] = sensorCatalog
  const latestReadings = await manager.getLatestSensorReadings(LATEST_SENSOR_LIMIT)
  const activeAlerts = await db.query.alerts.findMany({ where: eq(alerts.status, 'active') })

  const alertCountsByZone: Record<string, number> = {}
  for (const alert of activeAlerts) {
    const zoneId = normalizeZoneId(alert.zone, alert.sensorId)
    alertCountsByZone[zoneId] = (alertCountsByZone[zoneId] ?? 0) + 1
  }

  const readingsMap = new Map(latestReadings.map(r => [r.sensorId, r]))
  const sensors: SensorPin[] = positions.map(pos => {
    const reading = readingsMap.get(pos.sensor_id)
    return {
      sensorId: pos.sensor_id,
      assetId: pos.asset_id,
      stationId: pos.station_id,
      displayName: pos.display_name,
      siteName: pos.site_name,
      placement: pos.placement,
      provider: pos.provider,
      siteProfile: pos.site_profile,
      wardId: pos.ward_id,
      wardLabel: pos.ward_label,
      hostPlanningUnitId: pos.host_planning_unit_id,
      hostPlanningUnitLabel: pos.host_planning_unit_label,
      community: pos.tracking.community,
      focusArea: pos.tracking.focus_area,
      telemetryUnit: pos.telemetry_unit,
      samplingIntervalSeconds: pos.sampling_interval_seconds,
      regionWardLabels: pos.tracking.ward_labels,
      regionNeighbourhoods: pos.tracking.neighbourhoods,
      zone: pos.zone,
      lat: pos.lat,
      lng: pos.lng,
      metricType: pos.device_type,
      value: reading?.value ?? 0,
    }
  })

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">sensor map by monitoring region</h2>
        <p className="text-xs text-muted-foreground">
          polygon boundaries are grouped from hamilton&apos;s official planning-unit layer
        </p>
      </div>
      <ZoneMap sensors={sensors} alertCounts={alertCountsByZone} />
    </div>
  )
}

async function SensorCoveragePanel() {
  const manager = getManager()
  const latestReadings = await manager.getLatestSensorReadings(LATEST_SENSOR_LIMIT)
  const coveredRegions = new Set(
    latestReadings.map(reading => normalizeZoneId(reading.zone, reading.sensorId)),
  ).size
  const stations = new Set<string>()
  const wards = new Set<string>()
  const planningUnits = new Set<string>()
  for (const sensor of sensorCatalog) {
    stations.add(sensor.station_id)
    wards.add(sensor.ward_id)
    planningUnits.add(sensor.host_planning_unit_id)
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-medium">live sensor feed</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">{latestReadings.length}</span> streams across{' '}
          <span className="font-mono tabular-nums">{coveredRegions}</span> regions
        </p>
        <p className="text-xs text-muted-foreground">
          network catalog: <span className="font-mono tabular-nums">{sensorCatalog.length}</span>{' '}
          sensors, <span className="font-mono tabular-nums">{stations.size}</span> stations,{' '}
          <span className="font-mono tabular-nums">{wards.size}</span> wards,{' '}
          <span className="font-mono tabular-nums">{planningUnits.size}</span> planning units
        </p>
      </div>
      <PaginatedSensorFeed
        items={latestReadings.slice(0, 12).map(reading => {
          const sensor = sensorCatalogById.get(reading.sensorId)
          return {
            key: `${reading.sensorId}-${reading.time.toISOString()}`,
            displayName: sensor?.display_name ?? reading.sensorId,
            regionLabel: sensor?.region_label ?? formatZoneName(reading.zone),
            wardLabel: sensor?.ward_label ?? 'ward n/a',
            metricType: reading.metricType,
            value: reading.value,
          }
        })}
      />
    </div>
  )
}

async function MetricCards() {
  const manager = getManager()
  const latestReadings = await manager.getLatestSensorReadings(LATEST_SENSOR_LIMIT)
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
    limit: 16,
  })

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-medium">active alerts</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">{activeAlerts.length}</span> unresolved
        </p>
      </div>
      <PaginatedAlertFeed
        items={activeAlerts.map(alert => ({
          id: alert.id,
          severity: alert.severity,
          zone: formatZoneName(alert.zone, 'lower', alert.sensorId),
          metricType: alert.metricType,
          triggeredValue: alert.triggeredValue,
        }))}
      />
    </div>
  )
}

async function HazardReportsSummary() {
  const db = getDb()

  const rows = await db
    .select({ status: hazardReports.status, count: count() })
    .from(hazardReports)
    .groupBy(hazardReports.status)

  const pending = rows.find(r => r.status === 'pending')?.count ?? 0
  const reviewing = rows.find(r => r.status === 'reviewing')?.count ?? 0

  if (pending === 0 && reviewing === 0) return null

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">hazard reports</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{pending}</span> pending,{' '}
        <span className="font-mono tabular-nums">{reviewing}</span> under review
      </p>
    </div>
  )
}

function MapSkeleton() {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-border bg-card p-4"
      style={{ height: 400 }}
    >
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
