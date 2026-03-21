'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Map, { Marker, Popup, type MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { formatZoneName, hamiltonMonitoringRegions } from '@/lib/zones'

type SensorPin = {
  sensorId: string
  assetId: string
  stationId: string
  displayName: string
  siteName: string
  siteProfile: string
  placement: string
  provider: string
  wardId: string
  wardLabel: string
  hostPlanningUnitId: string
  hostPlanningUnitLabel: string
  community: string
  focusArea: string
  telemetryUnit: string
  samplingIntervalSeconds: number
  regionWardLabels: string[]
  regionNeighbourhoods: string[]
  zone: string
  lat: number
  lng: number
  metricType: string
  value: number
}

type ZoneMapProps = { sensors: SensorPin[]; alertCounts: Record<string, number> }

export type { SensorPin }

type ProjectedPoint = { x: number; y: number }

type ProjectedRegion = {
  zoneId: string
  label: string
  path: string
  labelPoint: ProjectedPoint
  alertCount: number
}

type ProjectedOverlay = { width: number; height: number; regions: ProjectedRegion[] }

const LABEL_CHAR_WIDTH = 6.6
const LABEL_PADDING_X = 8
const LABEL_PADDING_Y = 4
const LABEL_FONT_SIZE = 11
const LABEL_HEIGHT = LABEL_FONT_SIZE + LABEL_PADDING_Y * 2
const LABEL_RADIUS = 4

function estimateLabelWidth(text: string): number {
  return text.length * LABEL_CHAR_WIDTH + LABEL_PADDING_X * 2
}

type LayerVisibility = { sensors: boolean; zones: boolean }

export function ZoneMap({ sensors, alertCounts }: ZoneMapProps) {
  const [selected, setSelected] = useState<SensorPin | null>(null)
  const [hoveredZone, setHoveredZone] = useState<string | null>(null)
  const [layers, setLayers] = useState<LayerVisibility>({ sensors: true, zones: false })
  const [projectedOverlay, setProjectedOverlay] = useState<ProjectedOverlay | null>(null)
  const mapRef = useRef<MapRef | null>(null)

  const reproject = useCallback(() => {
    setProjectedOverlay(buildProjectedOverlay(mapRef.current, alertCounts))
  }, [alertCounts])

  useEffect(() => {
    reproject()
  }, [reproject])

  return (
    <div className="h-100 overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative h-full w-full">
        <Map
          attributionControl={false}
          initialViewState={{ longitude: -79.878, latitude: 43.241, zoom: 10.2 }}
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
          style={{ width: '100%', height: '100%' }}
          ref={mapRef}
          onLoad={e => {
            const map = e.target
            for (const layer of map.getStyle().layers ?? []) {
              if (layer.type === 'symbol') {
                map.setLayoutProperty(layer.id, 'visibility', 'none')
              }
            }
            map.fitBounds(
              [
                [-80.02, 43.195],
                [-79.735, 43.285],
              ],
              { padding: 24, duration: 0 },
            )
            reproject()
          }}
          onMove={reproject}
          onResize={reproject}
        >
          {layers.sensors
            ? sensors.map(sensor => {
                const zoneAlerts = alertCounts[sensor.zone] ?? 0
                return (
                  <Marker
                    key={sensor.sensorId}
                    longitude={sensor.lng}
                    latitude={sensor.lat}
                    onClick={e => {
                      e.originalEvent.stopPropagation()
                      setSelected(sensor)
                    }}
                  >
                    <div
                      className="size-3 cursor-pointer rounded-full border-2 border-white shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
                      tabIndex={0}
                      role="button"
                      aria-label={`${sensor.displayName}: ${sensor.value} ${sensor.telemetryUnit}`}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelected(sensor)
                        }
                      }}
                      style={{
                        backgroundColor:
                          zoneAlerts > 0
                            ? 'var(--color-severity-critical)'
                            : 'var(--color-severity-low)',
                      }}
                    />
                  </Marker>
                )
              })
            : null}

          {selected && layers.sensors && (
            <Popup
              longitude={selected.lng}
              latitude={selected.lat}
              onClose={() => setSelected(null)}
              closeOnClick={false}
              className="sensor-popup"
            >
              <div className="space-y-1 pr-4 text-xs" role="dialog" aria-label={`${selected.displayName} sensor details`}>
                <p className="font-medium">{selected.displayName}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {selected.sensorId} · {selected.assetId}
                </p>
                <p>
                  {selected.metricType.replaceAll('_', ' ')}:{' '}
                  <span className="font-mono tabular-nums">{selected.value}</span>{' '}
                  <span className="text-muted-foreground">{selected.telemetryUnit}</span>
                </p>
                <p className="text-muted-foreground">{selected.siteName}</p>
                <p className="text-muted-foreground">
                  {selected.siteProfile.replaceAll('_', ' ')}, {selected.placement}, sampled every{' '}
                  {selected.samplingIntervalSeconds}s
                </p>
                <p className="text-muted-foreground">{selected.provider}</p>
                <p className="text-muted-foreground">
                  {formatZoneName(selected.zone, 'lower', selected.sensorId)}
                </p>
                <p className="text-muted-foreground">
                  {selected.community.toLowerCase()} · {selected.focusArea}
                </p>
                <p className="text-muted-foreground">
                  station {selected.stationId}, {selected.wardLabel}, planning unit{' '}
                  {selected.hostPlanningUnitId} {selected.hostPlanningUnitLabel}
                </p>
                <p className="text-muted-foreground">
                  region spans {selected.regionWardLabels.join(', ')} across{' '}
                  {selected.regionNeighbourhoods.join(', ')}
                </p>
              </div>
            </Popup>
          )}
        </Map>

        {layers.zones && projectedOverlay ? (
          <svg
            role="group"
            aria-label="hamilton monitoring regions"
            className="absolute inset-0"
            viewBox={`0 0 ${projectedOverlay.width} ${projectedOverlay.height}`}
            preserveAspectRatio="none"
            style={{ pointerEvents: 'none' }}
          >
            {projectedOverlay.regions.map(region => {
              const isHovered = hoveredZone === region.zoneId
              const hasAlerts = region.alertCount > 0
              const labelWidth = estimateLabelWidth(region.label)

              return (
                <g key={region.zoneId}>
                  <path
                    d={region.path}
                    fill={
                      hasAlerts ? 'var(--color-severity-warning)' : 'var(--color-scemas-lavender)'
                    }
                    fillOpacity={isHovered ? 0.35 : hasAlerts ? 0.22 : 0.18}
                    stroke={
                      hasAlerts ? 'var(--color-severity-warning)' : 'var(--color-scemas-lavender)'
                    }
                    strokeLinejoin="round"
                    strokeOpacity={isHovered ? 1 : 0.8}
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    tabIndex={0}
                    role="button"
                    aria-label={region.label}
                    style={{
                      pointerEvents: 'fill',
                      cursor: 'pointer',
                      transition:
                        'fill-opacity 150ms ease-out, stroke-opacity 150ms ease-out, stroke-width 150ms ease-out',
                    }}
                    onMouseEnter={() => setHoveredZone(region.zoneId)}
                    onMouseLeave={() => setHoveredZone(null)}
                    onFocus={() => setHoveredZone(region.zoneId)}
                    onBlur={() => setHoveredZone(null)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setHoveredZone(region.zoneId)
                      }
                    }}
                  />
                  <g
                    opacity={isHovered ? 1 : 0}
                    style={{ pointerEvents: 'none', transition: 'opacity 150ms ease-out' }}
                  >
                    <rect
                      fill="var(--color-card)"
                      fillOpacity={0.92}
                      height={LABEL_HEIGHT}
                      rx={LABEL_RADIUS}
                      ry={LABEL_RADIUS}
                      stroke="var(--color-border)"
                      strokeOpacity={0.6}
                      strokeWidth={1}
                      width={labelWidth}
                      x={region.labelPoint.x - labelWidth / 2}
                      y={region.labelPoint.y - LABEL_HEIGHT / 2}
                    />
                    <text
                      dominantBaseline="central"
                      fill="var(--color-foreground)"
                      fontFamily="var(--font-sans, ui-sans-serif, system-ui, sans-serif)"
                      fontSize={LABEL_FONT_SIZE}
                      fontWeight="500"
                      style={{ pointerEvents: 'none' }}
                      textAnchor="middle"
                      x={region.labelPoint.x}
                      y={region.labelPoint.y}
                    >
                      {region.label}
                    </text>
                  </g>
                </g>
              )
            })}
          </svg>
        ) : null}

        <div className="absolute bottom-3 left-3 flex gap-1">
          <LayerToggle
            active={layers.sensors}
            label="sensors"
            onToggle={() => {
              setLayers(prev => ({ ...prev, sensors: !prev.sensors }))
              if (layers.sensors) setSelected(null)
            }}
          />
          <LayerToggle
            active={layers.zones}
            label="regions"
            onToggle={() => {
              setLayers(prev => ({ ...prev, zones: !prev.zones }))
              if (layers.zones) setHoveredZone(null)
            }}
          />
        </div>
      </div>
    </div>
  )
}

function LayerToggle({
  active,
  label,
  onToggle,
}: {
  active: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-border bg-card text-foreground shadow-sm'
          : 'border-transparent bg-card/60 text-muted-foreground'
      }`}
      onClick={onToggle}
      type="button"
    >
      {label}
    </button>
  )
}

function buildProjectedOverlay(
  mapRef: MapRef | null,
  alertCounts: Record<string, number>,
): ProjectedOverlay | null {
  if (!mapRef) {
    return null
  }

  const map = mapRef.getMap()
  const canvas = map.getCanvas()
  const width = canvas.clientWidth
  const height = canvas.clientHeight

  if (width === 0 || height === 0) {
    return null
  }

  const regions: ProjectedRegion[] = []

  for (const feature of hamiltonMonitoringRegions.features) {
    const pathSegments: string[] = []
    const projectedOutlinePoints: ProjectedPoint[] = []

    for (const polygon of feature.geometry.coordinates) {
      for (const ring of polygon) {
        const projectedRing = ring.map(point => projectLngLat(mapRef, point))
        if (projectedRing.length < 3) {
          continue
        }

        pathSegments.push(buildPathSegment(projectedRing))
        projectedOutlinePoints.push(...projectedRing)
      }
    }

    if (pathSegments.length === 0 || projectedOutlinePoints.length === 0) {
      continue
    }

    regions.push({
      zoneId: feature.properties.zoneId,
      label: feature.properties.label,
      path: pathSegments.join(' '),
      labelPoint: centerOfProjectedBounds(projectedOutlinePoints),
      alertCount: alertCounts[feature.properties.zoneId] ?? 0,
    })
  }

  return { width, height, regions }
}

function projectLngLat(mapRef: MapRef, point: number[]): ProjectedPoint {
  const projectedPoint = mapRef.project([point[0], point[1]])
  return { x: projectedPoint.x, y: projectedPoint.y }
}

function buildPathSegment(points: ProjectedPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
    .concat(' Z')
}

function centerOfProjectedBounds(points: ProjectedPoint[]): ProjectedPoint {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }

  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}
